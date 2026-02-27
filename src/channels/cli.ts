import OpenAI from "openai"
import * as readline from "readline"
import { runAgent, ChannelCallbacks } from "../engine/core"
import { buildSystem } from "../mind/prompt"
import { pickPhrase, THINKING_PHRASES, TOOL_PHRASES, FOLLOWUP_PHRASES } from "../repertoire/phrases"
import { sessionPath } from "../config"
import { loadSession, deleteSession, cachedBuildSystem, postTurn } from "../mind/context"
import { createCommandRegistry, registerDefaultCommands, parseSlashCommand, getToolChoiceRequired } from "../repertoire/commands"

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
    // rl.pause() paused stdin — resume it so our data handler receives keypresses
    process.stdin.resume()
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

export function handleSigint(_rl: readline.Interface, currentInput: string): "clear" | "warn" | "exit" {
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

// Ordered longest-first so we match ``` before ` and ** before *
const MARKERS = ["```", "**", "*", "`"] as const

export class MarkdownStreamer {
  private buf = ""
  private openMarker: string | null = null

  push(text: string): string {
    this.buf += text
    return this.drain(false)
  }

  flush(): string {
    return this.drain(true)
  }

  reset(): void {
    this.buf = ""
    this.openMarker = null
  }

  private drain(final: boolean): string {
    let out = ""

    while (this.buf.length > 0) {
      if (this.openMarker) {
        const closeIdx = this.buf.indexOf(this.openMarker)
        if (closeIdx !== -1) {
          const segment = this.openMarker + this.buf.slice(0, closeIdx + this.openMarker.length)
          out += renderMarkdown(segment)
          this.buf = this.buf.slice(closeIdx + this.openMarker.length)
          this.openMarker = null
          continue
        }
        if (final) {
          out += renderMarkdown(this.openMarker + this.buf)
          this.buf = ""
          this.openMarker = null
        }
        break
      }

      // Normal mode — look for the next opening marker
      let earliest = -1
      let matched: string | null = null
      for (const m of MARKERS) {
        const idx = this.buf.indexOf(m)
        if (idx !== -1 && (earliest === -1 || idx < earliest)) {
          earliest = idx
          matched = m
        }
      }

      if (matched !== null && earliest !== -1) {
        // If the tail from the match to end-of-buffer is a proper prefix of a
        // longer marker, hold it back rather than consuming it prematurely.
        // E.g. a trailing `*` could be the start of `**`, trailing `` ` `` could be `` ``` ``.
        const tail = this.buf.slice(earliest)
        if (!final && MARKERS.some(m => m.length > tail.length && m.startsWith(tail))) {
          if (earliest > 0) {
            out += renderMarkdown(this.buf.slice(0, earliest))
            this.buf = this.buf.slice(earliest)
          }
          break
        }
        if (earliest > 0) {
          out += renderMarkdown(this.buf.slice(0, earliest))
        }
        this.buf = this.buf.slice(earliest + matched.length)
        this.openMarker = matched
        continue
      }

      out += renderMarkdown(this.buf)
      this.buf = ""
      break
    }

    return out
  }
}

export function createCliCallbacks(): ChannelCallbacks & { flushMarkdown(): void } {
  let currentSpinner: Spinner | null = null
  let hadReasoning = false
  let hadToolRun = false
  let textDirty = false // true when text/reasoning was written without a trailing newline
  const streamer = new MarkdownStreamer()

  return {
    onModelStart: () => {
      hadReasoning = false
      textDirty = false
      streamer.reset()
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
      const rendered = streamer.push(text)
      if (rendered) process.stdout.write(rendered)
      textDirty = text.length > 0 && !text.endsWith("\n")
    },
    onReasoningChunk: (text: string) => {
      hadReasoning = true
      process.stdout.write(`\x1b[2m${text}\x1b[0m`)
      textDirty = text.length > 0 && !text.endsWith("\n")
    },
    onToolStart: (_name: string, _args: Record<string, string>) => {
      // Stop the model-start spinner: when the model returns only tool calls
      // (no content/reasoning), onModelStreamStart never fires, so the old
      // spinner's intervals would leak.
      currentSpinner?.stop()
      // Ensure the spinner starts on a fresh line so it doesn't overwrite
      // the last line of text/reasoning output via \r\x1b[K
      if (textDirty) {
        process.stdout.write("\n")
        textDirty = false
      }
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
    onKick: (attempt: number, maxKicks: number) => {
      currentSpinner?.stop()
      currentSpinner = null
      if (textDirty) {
        process.stdout.write("\n")
        textDirty = false
      }
      const counter = maxKicks > 1 ? ` ${attempt}/${maxKicks}` : ""
      process.stderr.write(`\x1b[33m↻ kick${counter}\x1b[0m\n`)
    },
    flushMarkdown: () => {
      const remaining = streamer.flush()
      if (remaining) process.stdout.write(remaining)
    },
  }
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

      currentAbort = new AbortController()
      ctrl.suppress(() => currentAbort!.abort())
      let result: { usage?: any } | undefined
      try {
        result = await runAgent(messages, cliCallbacks, "cli", currentAbort.signal, { toolChoiceRequired: getToolChoiceRequired() })
      } catch {
        // AbortError — silently return to prompt
      }
      cliCallbacks.flushMarkdown()
      ctrl.restore()
      currentAbort = null

      // Safety net: never silently swallow an empty response
      const lastMsg = messages[messages.length - 1] as any
      if (lastMsg?.role === "assistant" && !lastMsg.content?.trim()) {
        process.stderr.write("\x1b[33m(empty response)\x1b[0m\n")
      }

      process.stdout.write("\n\n")

      postTurn(messages, sessPath, result?.usage)

      if (closed) break
      process.stdout.write("\x1b[36m> \x1b[0m")
    }
  } finally {
    rl.close()
    console.log("bye")
  }
}