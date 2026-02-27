import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChannelCallbacks } from "../../engine/core"
import { THINKING_PHRASES, TOOL_PHRASES, FOLLOWUP_PHRASES } from "../../repertoire/phrases"

// These imports will fail until agent.ts is refactored to export them.
// That's exactly the point -- tests must FAIL (red) for Unit 2a.

describe("CLI adapter - createCliCallbacks", () => {
  let stdoutChunks: string[]
  let stderrChunks: string[]
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutChunks = []
    stderrChunks = []
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutChunks.push(chunk.toString())
      return true
    })
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("is exported from agent.ts", async () => {
    const agent = await import("../../channels/cli")
    expect(typeof agent.createCliCallbacks).toBe("function")
  })

  it("returns an object implementing ChannelCallbacks", async () => {
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()
    expect(typeof callbacks.onModelStart).toBe("function")
    expect(typeof callbacks.onModelStreamStart).toBe("function")
    expect(typeof callbacks.onTextChunk).toBe("function")
    expect(typeof callbacks.onToolStart).toBe("function")
    expect(typeof callbacks.onToolEnd).toBe("function")
    expect(typeof callbacks.onError).toBe("function")
  })
})

describe("CLI adapter - renderMarkdown", () => {
  it("renders **bold** as ANSI bold", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    expect(agent.renderMarkdown("hello **world**")).toBe("hello \x1b[1mworld\x1b[22m")
  })

  it("renders *italic* as ANSI italic", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    expect(agent.renderMarkdown("hello *world*")).toBe("hello \x1b[3mworld\x1b[23m")
  })

  it("renders `code` as ANSI cyan", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    expect(agent.renderMarkdown("use `npm install`")).toBe("use \x1b[36mnpm install\x1b[39m")
  })

  it("renders code blocks as ANSI dim", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    const input = "code:\n```\nconst x = 1\n```"
    const expected = "code:\n\x1b[2mconst x = 1\x1b[22m"
    expect(agent.renderMarkdown(input)).toBe(expected)
  })

  it("passes plain text through unchanged", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    expect(agent.renderMarkdown("no markdown here")).toBe("no markdown here")
  })

  it("does not render markdown inside code blocks", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    const input = "```\n**not bold**\n```"
    const expected = "\x1b[2m**not bold**\x1b[22m"
    expect(agent.renderMarkdown(input)).toBe(expected)
  })

  it("does not render markdown inside inline code", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    expect(agent.renderMarkdown("`**not bold**`")).toBe("\x1b[36m**not bold**\x1b[39m")
  })

  it("handles bold and italic together", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    expect(agent.renderMarkdown("**bold** and *italic*")).toBe(
      "\x1b[1mbold\x1b[22m and \x1b[3mitalic\x1b[23m"
    )
  })

  it("handles code blocks with language specifier", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    const input = "```ts\nconst x = 1\n```"
    const expected = "\x1b[2mconst x = 1\x1b[22m"
    expect(agent.renderMarkdown(input)).toBe(expected)
  })
})

