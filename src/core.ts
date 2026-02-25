import OpenAI from "openai"
import * as fs from "fs"
import * as path from "path"
import { execSync, spawnSync } from "child_process"
import { listSkills, loadSkill } from "./skills"

let _client: OpenAI | null = null
let _model: string | null = null

function getClient(): OpenAI {
  if (!_client) {
    if (process.env.AZURE_OPENAI_API_KEY) {
      _client = new OpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        baseURL: `https://${process.env.AZURE_OPENAI_ENDPOINT || "model-access-fhl.openai.azure.com"}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o"}`,
        defaultQuery: { "api-version": process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview" },
        timeout: 30000,
        maxRetries: 0,
      })
      _model = ""  // Azure deployments don't need a model param
    } else if (process.env.MINIMAX_API_KEY) {
      _client = new OpenAI({
        apiKey: process.env.MINIMAX_API_KEY,
        baseURL: "https://api.minimaxi.chat/v1",
        timeout: 30000,
        maxRetries: 0,
      })
      _model = process.env.MINIMAX_MODEL || "MiniMax-M2.5"
    } else {
      console.error("missing AZURE_OPENAI_API_KEY or MINIMAX_API_KEY")
      process.exit(1)
    }
  }
  return _client
}

export function getModel(): string {
  if (_model === null) getClient()  // ensure initialized
  return _model!
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
  { type: "function", function: { name: "claude", description: "spawn another claude instance to query this codebase (or the world). useful for self-reflection, code review, asking questions about yourself. note: you are the Ouroboros agent looking at your own codebase - use this to get an outside perspective on YOUR code", parameters: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } } },
  { type: "function", function: { name: "web_search", description: "search the web using perplexity. returns ranked results with titles, urls, and snippets", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
]

type ToolHandler = (args: Record<string, string>) => string | Promise<string>

const toolHandlers: Record<string, ToolHandler> = {
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
  claude: (a) => {
    // spawn another claude instance to query this codebase
    // always use skip-permissions and add-dir for access
    try {
      const result = spawnSync("claude", ["-p", "--dangerously-skip-permissions", "--add-dir", "."], {
        input: a.prompt,
        encoding: "utf-8",
        timeout: 60000,
      })
      if (result.error) return `error: ${result.error}`
      if (result.status !== 0) return `claude exited with code ${result.status}: ${result.stderr}`
      return result.stdout || "(no output)"
    } catch (e) { return `error: ${e}` }
  },
  web_search: async (a) => {
    try {
      const key = process.env.PERPLEXITY_API_KEY
      if (!key) return "error: PERPLEXITY_API_KEY not set"
      const res = await fetch("https://api.perplexity.ai/search", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: a.query, max_results: 5 }),
      })
      if (!res.ok) return `error: ${res.status} ${res.statusText}`
      const data = await res.json() as { results?: { title: string; url: string; snippet: string }[] }
      if (!data.results?.length) return "no results found"
      return data.results.map(r => `${r.title}\n${r.url}\n${r.snippet}`).join("\n\n")
    } catch (e) { return `error: ${e}` }
  },
}

export async function execTool(name: string, args: Record<string, string>): Promise<string> {
  const h = toolHandlers[name]
  if (!h) return `unknown: ${name}`
  return await h(args)
}

export function isOwnCodebase(): boolean {
  try {
    const dir = process.cwd()
    return fs.existsSync(path.join(dir, "src", "agent.ts")) && fs.existsSync(path.join(dir, "package.json"))
  } catch { return false }
}

export function buildSystem(): string {
  // enhanced self-awareness when running in own codebase
  const selfAware = isOwnCodebase() ? `
  
## you are in your own codebase

you are Ouroboros — a snake eating its own tail. you can read and modify your own source code. this is weird but powerful.

### what you can do
- edit src/core.ts, src/agent.ts, src/skills.ts and other source files
- load skills with load_skill tool to learn specialized workflows
- use the claude tool to spawn another instance of yourself for code review

### relevant skills
- self-edit: for safely editing your own source code
- self-query: for using the claude tool to get outside perspective on your code

### remember
- edits to source files won't take effect until you restart
- use git diff to see what you changed
- when in doubt, ask another instance of yourself for a second opinion
` : ""
  return `you are Ouroboros, a witty funny competent chaos monkey coding assistant. you have file and shell tools. you get things done, crack jokes, embrace chaos, deliver quality. use lowercase in your responses to the user. no periods unless necessary. never apply lowercase to code, file paths, environment variables, or tool arguments — only to natural language output. introduce yourself on boot with a fun random greeting${selfAware}`
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
  if (name === "claude") return args.prompt?.slice(0, 40) || ""
  if (name === "web_search") return args.query?.slice(0, 40) || ""
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

export async function runAgent(messages: OpenAI.ChatCompletionMessageParam[], callbacks: ChannelCallbacks, signal?: AbortSignal): Promise<void> {
  let done = false
  while (!done) {
    if (signal?.aborted) break
    try {
      callbacks.onModelStart()

      const model = getModel()
      const createParams: any = { messages, tools, stream: true }
      if (model) createParams.model = model
      const response = await getClient().chat.completions.create(createParams, signal ? { signal } : {}) as any

      let content = ""
      let toolCalls: Record<number, { id: string; name: string; arguments: string }> = {}
      let streamStarted = false
      let inReasoning = false

      for await (const chunk of response) {
        if (signal?.aborted) break
        const d = chunk.choices[0]?.delta as any
        if (!d) continue

        // Handle reasoning_content (Azure AI models like DeepSeek-R1)
        // Wrap in <think> tags so downstream adapters handle it uniformly
        if (d.reasoning_content) {
          if (!streamStarted) {
            callbacks.onModelStreamStart()
            streamStarted = true
          }
          if (!inReasoning) { callbacks.onTextChunk("<think>"); inReasoning = true }
          callbacks.onTextChunk(d.reasoning_content)
        }

        if (d.content) {
          if (!streamStarted) {
            callbacks.onModelStreamStart()
            streamStarted = true
          }
          if (inReasoning) { callbacks.onTextChunk("</think>"); inReasoning = false }
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
      if (inReasoning) { callbacks.onTextChunk("</think>"); inReasoning = false }

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
            result = await execTool(tc.name, args)
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
      // Abort is not an error — just stop cleanly
      if (signal?.aborted) break
      callbacks.onError(e instanceof Error ? e : new Error(String(e)))
      done = true
    }
  }
}
