import OpenAI, { AzureOpenAI } from "openai";
import { getAzureConfig, getMinimaxConfig } from "../config";
import { tools, execTool, summarizeArgs } from "./tools";
import { streamChatCompletion, streamResponsesApi, toResponsesInput, toResponsesTools } from "./streaming";
import type { TurnResult } from "./streaming";

let _client: OpenAI | null = null;
let _model: string | null = null;
let _provider: "azure" | "minimax" | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const azureConfig = getAzureConfig();
    const minimaxConfig = getMinimaxConfig();

    if (azureConfig.apiKey && azureConfig.endpoint && azureConfig.deployment && azureConfig.modelName) {
      _client = new AzureOpenAI({
        apiKey: azureConfig.apiKey,
        endpoint: azureConfig.endpoint.replace(/\/openai.*$/, ""),
        deployment: azureConfig.deployment,
        apiVersion: azureConfig.apiVersion,
        timeout: 30000,
        maxRetries: 0,
      });
      _model = azureConfig.modelName;
      _provider = "azure";
    } else if (minimaxConfig.apiKey) {
      _client = new OpenAI({
        apiKey: minimaxConfig.apiKey,
        baseURL: "https://api.minimaxi.chat/v1",
        timeout: 30000,
        maxRetries: 0,
      });
      _model = minimaxConfig.model;
      _provider = "minimax";
    } else {
      console.error(
        "no provider configured. set azure or minimax credentials in config.json or env vars.",
      );
      process.exit(1);
    }
  }
  return _client;
}

export function getModel(): string {
  if (_model === null) getClient(); // ensure initialized
  return _model!;
}

export function getProvider(): "azure" | "minimax" {
  if (_provider === null) getClient(); // ensure initialized
  return _provider!;
}

// Re-export tools, execTool, summarizeArgs from ./tools for backward compat
export { tools, execTool, summarizeArgs } from "./tools";
// Re-export streaming functions for backward compat
export { streamChatCompletion, streamResponsesApi, toResponsesInput, toResponsesTools } from "./streaming";
export type { TurnResult } from "./streaming";

// Re-export prompt functions for backward compat
export { isOwnCodebase, buildSystem } from "../mind/prompt";
export type { Channel } from "../mind/prompt";

export interface ChannelCallbacks {
  onModelStart(): void;
  onModelStreamStart(): void;
  onTextChunk(text: string): void;
  onReasoningChunk(text: string): void;
  onToolStart(name: string, args: Record<string, string>): void;
  onToolEnd(name: string, summary: string, success: boolean): void;
  onError(error: Error): void;
}

export const MAX_TOOL_ROUNDS = 10;

// Remove orphan tool_calls from the last assistant message and any
// trailing tool-result messages that lack a matching tool_call.
// This keeps the conversation valid after an abort or tool-loop limit.
export function stripLastToolCalls(
  messages: OpenAI.ChatCompletionMessageParam[],
): void {
  // Pop any trailing tool-result messages
  while (messages.length && messages[messages.length - 1].role === "tool") {
    messages.pop();
  }
  // Strip tool_calls from the last assistant message
  const last = messages[messages.length - 1] as any;
  if (last?.role === "assistant" && last.tool_calls) {
    delete last.tool_calls;
    // If the assistant message is now empty, remove it entirely
    if (!last.content) messages.pop();
  }
}

export async function runAgent(
  messages: OpenAI.ChatCompletionMessageParam[],
  callbacks: ChannelCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const client = getClient();
  const provider = getProvider();
  const model = getModel();
  let done = false;
  let toolRounds = 0;

  // For Azure Responses API: maintain native input array with original output
  // items (reasoning, function_calls) in correct order.  Initialized from CC
  // messages on first iteration (session resumption), then kept in sync with
  // the API's own output items for accurate multi-turn tool loops.
  let azureInput: any[] | null = null;
  let azureInstructions = "";

  // Prevent MaxListenersExceeded warning — each iteration adds a listener
  try { require("events").setMaxListeners(MAX_TOOL_ROUNDS + 5, signal); } catch { /* unsupported */ }

  while (!done) {
    // Yield so pending I/O (stdin Ctrl-C) can be processed between iterations
    await new Promise((r) => setImmediate(r));
    if (signal?.aborted) break;
    try {
      callbacks.onModelStart();

      let result: TurnResult;

      if (provider === "azure") {
        // First iteration: build from CC messages (handles session resumption)
        if (!azureInput) {
          const { instructions, input } = toResponsesInput(messages);
          azureInput = input;
          azureInstructions = instructions;
        }
        result = await streamResponsesApi(
          client,
          {
            model,
            input: azureInput,
            instructions: azureInstructions,
            tools: toResponsesTools(tools),
            reasoning: { effort: "medium", summary: "detailed" },
            stream: true,
            store: false,
            include: ["reasoning.encrypted_content"],
          },
          callbacks,
          signal,
        );
        // Append ALL output items (reasoning + function_calls + text) in order
        for (const item of result.outputItems) {
          azureInput.push(item);
        }
      } else {
        const createParams: any = { messages, tools, stream: true };
        if (model) createParams.model = model;
        result = await streamChatCompletion(client, createParams, callbacks, signal);
      }

      // SHARED: build CC-format assistant message from TurnResult
      const msg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: "assistant",
      };
      if (result.content) msg.content = result.content;
      if (result.toolCalls.length)
        msg.tool_calls = result.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
      messages.push(msg);

      if (!result.toolCalls.length) {
        done = true;
      } else {
        toolRounds++;
        if (toolRounds >= MAX_TOOL_ROUNDS) {
          // Strip tool_calls from the assistant message we just pushed so the
          // conversation stays valid (every tool_call needs a tool response).
          stripLastToolCalls(messages);
          callbacks.onError(new Error(`tool loop limit reached (${MAX_TOOL_ROUNDS} rounds)`));
          done = true;
          break;
        }
        // SHARED: execute tools
        for (const tc of result.toolCalls) {
          if (signal?.aborted) break;
          let args: Record<string, string> = {};
          try {
            args = JSON.parse(tc.arguments);
          } catch {
            /* ignore */
          }
          const argSummary = summarizeArgs(tc.name, args);
          callbacks.onToolStart(tc.name, args);
          let toolResult: string;
          let success: boolean;
          try {
            toolResult = await execTool(tc.name, args);
            success = true;
          } catch (e) {
            toolResult = `error: ${e}`;
            success = false;
          }
          callbacks.onToolEnd(tc.name, argSummary, success);
          messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
          // Keep Azure input in sync with tool results
          if (azureInput) {
            azureInput.push({ type: "function_call_output", call_id: tc.id, output: toolResult });
          }
        }
      }
    } catch (e) {
      // Abort is not an error — just stop cleanly
      if (signal?.aborted) {
        stripLastToolCalls(messages);
        break;
      }
      callbacks.onError(e instanceof Error ? e : new Error(String(e)));
      stripLastToolCalls(messages);
      done = true;
    }
  }
}
