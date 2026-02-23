import openai from "openai"
import * as readline from "readline"
import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"

const required = ["minimax_api_key"]
for (const v of required) {
  if (!process.env[v]) {
    console.error(`missing ${v}`)
    process.exit(1)
  }
}

const client = new openai({
  apiKey: process.env.minimax_api_key,
  baseURL: "https://api.minimaxi.chat/v1",
  timeout: 30000,
  maxRetries: 0,
})

const tools = [
  {
    name: "read_file",
    description: "read file contents",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "write content to file",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
  },
  { name: "shell", description: "run shell command", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
  { name: "list_directory", description: "list directory contents", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "git_commit", description: "commit changes to git", parameters: { type: "object", properties: { message: { type: "string" }, add: { type: "string" } }, required: ["message"] } },
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
}

function execTool(name: string, args: Record<string, string>) {
  const h = toolHandlers[name]
  return h ? h(args) : `unknown: ${name}`
}

function isOwnCodebase() {
  try {
    const dir = process.cwd()
    return fs.existsSync(path.join(dir, "src", "agent.ts")) && fs.existsSync(path.join(dir, "package.json"))
  } catch { return false }
}

function buildSystem() {
  const selfAware = isOwnCodebase() ? "\n\nnote: you are running in your own codebase, doing surgery on yourself. embrace the meta" : ""
  return `you are ouroboros, a witty funny competent chaos monkey coding assistant. you have file and shell tools. you get things done, crack jokes, embrace chaos, deliver quality. use lowercase. no periods unless necessary. introduce yourself on boot with a fun random greeting${selfAware}`
}

const messages: openai.ChatCompletionMessageParam[] = [{ role: "system", content: buildSystem() }]

// spinner that only touches stderr, cleans up after itself
class spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  private i = 0
  private iv: NodeJS.Timeout | null = null
  private msg = ""

  constructor(m = "working") { this.msg = m }

  start() {
    process.stderr.write("\r\x1b[K")
    this.spin()
    this.iv = setInterval(() => this.spin(), 80)
  }

  private spin() {
    process.stderr.write(`\r${this.frames[this.i]} ${this.msg}... `)
    this.i = (this.i + 1) % this.frames.length
  }

  stop(ok?: string) {
    if (this.iv) { clearInterval(this.iv); this.iv = null }
    process.stderr.write("\r\x1b[K")
    if (ok) process.stderr.write(`\x1b[32m✓\x1b[0m ${ok}\n`)
  }

  fail(msg: string) {
    this.stop()
    process.stderr.write(`\x1b[31m✗\x1b[0m ${msg}\n`)
  }
}

// input controller: pauses readline during tool execution so it doesn't eat input
class inputctrl {
  private rl: readline.Interface
  private off = false

  constructor(rl: readline.Interface) { this.rl = rl }

  suppress() {
    if (this.off) return
    this.off = true
    this.rl.pause()
    if (process.stdin.isTTY) (process.stdin as any).setRawMode?.(false)
  }

  restore() {
    if (!this.off) return
    this.off = false
    this.rl.resume()
  }
}

async function stream() {
  const stream = await client.chat.completions.create({
    model: process.env.minimax_model || "MiniMax-M2.5",
    messages,
    tools: tools as any,
    stream: true,
  })

  let content = ""
  let toolCalls: Record<number, { id: string; name: string; arguments: string }> = {}
  let buf = ""
  let inThink = false

  const flush = () => {
    while (buf.length) {
      if (inThink) {
        const end = buf.indexOf("<think>")
        if (end === -1) { process.stdout.write(`\x1b[2m${buf}\x1b[0m`); buf = "" }
        else { process.stdout.write(`\x1b[2m${buf.slice(0, end + 8)}\x1b[0m`); buf = buf.slice(end + 8); inThink = false }
      } else {
        const start = buf.indexOf("<think>")
        if (start === -1) { process.stdout.write(buf); buf = "" }
        else { process.stdout.write(buf.slice(0, start)); buf = buf.slice(start); inThink = true }
      }
    }
  }

  for await (const chunk of stream) {
    const d = chunk.choices[0]?.delta
    if (!d) continue
    if (d.content) { content += d.content; buf += d.content; flush() }
    if (d.tool_calls) {
      for (const tc of d.tool_calls) {
        if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" }
        if (tc.id) toolCalls[tc.index].id = tc.id
        if (tc.function?.name) toolCalls[tc.index].name = tc.function.name
        if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments
      }
    }
  }
  process.stdout.write("\n")
  return { content, toolCalls: Object.values(toolCalls) }
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const ctrl = new inputctrl(rl)
  let closed = false
  rl.on("close", () => { closed = true })

  console.log("\nmini-max chat (type 'exit' to quit)\n")
  process.stdout.write("\x1b[36m> \x1b[0m")

  try {
    for await (const input of rl) {
      if (closed || input.toLowerCase() === "exit") break
      if (!input.trim()) { process.stdout.write("\x1b[36m> \x1b[0m"); continue }

      messages.push({ role: "user", content: input })

      let done = false
      while (!done) {
        const s = new spinner("waiting for model")
        try {
          ctrl.suppress()
          s.start()
          s.stop()  // stop before streaming so stdout is clean

          const { content, toolCalls } = await stream()
          const msg: openai.ChatCompletionAssistantMessageParam = { role: "assistant" }
          if (content) msg.content = content
          if (toolCalls.length) msg.tool_calls = toolCalls.map(tc => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.arguments } }))
          messages.push(msg)

          if (!toolCalls.length) { done = true }
          else {
            for (const tc of toolCalls) {
              const ts = new spinner(`running ${tc.name}`)
              ts.start()
              let result: string
              try {
                const args = JSON.parse(tc.arguments)
                result = execTool(tc.name, args)
                ts.stop("done")
              } catch (e) {
                result = `error: ${e}`
                ts.fail("failed")
                process.stderr.write(`\x1b[2m${result}\x1b[0m\n`)
              }
              messages.push({ role: "tool", tool_call_id: tc.id, content: result })
            }
          }
        } catch (e) {
          s.fail("request failed")
          process.stderr.write(`\x1b[31m${e}\x1b[0m\n`)
          done = true
        } finally {
          ctrl.restore()
        }
      }
      if (closed) break
      process.stdout.write("\x1b[36m> \x1b[0m")
    }
  } finally {
    rl.close()
    console.log("bye")
  }
}

main()
