import OpenAI from "openai"
import { App } from "@microsoft/teams.apps"
import { DevtoolsPlugin } from "@microsoft/teams.dev"
import { runAgent, ChannelCallbacks } from "../engine/core"
import type { ToolContext } from "../engine/tools"
import { getOAuthConfig, getAdoConfig } from "../config"
import { buildSystem } from "../mind/prompt"
import { pickPhrase, THINKING_PHRASES, FOLLOWUP_PHRASES } from "../repertoire/phrases"
import { sessionPath, getTeamsConfig } from "../config"
import { loadSession, deleteSession, cachedBuildSystem, postTurn } from "../mind/context"
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

// Options for createTeamsCallbacks controlling streaming behavior.
export interface TeamsCallbackOptions {
  disableStreaming?: boolean
}

// Extended callbacks type that includes flush() for buffered streaming mode.
export type TeamsCallbacksWithFlush = ChannelCallbacks & { flush(): void }

// Create Teams-specific callbacks for the agent loop.
// The SDK handles cumulative text, debouncing (500ms), and the streaming
// protocol (streamSequence, streamId, informative/streaming/final types).
// We just send deltas and let the SDK do the rest.
//
// When disableStreaming is true, onTextChunk buffers text internally instead
// of calling stream.emit(). Call flush() after the agent loop to emit the
// entire buffer as a single stream.emit() call. Status updates (stream.update)
// still fire normally. This is useful when the devtunnel relay buffers
// responses, causing chunked streaming to be extremely slow.
export function createTeamsCallbacks(
  stream: TeamsStream,
  controller: AbortController,
  options?: TeamsCallbackOptions,
): TeamsCallbacksWithFlush {
  const buffered = options?.disableStreaming === true
  let stopped = false // set when stream signals cancellation (403)
  let hadToolRun = false
  let hadRealOutput = false // true once reasoning/tool output shown; suppresses phrases
  let reasoningBuf = "" // accumulated reasoning text for status display
  let textBuffer = "" // accumulated text output when disableStreaming is true
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
      if (hadRealOutput) return // real output already shown; don't overwrite with phrases
      const pool = hadToolRun ? FOLLOWUP_PHRASES : THINKING_PHRASES
      const first = pickPhrase(pool)
      lastPhrase = first
      safeUpdate(first + "...")
      startPhraseRotation(pool)
    },
    onModelStreamStart: () => {
      // No-op: don't stop rotation here — keep cycling phrases through
      // the reasoning phase until actual content arrives.
    },
    onReasoningChunk: (text: string) => {
      if (stopped) return
      stopPhraseRotation()
      hadRealOutput = true
      reasoningBuf += text
      safeUpdate(reasoningBuf)
    },
    onTextChunk: (text: string) => {
      if (stopped) return
      stopPhraseRotation()
      if (buffered) {
        textBuffer += text
      } else {
        safeEmit(text)
      }
    },
    onToolStart: (name: string, args: Record<string, string>) => {
      stopPhraseRotation()
      hadRealOutput = true
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
    flush: () => {
      if (textBuffer) {
        safeEmit(textBuffer)
        textBuffer = ""
      }
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

// Context from the Teams activity that carries OAuth tokens and signin ability
export interface TeamsMessageContext {
  graphToken?: string
  adoToken?: string
  signin: (connectionName: string) => Promise<string | undefined>
}

// Handle an incoming Teams message
export async function handleTeamsMessage(text: string, stream: TeamsStream, conversationId: string, teamsContext?: TeamsMessageContext, disableStreaming?: boolean): Promise<void> {
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
  const messages: OpenAI.ChatCompletionMessageParam[] = existing?.messages && existing.messages.length > 0
    ? existing.messages
    : [{ role: "system", content: cachedBuildSystem("teams", buildSystem) }]

  // Push user message
  messages.push({ role: "user", content: text })

  // Run agent
  const controller = new AbortController()
  const callbacks = createTeamsCallbacks(stream, controller, { disableStreaming })
  const toolContext: ToolContext | undefined = teamsContext ? {
    graphToken: teamsContext.graphToken,
    adoToken: teamsContext.adoToken,
    signin: teamsContext.signin,
    adoOrganizations: getAdoConfig().organizations,
  } : undefined
  const agentOptions: Record<string, unknown> = {}
  if (toolContext) agentOptions.toolContext = toolContext
  if (disableStreaming) agentOptions.disableStreaming = true
  const result = await runAgent(messages, callbacks, "teams", controller.signal,
    Object.keys(agentOptions).length > 0 ? agentOptions as any : undefined)

  // Flush any buffered text (when disableStreaming is true, text was accumulated
  // instead of streamed; flush emits it as a single message to Teams)
  callbacks.flush()

  // After the agent loop, check if any tool returned AUTH_REQUIRED and trigger signin.
  // This must happen after the stream is done so the OAuth card renders properly.
  if (teamsContext) {
    const allContent = messages.map(m => typeof m.content === "string" ? m.content : "").join("\n")
    if (allContent.includes("AUTH_REQUIRED:graph")) await teamsContext.signin("graph")
    if (allContent.includes("AUTH_REQUIRED:ado")) await teamsContext.signin("ado")
  }

  // Trim context and save session
  postTurn(messages, sessPath, result.usage)
  // SDK auto-closes the stream after our handler returns (app.process.js)
}

// Start the Teams app in DevtoolsPlugin mode (local dev) or Bot Service mode (real Teams).
// Mode is determined by getTeamsConfig().clientId.
// Supports --disable-streaming CLI flag to buffer text output instead of streaming it.
// Rationale: devtunnel nginx relay buffers chunked responses, causing compounding latency.
export function startTeamsApp(): void {
  // npm run teams:no-stream  → passes --disable-streaming via process.argv
  // npm run teams -- --disable-streaming → also works via process.argv
  // DISABLE_STREAMING=1 npm run teams → works via env var
  const disableStreaming = process.argv.includes("--disable-streaming")
    || process.env.DISABLE_STREAMING === "1"
  const mentionStripping = { activity: { mentions: { stripText: true as const } } }
  const teamsConfig = getTeamsConfig()

  let app: InstanceType<typeof App>
  let mode: string

  const oauthConfig = getOAuthConfig()

  if (teamsConfig.clientId) {
    // Bot Service mode -- real Teams connection with SingleTenant credentials
    app = new App({
      clientId: teamsConfig.clientId,
      clientSecret: teamsConfig.clientSecret,
      tenantId: teamsConfig.tenantId,
      oauth: { defaultConnectionName: oauthConfig.graphConnectionName },
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

  app.on("message", async (ctx) => {
    const { stream, activity, api, signin } = ctx
    const text = activity.text || ""
    const convId = activity.conversation?.id || "unknown"
    const userId = activity.from?.id || ""
    const channelId = activity.channelId || "msteams"

    console.log(`[teams] msg from=${userId.slice(0, 12)} conv=${convId.slice(0, 20)}`)

    // Fetch tokens for both OAuth connections independently.
    // Failures are silently caught -- the tool handler will request signin if needed.
    let graphToken: string | undefined
    let adoToken: string | undefined
    try {
      const graphRes = await api.users.token.get({ userId, connectionName: oauthConfig.graphConnectionName, channelId })
      graphToken = graphRes?.token
    } catch { /* no token yet — tool handler will trigger signin */ }
    try {
      const adoRes = await api.users.token.get({ userId, connectionName: oauthConfig.adoConnectionName, channelId })
      adoToken = adoRes?.token
    } catch { /* no token yet — tool handler will trigger signin */ }
    console.log(`[teams] tokens: graph=${graphToken ? "yes" : "no"} ado=${adoToken ? "yes" : "no"}`)

    const teamsContext: TeamsMessageContext = {
      graphToken,
      adoToken,
      signin: async (cn: string) => {
        try {
          const result = await signin({ connectionName: cn })
          console.log(`[teams] signin(${cn}): ${result ? "token received" : "no token"}`)
          return result
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error(`[teams] signin(${cn}) failed: ${msg.slice(0, 100)}`)
          return undefined
        }
      },
    }

    try {
      await withConversationLock(convId, () => handleTeamsMessage(text, stream, convId, teamsContext, disableStreaming))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[teams] handler error: ${msg.slice(0, 200)}`)
    }
  })

  // Prevent SDK internal stream errors (e.g. "Content stream is not allowed
  // on a already completed streamed message") from crashing the process.
  // Guard: only register once even if startTeamsApp is called multiple times.
  interface OuroborosHandler { (...args: unknown[]): void; __ouroboros?: boolean }
  if (!process.listeners("unhandledRejection").some((l) => (l as OuroborosHandler).__ouroboros)) {
    const handler: OuroborosHandler = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[teams] unhandled rejection: ${msg.slice(0, 200)}`)
    }
    handler.__ouroboros = true
    process.on("unhandledRejection", handler)
  }

  app.event("error", ({ error }) => {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[teams] app error: ${msg}`)
  })

  const port = parseInt(process.env.PORT || "3978", 10)
  app.start(port)
  console.log(`Teams bot started on port ${port} with ${mode} (streaming: ${disableStreaming ? "disabled" : "enabled"})`)
}
