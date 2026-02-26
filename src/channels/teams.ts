import OpenAI from "openai"
import { App } from "@microsoft/teams.apps"
import { DevtoolsPlugin } from "@microsoft/teams.dev"
import { runAgent, ChannelCallbacks } from "../engine/core"
import { buildSystem } from "../mind/prompt"
import { pickPhrase, THINKING_PHRASES, TOOL_PHRASES, FOLLOWUP_PHRASES } from "../repertoire/phrases"
import { sessionPath, getContextConfig, getTeamsConfig } from "../config"
import { loadSession, saveSession, deleteSession, trimMessages, cachedBuildSystem } from "../mind/context"
import { createCommandRegistry, registerDefaultCommands, parseSlashCommand } from "../repertoire/commands"

// Stream interface matching IStreamer from @microsoft/teams.apps
interface TeamsStream {
  emit(activity: string): void
  update(text: string): void
  close(): void
}

// Strip @mention markup from incoming messages.
// Removes <at>...</at> tags and trims extra whitespace.
// Fallback safety net -- the SDK's activity.mentions.stripText should handle
// this automatically, but this utility is exported for testability.
export function stripMentions(text: string): string {
  if (!text) return ""
  return text.replace(/<at>[^<]*<\/at>/g, "").trim()
}

// Create Teams-specific callbacks for the agent loop.
// The SDK handles cumulative text, debouncing (500ms), and the streaming
// protocol (streamSequence, streamId, informative/streaming/final types).
// We just send deltas and let the SDK do the rest.
export function createTeamsCallbacks(
  stream: TeamsStream,
  controller: AbortController,
): ChannelCallbacks {
  let stopped = false // set when stream signals cancellation (403)
  let hadToolRun = false
  let phraseTimer: NodeJS.Timeout | null = null
  let lastPhrase = ""

  // Safely emit a text delta to the stream.
  // On error (e.g. 403 from Teams stop button), abort the controller.
  function safeEmit(text: string): void {
    try {
      stream.emit(text)
    } catch {
      stopped = true
      controller.abort()
    }
  }

  // Safely send a status update to the stream.
  // On error (e.g. 403 from Teams stop button), abort the controller.
  function safeUpdate(text: string): void {
    if (stopped) return
    try {
      stream.update(text)
    } catch {
      stopped = true
      controller.abort()
    }
  }

  function startPhraseRotation(pool: readonly string[]): void {
    stopPhraseRotation()
    phraseTimer = setInterval(() => {
      const next = pickPhrase(pool, lastPhrase)
      lastPhrase = next
      safeUpdate(next + "...")
    }, 1500)
  }

  function stopPhraseRotation(): void {
    if (phraseTimer) { clearInterval(phraseTimer); phraseTimer = null }
  }

  return {
    onModelStart: () => {
      const pool = hadToolRun ? FOLLOWUP_PHRASES : THINKING_PHRASES
      const first = pickPhrase(pool)
      lastPhrase = first
      safeUpdate(first + "...")
      startPhraseRotation(pool)
    },
    onModelStreamStart: () => {
      // No-op: don't stop rotation here — keep cycling phrases through
      // the reasoning phase until actual text arrives in onTextChunk.
    },
    onReasoningChunk: () => {
      // No-op: reasoning is internal model thought, not user-facing.
      // Phrases keep cycling while the model reasons.
    },
    onTextChunk: (text: string) => {
      if (stopped) return
      stopPhraseRotation()
      safeEmit(text)
    },
    onToolStart: (name: string, args: Record<string, string>) => {
      stopPhraseRotation()
      const argSummary = Object.values(args).join(", ")
      safeUpdate(`running ${name} (${argSummary})...`)
      hadToolRun = true
    },
    onToolEnd: (name: string, summary: string, success: boolean) => {
      stopPhraseRotation()
      if (success) {
        safeUpdate(summary || `${name} done`)
      } else {
        safeUpdate(`${name} failed: ${summary}`)
      }
    },
    onError: (error: Error) => {
      stopPhraseRotation()
      if (stopped) return
      safeEmit(`Error: ${error.message}`)
    },
  }
}

// Per-conversation lock to serialize messages for the same conversation
const _convLocks = new Map<string, Promise<void>>()