describe("CLI adapter - MarkdownStreamer", () => {
  let MarkdownStreamer: typeof import("../../channels/cli").MarkdownStreamer

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import("../../channels/cli")
    MarkdownStreamer = mod.MarkdownStreamer
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("passes plain text through immediately", () => {
    const s = new MarkdownStreamer()
    expect(s.push("hello world")).toBe("hello world")
  })

  it("buffers bold marker split across chunks", () => {
    const s = new MarkdownStreamer()
    const out1 = s.push("hello **")
    // "hello " is flushed, "**" opens bold buffering
    expect(out1).toBe("hello ")
    const out2 = s.push("bold")
    // still inside bold, nothing flushed
    expect(out2).toBe("")
    const out3 = s.push("** rest")
    // bold closes, rest flushed
    expect(out3).toContain("\x1b[1mbold\x1b[22m")
    expect(out3).toContain(" rest")
  })

  it("buffers inline code split across chunks", () => {
    const s = new MarkdownStreamer()
    const out1 = s.push("use `")
    expect(out1).toBe("use ")
    const out2 = s.push("npm install")
    expect(out2).toBe("")
    const out3 = s.push("` ok")
    expect(out3).toContain("\x1b[36mnpm install\x1b[39m")
    expect(out3).toContain(" ok")
  })

  it("buffers code block split across chunks", () => {
    const s = new MarkdownStreamer()
    const out1 = s.push("code:\n```")
    expect(out1).toBe("code:\n")
    const out2 = s.push("\nconst x = 1\n")
    expect(out2).toBe("")
    const out3 = s.push("``` done")
    expect(out3).toContain("\x1b[2m")
    expect(out3).toContain("const x = 1")
    expect(out3).toContain(" done")
  })

  it("holds back partial marker at end of chunk", () => {
    const s = new MarkdownStreamer()
    // single * at end could be start of ** or italic
    const out1 = s.push("hello *")
    expect(out1).toBe("hello ")
    // next chunk completes **
    const out2 = s.push("*bold**")
    expect(out2).toContain("\x1b[1mbold\x1b[22m")
  })

  it("holds back single backtick at end of chunk", () => {
    const s = new MarkdownStreamer()
    const out1 = s.push("use `")
    expect(out1).toBe("use ")
    const out2 = s.push("cmd` ok")
    expect(out2).toContain("\x1b[36mcmd\x1b[39m")
    expect(out2).toContain(" ok")
  })

  it("holds back double backtick at end of chunk (prefix of ```)", () => {
    const s = new MarkdownStreamer()
    const out1 = s.push("code: ``")
    // "code: " flushed, "``" held back (prefix of ```)
    expect(out1).toBe("code: ")
    const out2 = s.push("`\nconst x = 1\n```")
    expect(out2).toContain("\x1b[2m")
    expect(out2).toContain("const x = 1")
  })

  it("flush renders remaining buffer literally on stream end", () => {
    const s = new MarkdownStreamer()
    s.push("unclosed **bold")
    const out = s.flush()
    // Should render the raw ** and text literally (no ANSI bold)
    expect(out).toContain("**bold")
  })

  it("flush renders incomplete inline code literally", () => {
    const s = new MarkdownStreamer()
    s.push("unclosed `code")
    const out = s.flush()
    expect(out).toContain("`code")
  })

  it("reset clears buffer state", () => {
    const s = new MarkdownStreamer()
    s.push("**open")
    s.reset()
    expect(s.push("plain")).toBe("plain")
  })

  it("handles complete markdown in single chunk", () => {
    const s = new MarkdownStreamer()
    const out = s.push("**bold** and `code`")
    expect(out).toContain("\x1b[1mbold\x1b[22m")
    expect(out).toContain("\x1b[36mcode\x1b[39m")
  })

  it("handles italic split across chunks", () => {
    const s = new MarkdownStreamer()
    const out1 = s.push("hello *")
    expect(out1).toBe("hello ")
    // next chunk doesn't start with *, so it's italic
    const out2 = s.push("italic* rest")
    expect(out2).toContain("\x1b[3mitalic\x1b[23m")
    expect(out2).toContain(" rest")
  })

  it("handles multiple sequential markers", () => {
    const s = new MarkdownStreamer()
    const out = s.push("**a** then `b`")
    expect(out).toContain("\x1b[1ma\x1b[22m")
    expect(out).toContain("\x1b[36mb\x1b[39m")
  })

  it("holds back lone marker prefix that could start a longer marker", () => {
    const s = new MarkdownStreamer()
    // Buffer is just "*" — could be start of "**"
    const out1 = s.push("*")
    expect(out1).toBe("")
    const out2 = s.push("*bold**")
    expect(out2).toContain("\x1b[1mbold\x1b[22m")
  })

  it("consecutive pushes without markers accumulate nothing", () => {
    const s = new MarkdownStreamer()
    expect(s.push("hello ")).toBe("hello ")
    expect(s.push("world")).toBe("world")
    expect(s.flush()).toBe("")
  })
})

describe("CLI adapter - streaming onTextChunk with MarkdownStreamer", () => {
  let stdoutChunks: string[]
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let callbacks: ChannelCallbacks & { flushMarkdown(): void }

  beforeEach(async () => {
    stdoutChunks = []
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutChunks.push(chunk.toString())
      return true
    })
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    callbacks = agent.createCliCallbacks()
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("bold split across two chunks renders correctly after flush", () => {
    callbacks.onTextChunk("hello **")
    callbacks.onTextChunk("world**")
    callbacks.flushMarkdown()
    const output = stdoutChunks.join("")
    expect(output).toContain("hello ")
    expect(output).toContain("\x1b[1mworld\x1b[22m")
  })

  it("inline code split across chunks renders correctly", () => {
    callbacks.onTextChunk("use `")
    callbacks.onTextChunk("npm install")
    callbacks.onTextChunk("` now")
    callbacks.flushMarkdown()
    const output = stdoutChunks.join("")
    expect(output).toContain("\x1b[36mnpm install\x1b[39m")
  })

  it("complete markdown in single chunk renders immediately", () => {
    callbacks.onTextChunk("**bold** text")
    callbacks.flushMarkdown()
    const output = stdoutChunks.join("")
    expect(output).toContain("\x1b[1mbold\x1b[22m")
    expect(output).toContain(" text")
  })

  it("flushMarkdown renders incomplete markers literally", () => {
    callbacks.onTextChunk("unclosed **bold")
    callbacks.flushMarkdown()
    const output = stdoutChunks.join("")
    expect(output).toContain("**bold")
  })

  it("onModelStart resets streamer state", () => {
    callbacks.onTextChunk("**open")
    callbacks.onModelStart()
    callbacks.onModelStreamStart()
    stdoutChunks.length = 0
    callbacks.onTextChunk("plain text")
    callbacks.flushMarkdown()
    const output = stdoutChunks.join("")
    expect(output).toBe("plain text")
  })
})

