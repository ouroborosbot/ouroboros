import OpenAI from "openai"
import * as readline from "readline"
import { runAgent, buildSystem, ChannelCallbacks } from "./core"

// spinner that only touches stderr, cleans up after itself
class spinner {
  private frames = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"]
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
    if (ok) process.stderr.write(`\x1b[32m\u2713\x1b[0m ${ok}\n`)
  }

  fail(msg: string) {
    this.stop()
    process.stderr.write(`\x1b[31m\u2717\x1b[0m ${msg}\n`)
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

export function createCliCallbacks(): ChannelCallbacks {
  let currentSpinner: spinner | null = null
  let buf = ""
  let inThink = false

  const flush = () => {
    while (buf.length) {
      if (inThink) {
        const end = buf.indexOf("</think>")
        if (end === -1) { process.stdout.write(`\x1b[2m${buf}\x1b[0m`); buf = "" }
        else { process.stdout.write(`\x1b[2m${buf.slice(0, end + 8)}\x1b[0m`); buf = buf.slice(end + 8); inThink = false }
      } else {
        const start = buf.indexOf("<think>")
        if (start === -1) { process.stdout.write(buf); buf = "" }
        else { process.stdout.write(buf.slice(0, start)); buf = buf.slice(start); inThink = true }
      }
    }
  }

  return {
    onModelStart: () => {
      currentSpinner = new spinner("waiting for model")
      currentSpinner.start()
    },
    onModelStreamStart: () => {
      currentSpinner?.stop()
      currentSpinner = null
    },
    onTextChunk: (text: string) => {
      buf += text
      flush()
    },
    onToolStart: (name: string, _args: Record<string, string>) => {
      currentSpinner = new spinner(`running ${name}`)
      currentSpinner.start()
    },
    onToolEnd: (name: string, argSummary: string, success: boolean) => {
      if (success) {
        currentSpinner?.stop(`${name}${argSummary ? ` (${argSummary})` : ""}`)
        process.stdout.write(`\x1b[90m\u2192 ${name}${argSummary ? ` ${argSummary}` : ""}\x1b[0m\n`)
      } else {
        currentSpinner?.fail(`${name}: error`)
      }
      currentSpinner = null
    },
    onError: (error: Error) => {
      currentSpinner?.fail("request failed")
      currentSpinner = null
      process.stderr.write(`\x1b[31m${error}\x1b[0m\n`)
    },
  }
}

export async function bootGreeting(messages: OpenAI.ChatCompletionMessageParam[], callbacks: ChannelCallbacks): Promise<void> {
  messages.push({ role: "user", content: "hello" })
  await runAgent(messages, callbacks)
}

async function main() {
  const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: buildSystem() }]
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const ctrl = new inputctrl(rl)
  let closed = false
  rl.on("close", () => { closed = true })

  console.log("\nmini-max chat (type 'exit' to quit)\n")

  const cliCallbacks = createCliCallbacks()

  // boot greeting
  ctrl.suppress()
  await bootGreeting(messages, cliCallbacks)
  ctrl.restore()
  process.stdout.write("\n")

  process.stdout.write("\x1b[36m> \x1b[0m")

  try {
    for await (const input of rl) {
      if (closed || input.toLowerCase() === "exit") break
      if (!input.trim()) { process.stdout.write("\x1b[36m> \x1b[0m"); continue }

      messages.push({ role: "user", content: input })

      ctrl.suppress()
      await runAgent(messages, cliCallbacks)
      ctrl.restore()
      process.stdout.write("\n")

      if (closed) break
      process.stdout.write("\x1b[36m> \x1b[0m")
    }
  } finally {
    rl.close()
    console.log("bye")
  }
}

// Only run main when executed directly, not when imported
const isDirectExecution = require.main === module
if (isDirectExecution) {
  main()
}
