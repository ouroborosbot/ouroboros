import OpenAI from "openai"
import * as readline from "readline"
import { runAgent, buildSystem, ChannelCallbacks } from "./core"

// spinner that only touches stderr, cleans up after itself
// exported for direct testability (stop-without-start branch)
export class Spinner {
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

// Input controller: pauses readline during model/tool execution.
// Does NOT touch raw mode — readline with terminal:true manages raw mode
// internally. Touching it causes ^C to be echoed by the terminal driver.
// During suppress, we consume stdin data ourselves to swallow stray
// keystrokes and catch Ctrl-C (0x03) for interrupt.
export class InputController {
  private rl: readline.Interface
  private suppressed = false
  private dataHandler: ((data: Buffer) => void) | null = null
  private onInterrupt: (() => void) | null = null

  constructor(rl: readline.Interface) {
    this.rl = rl
  }

  suppress(onInterrupt?: () => void) {
    if (this.suppressed) return
    this.suppressed = true
    this.onInterrupt = onInterrupt || null
    this.rl.pause()
    // Consume stdin to swallow keystrokes; catch Ctrl-C (0x03)
    this.dataHandler = (data: Buffer) => {
      if (data[0] === 0x03 && this.onInterrupt) {
        this.onInterrupt()
      }
      // All other input is swallowed
    }
    process.stdin.on("data", this.dataHandler)
  }

  restore() {
    if (!this.suppressed) return
    this.suppressed = false
    if (this.dataHandler) {
      process.stdin.removeListener("data", this.dataHandler)
      this.dataHandler = null
    }
    this.onInterrupt = null
    this.rl.resume()
  }
}

// Ctrl-C handling: returns "clear" if input was non-empty, "warn" on first empty press, "exit" on second
let _ctrlCWarned = false

export function handleSigint(rl: readline.Interface, currentInput: string): "clear" | "warn" | "exit" {
  if (currentInput.length > 0) {
    _ctrlCWarned = false
    return "clear"
  }
  if (_ctrlCWarned) {
    _ctrlCWarned = false
    return "exit"
  }
  _ctrlCWarned = true
  return "warn"
}

// History management
export function addHistory(history: string[], entry: string): void {
  if (!entry.trim()) return
  if (history.length > 0 && history[history.length - 1] === entry) return
  history.push(entry)
}

export function createCliCallbacks(): ChannelCallbacks {
  let currentSpinner: Spinner | null = null
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
      currentSpinner = new Spinner("waiting for model")
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
      currentSpinner = new Spinner(`running ${name}`)
      currentSpinner.start()
    },
    onToolEnd: (name: string, argSummary: string, success: boolean) => {
      if (success) {
        currentSpinner?.stop(`${name}${argSummary ? ` (${argSummary})` : ""}`)
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

export async function bootGreeting(messages: OpenAI.ChatCompletionMessageParam[], callbacks: ChannelCallbacks, signal?: AbortSignal): Promise<void> {
  messages.push({ role: "user", content: "hello" })
  await runAgent(messages, callbacks, signal)
}

export async function main() {
  const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: buildSystem() }]
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const ctrl = new InputController(rl)
  let currentAbort: AbortController | null = null
  const history: string[] = []
  let closed = false
  rl.on("close", () => { closed = true })

  console.log("\nouroboros (type 'exit' to quit)\n")

  const cliCallbacks = createCliCallbacks()

  // boot greeting
  const bootAbort = new AbortController()
  ctrl.suppress(() => bootAbort.abort())
  await bootGreeting(messages, cliCallbacks, bootAbort.signal).catch(() => {})
  ctrl.restore()
  process.stdout.write("\n")

  process.stdout.write("\x1b[36m> \x1b[0m")

  // Ctrl-C at the input prompt: clear line or warn/exit
  // readline with terminal:true catches Ctrl-C in raw mode (no ^C echo)
  rl.on("SIGINT", () => {
    const currentLine = (rl as any).line || ""
    const result = handleSigint(rl, currentLine)
    if (result === "clear") {
      (rl as any).line = "";
      (rl as any).cursor = 0
      process.stdout.write("\r\x1b[K\x1b[36m> \x1b[0m")
    } else if (result === "warn") {
      (rl as any).line = "";
      (rl as any).cursor = 0
      process.stdout.write("\r\x1b[K")
      process.stderr.write("press Ctrl-C again to exit\n")
      process.stdout.write("\x1b[36m> \x1b[0m")
    } else {
      rl.close()
    }
  })

  try {
    for await (const input of rl) {
      if (closed || input.toLowerCase() === "exit") break
      if (!input.trim()) { process.stdout.write("\x1b[36m> \x1b[0m"); continue }

      // Re-style the echoed input line (readline terminal:true echoes it as "> input")
      process.stdout.write(`\x1b[1A\x1b[K\x1b[1m> ${input}\x1b[0m\n`)

      messages.push({ role: "user", content: input })
      addHistory(history, input)

      currentAbort = new AbortController()
      ctrl.suppress(() => currentAbort!.abort())
      try {
        await runAgent(messages, cliCallbacks, currentAbort.signal)
      } catch {
        // AbortError — silently return to prompt
      }
      ctrl.restore()
      currentAbort = null
      process.stdout.write("\n")

      if (closed) break
      process.stdout.write("\x1b[36m> \x1b[0m")
    }
  } finally {
    rl.close()
    console.log("bye")
  }
}