describe("CLI adapter - onReasoningChunk and onTextChunk rendering", () => {
  let stdoutChunks: string[]
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let callbacks: ChannelCallbacks

  beforeEach(async () => {
    stdoutChunks = []
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutChunks.push(chunk.toString())
      return true
    })
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    callbacks = agent.createCliCallbacks()
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("onTextChunk streams text to stdout immediately", () => {
    callbacks.onTextChunk("hello world")
    expect(stdoutChunks.join("")).toBe("hello world")
  })

  it("onTextChunk applies markdown rendering", () => {
    callbacks.onTextChunk("hello **world**")
    expect(stdoutChunks.join("")).toBe("hello \x1b[1mworld\x1b[22m")
  })

  it("onReasoningChunk outputs dim text", () => {
    callbacks.onReasoningChunk("reasoning")
    const output = stdoutChunks.join("")
    expect(output).toContain("\x1b[2m")
    expect(output).toContain("reasoning")
    expect(output).toContain("\x1b[0m")
  })

  it("reasoning then content: \\n\\n separator before text on stdout", () => {
    callbacks.onReasoningChunk("thinking")
    callbacks.onTextChunk("answer")
    const output = stdoutChunks.join("")
    expect(output).toContain("\x1b[2mthinking\x1b[0m")
    expect(output).toContain("\n\nanswer")
  })

  it("text-only response has no \\n\\n prefix", () => {
    callbacks.onTextChunk("just text")
    const output = stdoutChunks.join("")
    expect(output).toBe("just text")
    expect(output).not.toContain("\n\n")
  })

  it("multiple reasoning chunks before text: only one \\n\\n separator", () => {
    callbacks.onReasoningChunk("step1")
    callbacks.onReasoningChunk("step2")
    callbacks.onTextChunk("answer")
    const output = stdoutChunks.join("")
    const matches = output.match(/\n\n/g)
    expect(matches).toHaveLength(1)
  })

  it("onModelStart resets reasoning state for new turn", () => {
    callbacks.onReasoningChunk("thinking")
    callbacks.onModelStart()
    callbacks.onModelStreamStart()
    stdoutChunks.length = 0
    callbacks.onTextChunk("answer")
    const output = stdoutChunks.join("")
    expect(output).toBe("answer")
    expect(output).not.toContain("\n\n")
  })

  it("multiple reasoning chunks are all dim", () => {
    callbacks.onReasoningChunk("chunk1")
    callbacks.onReasoningChunk("chunk2")
    const output = stdoutChunks.join("")
    expect(output).toContain("\x1b[2mchunk1\x1b[0m")
    expect(output).toContain("\x1b[2mchunk2\x1b[0m")
  })

  it("content-only: no dim codes on stdout", () => {
    callbacks.onTextChunk("just text")
    const output = stdoutChunks.join("")
    expect(output).toBe("just text")
    expect(output).not.toContain("\x1b[2m")
  })
})

describe("CLI adapter - onModelStart", () => {
  it("starts spinner on stderr", async () => {
    const stderrChunks: string[] = []
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onModelStart()
    // Spinner writes to stderr
    expect(stderrChunks.length).toBeGreaterThan(0)

    // Clean up spinner interval
    callbacks.onModelStreamStart()
    stderrSpy.mockRestore()
    vi.restoreAllMocks()
  })
})

describe("CLI adapter - onModelStreamStart", () => {
  it("stops spinner by clearing line on stderr", async () => {
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onModelStart()
    stderrChunks.length = 0
    callbacks.onModelStreamStart()
    const output = stderrChunks.join("")
    expect(output).toContain("\x1b[K")

    vi.restoreAllMocks()
  })

  it("handles stop without prior start (no interval to clear)", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")

    // Directly test Spinner.stop() without start() — covers the this.iv === null branch
    const s = new agent.Spinner("test")
    expect(() => s.stop()).not.toThrow()

    vi.restoreAllMocks()
  })

  it("interval callback fires and advances spinner frame", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")

    // Start spinner and let the setInterval callback fire
    const s = new agent.Spinner("test")
    s.start()
    await new Promise((r) => setTimeout(r, 100))
    s.stop()

    vi.restoreAllMocks()
  })
})

