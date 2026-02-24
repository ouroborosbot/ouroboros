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

// Default debounce interval for buffered streaming (ms)
const BUFFER_INTERVAL_MS = 1500

// Create Teams-specific callbacks for the agent loop.
// Returns { callbacks, flush } -- caller must call flush() after runAgent()
// completes to emit any remaining buffered content before closing the stream.
export function createTeamsCallbacks(
  stream: TeamsStream,
  controller: AbortController,
): { callbacks: ChannelCallbacks; flush: () => void } {
  // Track whether we're inside a think tag across chunks
  let inThink = false
  let thinkBuf = ""
  let emittedContent = false // trim leading whitespace until first real content

  // Cumulative text accumulator -- every emit sends ALL content so far
  let cumulativeText = ""

  // Buffered flushing state
  let pendingBuffer = "" // text waiting to be flushed
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false // set when stream signals cancellation (403)

  // Safely emit cumulative text to the stream.
  // On error (e.g. 403 from Teams stop button), abort the controller.
  function safeEmit(text: string): void {
    if (stopped) return
    try {
      stream.emit(text)
    } catch {
      stopped = true
      controller.abort()
    }
  }

  // Flush pending buffer to the stream immediately.
  function flushBuffer(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (pendingBuffer.length > 0 && !stopped) {
      cumulativeText += pendingBuffer
      pendingBuffer = ""
      safeEmit(cumulativeText)
    }
  }

  // Schedule a debounced flush.
  function scheduleFlush(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (pendingBuffer.length > 0 && !stopped) {
        cumulativeText += pendingBuffer
        pendingBuffer = ""
        safeEmit(cumulativeText)
      }
    }, BUFFER_INTERVAL_MS)
  }

  const callbacks: ChannelCallbacks = {
    onModelStart: () => {
      stream.update("thinking...")
    },
    onModelStreamStart: () => {
      // No-op for Teams -- streaming has already started
    },
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
        pendingBuffer += output
        scheduleFlush()
      }
    },
    onToolStart: (name: string, args: Record<string, string>) => {
      const argSummary = Object.values(args).join(", ")
      stream.update(`running ${name} (${argSummary})...`)
    },
    onToolEnd: (name: string, summary: string, success: boolean) => {
      if (success) {
        stream.update(summary || `${name} done`)
      } else {
        stream.update(`${name} failed: ${summary}`)
      }
    },
    onError: (error: Error) => {
      if (stopped) return
      stream.emit(`Error: ${error.message}`)
    },
  }

  return { callbacks, flush: flushBuffer }
}

// Global messages array (WU1 simplification -- single conversation)
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: buildSystem() },
]

// Handle an incoming Teams message
export async function handleTeamsMessage(text: string, stream: TeamsStream): Promise<void> {
  messages.push({ role: "user", content: text })
  const controller = new AbortController()
  const { callbacks, flush } = createTeamsCallbacks(stream, controller)
  await runAgent(messages, callbacks, controller.signal)
  flush()
  stream.close()
}

// Start the Teams app with DevtoolsPlugin
export function startTeamsApp(): void {
  const app = new App({
    plugins: [new DevtoolsPlugin()],
  })

  app.on("message", async ({ stream, activity }) => {
    const text = activity.text || ""
    await handleTeamsMessage(text, stream)
  })

  const port = parseInt(process.env.PORT || "3978", 10)
  app.start(port)
  console.log(`Teams bot started on port ${port} with DevtoolsPlugin`)
}
