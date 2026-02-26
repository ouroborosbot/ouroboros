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

  it("onTextChunk outputs plain text unchanged (no dim, no tag parsing)", () => {
    callbacks.onTextChunk("hello world")
    const output = stdoutChunks.join("")
    expect(output).toContain("hello world")
    expect(output).not.toContain("\x1b[2m")
  })

  it("onReasoningChunk outputs dim text", () => {
    callbacks.onReasoningChunk("reasoning")
    const output = stdoutChunks.join("")
    expect(output).toContain("\x1b[2m")
    expect(output).toContain("reasoning")
    expect(output).toContain("\x1b[0m")
  })

  it("reasoning then content: dim followed by \\n\\n then normal", () => {
    callbacks.onReasoningChunk("thinking")
    callbacks.onTextChunk("answer")
    const output = stdoutChunks.join("")
    expect(output).toContain("\x1b[2m")
    expect(output).toContain("thinking")
    expect(output).toContain("\n\n")
    expect(output).toContain("answer")
    // The \n\n should appear between reasoning and answer
    const nnIdx = output.indexOf("\n\n")
    const thinkIdx = output.indexOf("thinking")
    const answerIdx = output.indexOf("answer")
    expect(nnIdx).toBeGreaterThan(thinkIdx)
    expect(answerIdx).toBeGreaterThan(nnIdx)
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
    // Should have exactly one \n\n (between reasoning and text)
    const matches = output.match(/\n\n/g)
    expect(matches).toHaveLength(1)
  })

  it("onModelStart resets reasoning state for new turn", () => {
    callbacks.onReasoningChunk("thinking")
    callbacks.onModelStart()
    callbacks.onModelStreamStart()
    callbacks.onTextChunk("answer")
    const output = stdoutChunks.join("")
    // No \n\n because onModelStart reset the state
    expect(output).not.toContain("\n\nanswer")
  })

  it("multiple reasoning chunks are all dim", () => {
    callbacks.onReasoningChunk("chunk1")
    callbacks.onReasoningChunk("chunk2")
    const output = stdoutChunks.join("")
    // Both chunks should have dim codes
    expect(output).toContain("\x1b[2mchunk1\x1b[0m")
    expect(output).toContain("\x1b[2mchunk2\x1b[0m")
  })

  it("content-only: no dim codes in output", () => {
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

describe("CLI adapter - bootGreeting", () => {
  it("is exported from agent.ts", async () => {
    vi.resetModules()
    const agent = await import("../../channels/cli")
    expect(typeof agent.bootGreeting).toBe("function")
  })

  it("pushes hello as first user message", async () => {
    vi.resetModules()

    vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    // We need to mock runAgent within core
    const mockRunAgent = vi.fn()
    vi.doMock("../../engine/core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const agent = await import("../../channels/cli")
    const messages: any[] = [{ role: "system", content: "system prompt" }]
    const callbacks = agent.createCliCallbacks()
    await agent.bootGreeting(messages, callbacks)

    expect(messages.some((m: any) => m.role === "user" && m.content === "hello")).toBe(true)
    expect(mockRunAgent).toHaveBeenCalledWith(messages, callbacks, undefined)

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