describe("CLI adapter - onToolStart", () => {
  it("starts a spinner with a phrase from TOOL_PHRASES", async () => {
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onToolStart("read_file", { path: "/tmp/test.txt" })
    const output = stderrChunks.join("")
    expect(TOOL_PHRASES.some(p => output.includes(p))).toBe(true)

    // Clean up
    callbacks.onToolEnd("read_file", "/tmp/test.txt", true)
    vi.restoreAllMocks()
  })

  it("emits newline before spinner when text was streamed without trailing newline", async () => {
    const stdoutChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutChunks.push(chunk.toString())
      return true
    })

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onModelStart()
    callbacks.onModelStreamStart()
    callbacks.onTextChunk("some text")
    callbacks.flushMarkdown()
    stdoutChunks.length = 0
    callbacks.onToolStart("read_file", { path: "x" })
    // Should have emitted a \n to avoid spinner clobbering text
    expect(stdoutChunks.join("")).toContain("\n")

    callbacks.onToolEnd("read_file", "x", true)
    vi.restoreAllMocks()
  })
})

describe("CLI adapter - onToolEnd", () => {
  it("stops tool spinner with checkmark on stderr on success", async () => {
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onToolStart("read_file", { path: "/tmp/test.txt" })
    callbacks.onToolEnd("read_file", "/tmp/test.txt", true)
    const output = stderrChunks.join("")
    expect(output).toContain("read_file")
    expect(output).toContain("\u2713") // checkmark

    vi.restoreAllMocks()
  })

  it("shows failure on stderr when success is false", async () => {
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onToolStart("read_file", { path: "/tmp/test.txt" })
    callbacks.onToolEnd("read_file", "/tmp/test.txt", false)
    const output = stderrChunks.join("")
    expect(output).toContain("read_file")
    expect(output).toContain("error")

    vi.restoreAllMocks()
  })

  it("handles empty argSummary without extra formatting", async () => {
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onToolStart("get_current_time", {})
    callbacks.onToolEnd("get_current_time", "", true)
    const output = stderrChunks.join("")
    expect(output).toContain("get_current_time")
    // Should not have extra parentheses for empty summary
    expect(output).not.toContain("()")

    vi.restoreAllMocks()
  })
})

describe("CLI adapter - onError", () => {
  it("writes error to stderr", async () => {
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onError(new Error("connection failed"))
    const output = stderrChunks.join("")
    expect(output).toContain("connection failed")

    vi.restoreAllMocks()
  })

  it("clears active spinner before showing error", async () => {
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onModelStart() // start spinner
    stderrChunks.length = 0
    callbacks.onError(new Error("timeout"))
    const output = stderrChunks.join("")
    // Should clear spinner and show error
    expect(output).toContain("timeout")
    expect(output).toContain("request failed")

    vi.restoreAllMocks()
  })
})

describe("CLI adapter - phrase rotation", () => {
  let stderrChunks: string[]
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stderrChunks = []
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("onModelStart uses a THINKING_PHRASES phrase", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onModelStart()
    const output = stderrChunks.join("")
    expect(THINKING_PHRASES.some(p => output.includes(p))).toBe(true)

    callbacks.onModelStreamStart()
  })

  it("onModelStart after tool uses FOLLOWUP_PHRASES", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    // First model call
    callbacks.onModelStart()
    callbacks.onModelStreamStart()
    // Tool run
    callbacks.onToolStart("read_file", { path: "x" })
    callbacks.onToolEnd("read_file", "x", true)
    // Second model call — should use followup phrases
    stderrChunks.length = 0
    callbacks.onModelStart()
    const output = stderrChunks.join("")
    expect(FOLLOWUP_PHRASES.some(p => output.includes(p))).toBe(true)

    callbacks.onModelStreamStart()
  })

  it("spinner rotates phrase after 1.5s", async () => {
    vi.useFakeTimers()

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onModelStart()
    const firstOutput = stderrChunks.join("")

    stderrChunks.length = 0
    vi.advanceTimersByTime(1500)
    const secondOutput = stderrChunks.join("")

    // After rotation, output should contain a phrase from the pool
    expect(THINKING_PHRASES.some(p => secondOutput.includes(p))).toBe(true)

    callbacks.onModelStreamStart()
    vi.useRealTimers()
  })

  it("onModelStreamStart stops phrase rotation", async () => {
    vi.useFakeTimers()

    vi.resetModules()
    const agent = await import("../../channels/cli")
    const callbacks = agent.createCliCallbacks()

    callbacks.onModelStart()
    callbacks.onModelStreamStart()

    stderrChunks.length = 0
    vi.advanceTimersByTime(3000)
    // No more spinner output after stop
    const output = stderrChunks.join("")
    expect(output).toBe("")

    vi.useRealTimers()
  })
})
