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
  let hadRealOutput = false // true once reasoning/tool output shown; suppresses phrases
  let reasoningBuf = "" // accumulated reasoning text for status display
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
      safeEmit(text)
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
export async function handleTeamsMessage(text: string, stream: TeamsStream, conversationId: string, teamsContext?: TeamsMessageContext): Promise<void> {
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
  const callbacks = createTeamsCallbacks(stream, controller)
  const toolContext: ToolContext | undefined = teamsContext ? {
    graphToken: teamsContext.graphToken,
    adoToken: teamsContext.adoToken,
    signin: teamsContext.signin,
    adoOrganizations: getAdoConfig().organizations,
  } : undefined
  const result = await runAgent(messages, callbacks, "teams", controller.signal, toolContext ? { toolContext } : undefined)

  // After the agent loop, check if any tool returned AUTH_REQUIRED and trigger signin.
  // This must happen after the stream is done so the OAuth card renders properly.
  if (teamsContext) {
    const allContent = messages.map(m => typeof m.content === "string" ? m.content : "").join("\n")
    if (allContent.includes("AUTH_REQUIRED:graph")) {
      console.log("[teams] detected AUTH_REQUIRED:graph, sending signin card")
      await teamsContext.signin("graph")
    }
    if (allContent.includes("AUTH_REQUIRED:ado")) {
      console.log("[teams] detected AUTH_REQUIRED:ado, sending signin card")
      await teamsContext.signin("ado")
    }
  }

  // Trim context and save session
  postTurn(messages, sessPath, result.usage)
  // SDK auto-closes the stream after our handler returns (app.process.js)
}

// Start the Teams app in DevtoolsPlugin mode (local dev) or Bot Service mode (real Teams).
// Mode is determined by getTeamsConfig().clientId.
export function startTeamsApp(): void {
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

    console.log(`[teams] message received: "${text.slice(0, 80)}" from=${userId} conv=${convId.slice(0, 40)}`)

    // Fetch tokens for both OAuth connections independently.
    // Failures are silently caught -- the tool handler will request signin if needed.
    let graphToken: string | undefined
    let adoToken: string | undefined
    try {
      const graphRes = await api.users.token.get({ userId, connectionName: oauthConfig.graphConnectionName, channelId })
      graphToken = graphRes?.token
      console.log(`[teams] graph token: ${graphToken ? "present" : "missing"}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`[teams] graph token fetch failed: ${msg.slice(0, 120)}`)
    }
    try {
      const adoRes = await api.users.token.get({ userId, connectionName: oauthConfig.adoConnectionName, channelId })
      adoToken = adoRes?.token
      console.log(`[teams] ado token: ${adoToken ? "present" : "missing"}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`[teams] ado token fetch failed: ${msg.slice(0, 120)}`)
    }

    const teamsContext: TeamsMessageContext = {
      graphToken,
      adoToken,
      signin: async (connectionName: string) => {
        console.log(`[teams] signin called for connection: ${connectionName}`)
        try {
          const result = await signin({ connectionName })
          console.log(`[teams] signin result: ${result ?? "undefined"}`)
          return result
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          console.log(`[teams] signin error: ${msg.slice(0, 120)}`)
          return undefined
        }
      },
    }

    try {
      await withConversationLock(convId, () => handleTeamsMessage(text, stream, convId, teamsContext))
    } catch (err) {
      console.error("Message handler error:", err)
    }
  })

  // Prevent SDK internal stream errors (e.g. "Content stream is not allowed
  // on a already completed streamed message") from crashing the process.
  // Guard: only register once even if startTeamsApp is called multiple times.
  interface OuroborosHandler { (...args: unknown[]): void; __ouroboros?: boolean }
  if (!process.listeners("unhandledRejection").some((l) => (l as OuroborosHandler).__ouroboros)) {
    const handler: OuroborosHandler = (err: unknown) => { console.error("Unhandled rejection (non-fatal):", err) }
    handler.__ouroboros = true
    process.on("unhandledRejection", handler)
  }

  const port = parseInt(process.env.PORT || "3978", 10)
  app.start(port)
  console.log(`Teams bot started on port ${port} with ${mode}`)
}
