import OpenAI from "openai"
import { App } from "@microsoft/teams.apps"
import { DevtoolsPlugin } from "@microsoft/teams.dev"
import { runAgent, buildSystem, ChannelCallbacks } from "./core"

// Stream interface matching IStreamer from @microsoft/teams.apps
interface TeamsStream {
  emit(activity: string): void
  update(text: string): void
  close(): void
}

// Strip think tags from text (Teams users should not see model reasoning)
export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "")
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
  // Track whether we're inside a think tag across chunks
  let inThink = false
  let thinkBuf = ""
  let emittedContent = false // trim leading whitespace until first real content
  let stopped = false // set when stream signals cancellation (403)

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

  return {
    onModelStart: () => {
      safeUpdate("thinking...")
    },
    onModelStreamStart: () => {
      // No-op for Teams -- streaming has already started
    },
    onReasoningChunk: () => {},
    onTextChunk: (text: string) => {
      if (stopped) return

      // Process chunk-by-chunk think tag stripping
      thinkBuf += text
      let output = ""

      while (thinkBuf.length > 0) {
        if (inThink) {
          const end = thinkBuf.indexOf("</think>")
          if (end === -1) {
            // Still inside think -- consume and wait for more
            thinkBuf = ""
          } else {
            thinkBuf = thinkBuf.slice(end + 8)
            inThink = false
          }
        } else {
          const start = thinkBuf.indexOf("<think>")
          if (start === -1) {
            output += thinkBuf
            thinkBuf = ""
          } else {
            output += thinkBuf.slice(0, start)
            thinkBuf = thinkBuf.slice(start + 7)
            inThink = true
          }
        }
      }

      // Trim leading whitespace until first real content -- prevents blank
      // space at the top of the message from newlines after think blocks
      if (!emittedContent) {
        output = output.trimStart()
      }
      if (output.length > 0) {
        emittedContent = true
        safeEmit(output)
      }
    },
    onToolStart: (name: string, args: Record<string, string>) => {
      const argSummary = Object.values(args).join(", ")
      safeUpdate(`running ${name} (${argSummary})...`)
    },
    onToolEnd: (name: string, summary: string, success: boolean) => {
      if (success) {
        safeUpdate(summary || `${name} done`)
      } else {
        safeUpdate(`${name} failed: ${summary}`)
      }
    },
    onError: (error: Error) => {
      if (stopped) return
      safeEmit(`Error: ${error.message}`)
    },
  }
}

// Global messages array (WU1 simplification -- single conversation)
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: buildSystem("teams") },
]

// Handle an incoming Teams message
export async function handleTeamsMessage(text: string, stream: TeamsStream): Promise<void> {
  messages.push({ role: "user", content: text })
  const controller = new AbortController()
  const callbacks = createTeamsCallbacks(stream, controller)
  await runAgent(messages, callbacks, controller.signal)
  // SDK auto-closes the stream after our handler returns (app.process.js)
}

// Start the Teams app in DevtoolsPlugin mode (local dev) or Bot Service mode (real Teams).
// Mode is determined by the CLIENT_ID environment variable.
export function startTeamsApp(): void {
  const mentionStripping = { activity: { mentions: { stripText: true as const } } }

  let app: InstanceType<typeof App>
  let mode: string

  if (process.env.CLIENT_ID) {
    // Bot Service mode -- real Teams connection with SingleTenant credentials
    app = new App({
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      tenantId: process.env.TENANT_ID,
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
    try {
      await handleTeamsMessage(text, stream)
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