export async function withConversationLock(convId: string, fn: () => Promise<void>): Promise<void> {
  const prev = _convLocks.get(convId) || Promise.resolve()
  const current = prev.then(fn, fn)
  _convLocks.set(convId, current)
  await current
}

// Handle an incoming Teams message
export async function handleTeamsMessage(text: string, stream: TeamsStream, conversationId: string): Promise<void> {
  // Send first thinking phrase immediately so the user sees feedback
  // before sync I/O (session load, trim) blocks the event loop.
  stream.update(pickPhrase(THINKING_PHRASES) + "...")
  await new Promise(r => setImmediate(r))

  const registry = createCommandRegistry()
  registerDefaultCommands(registry)

  // Check for slash commands
  const parsed = parseSlashCommand(text)
  if (parsed) {
    const dispatchResult = registry.dispatch(parsed.command, { channel: "teams" })
    if (dispatchResult.handled && dispatchResult.result) {
      if (dispatchResult.result.action === "new") {
        const sessPath = sessionPath("teams", conversationId)
        deleteSession(sessPath)
        stream.emit("session cleared")
        return
      } else if (dispatchResult.result.action === "response") {
        stream.emit(dispatchResult.result.message || "")
        return
      }
    }
  }

  // Load or create session
  const sessPath = sessionPath("teams", conversationId)
  const existing = loadSession(sessPath)
  const messages: OpenAI.ChatCompletionMessageParam[] = existing && existing.length > 0
    ? existing
    : [{ role: "system", content: cachedBuildSystem("teams", buildSystem) }]

  // Refresh system prompt
  messages[0] = { role: "system", content: cachedBuildSystem("teams", buildSystem) }

  // Push user message
  messages.push({ role: "user", content: text })

  // Trim context window
  const { maxTokens, contextMargin } = getContextConfig()
  const trimmed = trimMessages(messages, maxTokens, contextMargin)
  messages.length = 0
  messages.push(...trimmed)

  // Run agent
  const controller = new AbortController()
  const callbacks = createTeamsCallbacks(stream, controller)
  await runAgent(messages, callbacks, controller.signal)

  // Save session
  saveSession(sessPath, messages)
  // SDK auto-closes the stream after our handler returns (app.process.js)
}

// Start the Teams app in DevtoolsPlugin mode (local dev) or Bot Service mode (real Teams).
// Mode is determined by getTeamsConfig().clientId.
export function startTeamsApp(): void {
  const mentionStripping = { activity: { mentions: { stripText: true as const } } }
  const teamsConfig = getTeamsConfig()

  let app: InstanceType<typeof App>
  let mode: string

  if (teamsConfig.clientId) {
    // Bot Service mode -- real Teams connection with SingleTenant credentials
    app = new App({
      clientId: teamsConfig.clientId,
      clientSecret: teamsConfig.clientSecret,
      tenantId: teamsConfig.tenantId,
      ...mentionStripping,
    })
    mode = "Bot Service"
  } else {
    // DevtoolsPlugin mode -- local development with Teams DevtoolsPlugin UI
    app = new App({
      plugins: [new DevtoolsPlugin()],
      ...mentionStripping,
    })
    mode = "DevtoolsPlugin"
  }

  app.on("message", async ({ stream, activity }) => {
    const text = activity.text || ""
    const convId = activity.conversation?.id || "unknown"
    try {
      await withConversationLock(convId, () => handleTeamsMessage(text, stream, convId))
    } catch (err) {
      console.error("Message handler error:", err)
    }
  })

  // Prevent SDK internal stream errors (e.g. "Content stream is not allowed
  // on a already completed streamed message") from crashing the process.
  // Guard: only register once even if startTeamsApp is called multiple times.
  if (!process.listeners("unhandledRejection").some((l) => (l as any).__ouroboros)) {
    const handler = (err: unknown) => { console.error("Unhandled rejection (non-fatal):", err) }
    ;(handler as any).__ouroboros = true
    process.on("unhandledRejection", handler)
  }

  const port = parseInt(process.env.PORT || "3978", 10)
  app.start(port)
  console.log(`Teams bot started on port ${port} with ${mode}`)
}
