import OpenAI from "openai"
import * as readline from "readline"
import { runAgent, ChannelCallbacks } from "../engine/core"
import { buildSystem } from "../mind/prompt"
import { pickPhrase, THINKING_PHRASES, TOOL_PHRASES, FOLLOWUP_PHRASES } from "../repertoire/phrases"
import { sessionPath, getContextConfig } from "../config"
import { loadSession, saveSession, deleteSession, trimMessages, cachedBuildSystem } from "../mind/context"
import { createCommandRegistry, registerDefaultCommands, parseSlashCommand } from "../repertoire/commands"

// spinner that only touches stderr, cleans up after itself
// exported for direct testability (stop-without-start branch)
export class Spinner {
  private frames = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"]
  private i = 0
  private iv: NodeJS.Timeout | null = null
  private piv: NodeJS.Timeout | null = null
  private msg = ""
  private phrases: readonly string[] | null = null
  private lastPhrase = ""

  constructor(m = "working", phrases?: readonly string[]) {
    this.msg = m
    if (phrases && phrases.length > 0) this.phrases = phrases
  }

  start() {
    process.stderr.write("\r\x1b[K")
    this.spin()
    this.iv = setInterval(() => this.spin(), 80)
    if (this.phrases) {
      this.piv = setInterval(() => this.rotatePhrase(), 1500)
    }
  }

  private spin() {
    process.stderr.write(`\r${this.frames[this.i]} ${this.msg}... `)
    this.i = (this.i + 1) % this.frames.length
  }

  private rotatePhrase() {
    const next = pickPhrase(this.phrases!, this.lastPhrase)
    this.lastPhrase = next
    this.msg = next
  }

  stop(ok?: string) {
    if (this.iv) { clearInterval(this.iv); this.iv = null }
    if (this.piv) { clearInterval(this.piv); this.piv = null }
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

export function renderMarkdown(text: string): string {
  const placeholders: string[] = []
  // Protect fenced code blocks
  let result = text.replace(/```(?:\w*\n)?([\s\S]*?)```/g, (_m, code: string) => {
    const idx = placeholders.length
    placeholders.push(`\x1b[2m${code.replace(/\n$/, "")}\x1b[22m`)
    return `\x00${idx}\x00`
  })
  // Protect inline code
  result = result.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const idx = placeholders.length
    placeholders.push(`\x1b[36m${code}\x1b[39m`)
    return `\x00${idx}\x00`
  })
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "\x1b[1m$1\x1b[22m")
  // Italic (avoid matching inside bold remnants)
  result = result.replace(/(?<!\*)\*(.+?)\*(?!\*)/g, "\x1b[3m$1\x1b[23m")
  // Restore placeholders
  result = result.replace(/\x00(\d+)\x00/g, (_m, idx: string) => placeholders[parseInt(idx)])
  return result
}

export function createCliCallbacks(): ChannelCallbacks {
  let currentSpinner: Spinner | null = null
  let hadReasoning = false
  let hadToolRun = false

  return {
    onModelStart: () => {
      hadReasoning = false
      const pool = hadToolRun ? FOLLOWUP_PHRASES : THINKING_PHRASES
      const first = pickPhrase(pool)
      currentSpinner = new Spinner(first, pool)
      currentSpinner.start()
    },
    onModelStreamStart: () => {
      currentSpinner?.stop()
      currentSpinner = null
    },
    onTextChunk: (text: string) => {
      if (hadReasoning) {
        process.stdout.write("\n\n")
        hadReasoning = false
      }
      process.stdout.write(renderMarkdown(text))
    },
    onReasoningChunk: (text: string) => {
      hadReasoning = true
      process.stdout.write(`\x1b[2m${text}\x1b[0m`)
    },
    onToolStart: (name: string, _args: Record<string, string>) => {
      // Stop the model-start spinner: when the model returns only tool calls
      // (no content/reasoning), onModelStreamStart never fires, so the old
      // spinner's intervals would leak.
      currentSpinner?.stop()
      const first = pickPhrase(TOOL_PHRASES)
      currentSpinner = new Spinner(first, TOOL_PHRASES)
      currentSpinner.start()
      hadToolRun = true
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
  const sessPath = sessionPath("cli", "session")
  const registry = createCommandRegistry()
  registerDefaultCommands(registry)

  // Load existing session or start fresh
  const existing = loadSession(sessPath)
  const messages: OpenAI.ChatCompletionMessageParam[] = existing?.messages && existing.messages.length > 0
    ? existing.messages
    : [{ role: "system", content: cachedBuildSystem("cli", buildSystem) }]

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const ctrl = new InputController(rl)
  let currentAbort: AbortController | null = null
  const history: string[] = []
  let closed = false
  rl.on("close", () => { closed = true })

  console.log("\nouroboros (type /commands for help)\n")

  const cliCallbacks = createCliCallbacks()

  // Only run boot greeting for fresh sessions
  if (!existing || existing.length === 0) {
    const bootAbort = new AbortController()
    ctrl.suppress(() => bootAbort.abort())
    await bootGreeting(messages, cliCallbacks, bootAbort.signal).catch(() => {})
    ctrl.restore()
    process.stdout.write("\n\n")
    saveSession(sessPath, messages)
  }

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
      if (closed) break
      if (!input.trim()) { process.stdout.write("\x1b[36m> \x1b[0m"); continue }

      // Check for slash commands
      const parsed = parseSlashCommand(input)
      if (parsed) {
        const dispatchResult = registry.dispatch(parsed.command, { channel: "cli" })
        if (dispatchResult.handled && dispatchResult.result) {
          if (dispatchResult.result.action === "exit") {
            break
          } else if (dispatchResult.result.action === "new") {
            messages.length = 0
            messages.push({ role: "system", content: cachedBuildSystem("cli", buildSystem) })
            deleteSession(sessPath)
            console.log("session cleared")
            process.stdout.write("\x1b[36m> \x1b[0m")
            continue
          } else if (dispatchResult.result.action === "response") {
            console.log(dispatchResult.result.message || "")
            process.stdout.write("\x1b[36m> \x1b[0m")
            continue
          }
        }
      }

      // Re-style the echoed input line (readline terminal:true echoes it as "> input")
      // Calculate terminal rows the echo occupied (prompt "> " + input, wrapped)
      const cols = process.stdout.columns || 80
      const echoLen = 2 + input.length // "> " prefix + input
      const rows = Math.ceil(echoLen / cols)
      process.stdout.write(`\x1b[${rows}A\x1b[K` + `\x1b[1m> ${input}\x1b[0m\n\n`)

      messages.push({ role: "user", content: input })
      addHistory(history, input)

      // Refresh system prompt
      messages[0] = { role: "system", content: cachedBuildSystem("cli", buildSystem) }

      // Trim context window
      const { maxTokens, contextMargin } = getContextConfig()
      const trimmed = trimMessages(messages, maxTokens, contextMargin)
      messages.length = 0
      messages.push(...trimmed)

      currentAbort = new AbortController()
      ctrl.suppress(() => currentAbort!.abort())
      try {
        await runAgent(messages, cliCallbacks, currentAbort.signal)
      } catch {
        // AbortError — silently return to prompt
      }
      ctrl.restore()
      currentAbort = null
      process.stdout.write("\n\n")

      saveSession(sessPath, messages)

      if (closed) break
      process.stdout.write("\x1b[36m> \x1b[0m")
    }
  } finally {
    rl.close()
    console.log("bye")
  }
}