import type OpenAI from "openai"
import type { ProviderRuntime, ChannelCallbacks } from "../core"
import { emitNervesEvent } from "../../nerves/runtime"

export interface SpecialistReadline {
  question: (prompt: string) => Promise<string>
  close: () => void
}

export interface SpecialistSessionDeps {
  providerRuntime: ProviderRuntime
  systemPrompt: string
  tools: OpenAI.ChatCompletionFunctionTool[]
  execTool: (name: string, args: Record<string, string>) => Promise<string>
  readline: SpecialistReadline
  callbacks: ChannelCallbacks
  signal?: AbortSignal
}

export interface SpecialistSessionResult {
  hatchedAgentName: string | null
}

/**
 * Run the specialist conversation session loop.
 *
 * The loop:
 * 1. Initialize messages with system prompt
 * 2. Prompt user -> add to messages -> call streamTurn -> process result
 * 3. If result has no tool calls: push assistant message, re-prompt
 * 4. If result has final_answer sole call: extract answer, emit via callbacks, done
 * 5. If result has other tool calls: execute each, push tool results, continue loop
 * 6. On abort signal: clean exit
 * 7. Return { hatchedAgentName } -- name from hatch_agent if called
 */
export async function runSpecialistSession(
  deps: SpecialistSessionDeps,
): Promise<SpecialistSessionResult> {
  const { providerRuntime, systemPrompt, tools, execTool, readline, callbacks, signal } = deps

  emitNervesEvent({
    component: "daemon",
    event: "daemon.specialist_session_start",
    message: "starting specialist session loop",
    meta: {},
  })

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ]

  let hatchedAgentName: string | null = null
  let done = false

  try {
    while (!done) {
      if (signal?.aborted) break

      // Get user input
      const userInput = await readline.question("> ")
      if (!userInput.trim()) continue

      messages.push({ role: "user", content: userInput })
      providerRuntime.resetTurnState(messages)

      // Inner loop: process tool calls until we get a final_answer or plain text
      let turnDone = false
      while (!turnDone) {
        if (signal?.aborted) {
          done = true
          break
        }

        callbacks.onModelStart()

        const result = await providerRuntime.streamTurn({
          messages,
          activeTools: tools,
          callbacks,
          signal,
        })

        // Build assistant message
        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: "assistant",
        }
        if (result.content) assistantMsg.content = result.content
        if (result.toolCalls.length) {
          assistantMsg.tool_calls = result.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          }))
        }

        if (!result.toolCalls.length) {
          // Plain text response -- push and re-prompt
          messages.push(assistantMsg)
          turnDone = true
          continue
        }

        // Check for final_answer
        const isSoleFinalAnswer =
          result.toolCalls.length === 1 && result.toolCalls[0].name === "final_answer"

        if (isSoleFinalAnswer) {
          let answer: string | undefined
          try {
            const parsed = JSON.parse(result.toolCalls[0].arguments)
            if (typeof parsed === "string") {
              answer = parsed
            } else if (parsed.answer != null) {
              answer = parsed.answer
            }
          } catch {
            // malformed
          }

          if (answer != null) {
            callbacks.onTextChunk(answer)
            messages.push(assistantMsg)
            done = true
            turnDone = true
            continue
          }

          // Malformed final_answer -- ask model to retry
          messages.push(assistantMsg)
          messages.push({
            role: "tool",
            tool_call_id: result.toolCalls[0].id,
            content: "your final_answer was incomplete or malformed. call final_answer again with your complete response.",
          })
          providerRuntime.appendToolOutput(result.toolCalls[0].id, "retry")
          continue
        }

        // Execute tool calls
        messages.push(assistantMsg)
        for (const tc of result.toolCalls) {
          if (signal?.aborted) break

          let args: Record<string, string> = {}
          try {
            args = JSON.parse(tc.arguments)
          } catch {
            // ignore parse error
          }

          callbacks.onToolStart(tc.name, args)

          let toolResult: string
          try {
            toolResult = await execTool(tc.name, args)
          } catch (e) {
            toolResult = `error: ${e}`
          }

          callbacks.onToolEnd(tc.name, tc.name, true)

          // Track hatchling name
          if (tc.name === "hatch_agent" && args.name) {
            hatchedAgentName = args.name
          }

          messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult })
          providerRuntime.appendToolOutput(tc.id, toolResult)
        }
        // After processing tool calls, continue inner loop for tool result processing
      }
    }
  } finally {
    readline.close()
  }

  return { hatchedAgentName }
}
