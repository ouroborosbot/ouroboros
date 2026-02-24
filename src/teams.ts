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

// Create Teams-specific callbacks for the agent loop
export function createTeamsCallbacks(stream: TeamsStream): ChannelCallbacks {
  // Track whether we're inside a think tag across chunks
  let inThink = false
  let thinkBuf = ""

  return {
    onModelStart: () => {
      stream.update("thinking...")
    },
    onModelStreamStart: () => {
      // No-op for Teams -- streaming has already started
    },
    onTextChunk: (text: string) => {
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

      if (output.length > 0) {
        stream.emit(output)
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
      stream.emit(`Error: ${error.message}`)
    },
  }
}

// Global messages array (WU1 simplification -- single conversation)
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: buildSystem() },
]

// Handle an incoming Teams message
export async function handleTeamsMessage(text: string, stream: TeamsStream): Promise<void> {
  messages.push({ role: "user", content: text })
  const callbacks = createTeamsCallbacks(stream)
  await runAgent(messages, callbacks)
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

// entrypoint guard — only runs when executed directly (node dist/teams.js),
// never in vitest where require.main !== module. startTeamsApp() is tested via direct import.
/* v8 ignore start */
if (require.main === module) {
  startTeamsApp()
}
/* v8 ignore stop */
