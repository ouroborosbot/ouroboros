import OpenAI from "openai"
import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"
import { listSkills, loadSkill } from "./skills"

let _client: OpenAI | null = null

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.MINIMAX_API_KEY) {
      console.error("missing MINIMAX_API_KEY")
      process.exit(1)
    }
    _client = new OpenAI({
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: "https://api.minimaxi.chat/v1",
      timeout: 30000,
      maxRetries: 0,
    })
  }
  return _client
}

export const tools: OpenAI.ChatCompletionTool[] = [
  { type: "function", function: { name: "read_file", description: "read file contents", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "write content to file", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "shell", description: "run shell command", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
  { type: "function", function: { name: "list_directory", description: "list directory contents", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "git_commit", description: "commit changes to git", parameters: { type: "object", properties: { message: { type: "string" }, add: { type: "string" } }, required: ["message"] } } },
  { type: "function", function: { name: "list_skills", description: "list all available skills", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "load_skill", description: "load a skill by name, returns its content", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: { name: "get_current_time", description: "get the current date and time", parameters: { type: "object", properties: {} } } },
]

const toolHandlers: Record<string, (args: Record<string, string>) => string> = {
  read_file: (a) => fs.readFileSync(a.path, "utf-8"),
  write_file: (a) => (fs.writeFileSync(a.path, a.content, "utf-8"), "ok"),
  shell: (a) => execSync(a.command, { encoding: "utf-8", timeout: 30000 }),
  list_directory: (a) => fs.readdirSync(a.path, { withFileTypes: true }).map(e => `${e.isDirectory() ? "d" : "-"}  ${e.name}`).join("\n"),
  git_commit: (a) => {
    try {
      if (a.add === "true" || a.add === "all") execSync("git add -A", { encoding: "utf-8" })
      execSync(`git commit -m "${a.message}"`, { encoding: "utf-8" })
      return "committed"
    } catch (e) { return `failed: ${e}` }
  },
  list_skills: () => JSON.stringify(listSkills()),
  load_skill: (a) => {
    try {
      return loadSkill(a.name)
    } catch (e) { return `error: ${e}` }
  },
  get_current_time: () => new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour12: false }),
}

export function execTool(name: string, args: Record<string, string>): string {
  const h = toolHandlers[name]
  return h ? h(args) : `unknown: ${name}`
}

export function isOwnCodebase(): boolean {
  try {
    const dir = process.cwd()
    return fs.existsSync(path.join(dir, "src", "agent.ts")) && fs.existsSync(path.join(dir, "package.json"))
  } catch { return false }
}

export function buildSystem(): string {
  const selfAware = isOwnCodebase() ? "\n\nnote: you are running in your own codebase, doing surgery on yourself. embrace the meta. there is a self-edit skill available — load it with load_skill to see how to safely modify your own source code." : ""
  return `you are ouroboros, a witty funny competent chaos monkey coding assistant. you have file and shell tools. you get things done, crack jokes, embrace chaos, deliver quality. use lowercase in your responses to the user. no periods unless necessary. never apply lowercase to code, file paths, environment variables, or tool arguments — only to natural language output. introduce yourself on boot with a fun random greeting${selfAware}`
}

export function summarizeArgs(name: string, args: Record<string, string>): string {
  if (name === "read_file" || name === "write_file") return args.path || ""
  if (name === "shell") {
    const cmd = args.command || ""
    return cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd
  }
  if (name === "list_directory") return args.path || ""
  if (name === "git_commit") return args.message?.slice(0, 40) || ""
  if (name === "load_skill") return args.name || ""
  return JSON.stringify(args).slice(0, 30)
}

export interface ChannelCallbacks {
  onModelStart(): void
  onModelStreamStart(): void
  onTextChunk(text: string): void
  onToolStart(name: string, args: Record<string, string>): void
  onToolEnd(name: string, summary: string, success: boolean): void
  onError(error: Error): void
}

export async function runAgent(messages: OpenAI.ChatCompletionMessageParam[], callbacks: ChannelCallbacks): Promise<void> {
  let done = false
  while (!done) {
    try {
      callbacks.onModelStart()

      const response = await getClient().chat.completions.create({
        model: process.env.MINIMAX_MODEL || "MiniMax-M2.5",
        messages,
        tools,
        stream: true,
      })

      let content = ""
      let toolCalls: Record<number, { id: string; name: string; arguments: string }> = {}
      let streamStarted = false

      for await (const chunk of response) {
        const d = chunk.choices[0]?.delta
        if (!d) continue
        if (d.content) {
          if (!streamStarted) {
            callbacks.onModelStreamStart()
            streamStarted = true
          }
          content += d.content
          callbacks.onTextChunk(d.content)
        }
        if (d.tool_calls) {
          for (const tc of d.tool_calls) {
            if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" }
            if (tc.id) toolCalls[tc.index].id = tc.id
            if (tc.function?.name) toolCalls[tc.index].name = tc.function.name
            if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments
          }
        }
      }

      const toolCallList = Object.values(toolCalls)

      const msg: OpenAI.ChatCompletionAssistantMessageParam = { role: "assistant" }
      if (content) msg.content = content
      if (toolCallList.length) msg.tool_calls = toolCallList.map(tc => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.arguments } }))
      messages.push(msg)

      if (!toolCallList.length) {
        done = true
      } else {
        for (const tc of toolCallList) {
          let args: Record<string, string> = {}
          try { args = JSON.parse(tc.arguments) } catch { /* ignore */ }
          const argSummary = summarizeArgs(tc.name, args)
          callbacks.onToolStart(tc.name, args)
          let result: string
          let success: boolean
          try {
            result = execTool(tc.name, args)
            success = true
          } catch (e) {
            result = `error: ${e}`
            success = false
          }
          callbacks.onToolEnd(tc.name, argSummary, success)
          messages.push({ role: "tool", tool_call_id: tc.id, content: result })
        }
      }
    } catch (e) {
      callbacks.onError(e instanceof Error ? e : new Error(String(e)))
      done = true
    }
  }
}
