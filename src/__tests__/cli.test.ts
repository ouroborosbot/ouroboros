import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChannelCallbacks } from "../core"

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
    const agent = await import("../agent")
    expect(typeof agent.createCliCallbacks).toBe("function")
  })

  it("returns an object implementing ChannelCallbacks", async () => {
    const agent = await import("../agent")
    const callbacks = agent.createCliCallbacks()
    expect(typeof callbacks.onModelStart).toBe("function")
    expect(typeof callbacks.onModelStreamStart).toBe("function")
    expect(typeof callbacks.onTextChunk).toBe("function")
    expect(typeof callbacks.onToolStart).toBe("function")
    expect(typeof callbacks.onToolEnd).toBe("function")
    expect(typeof callbacks.onError).toBe("function")
  })
})

describe("CLI adapter - onTextChunk think-tag dimming", () => {
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
    const agent = await import("../agent")
    callbacks = agent.createCliCallbacks()
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("outputs plain text without think tags unchanged", () => {
    callbacks.onTextChunk("hello world")
    const output = stdoutChunks.join("")
    expect(output).toContain("hello world")
    expect(output).not.toContain("\x1b[2m")
  })

  it("dims think tags at the start of content", () => {
    callbacks.onTextChunk("<think>reasoning</think>visible")
    const output = stdoutChunks.join("")
    expect(output).toContain("\x1b[2m")
    expect(output).toContain("visible")
  })

  it("dims think tags in the middle of content", () => {
    callbacks.onTextChunk("before<think>inner</think>after")
    const output = stdoutChunks.join("")
    expect(output).toContain("before")
    expect(output).toContain("\x1b[2m")
    expect(output).toContain("after")
  })

  it("handles multiple think blocks", () => {
    callbacks.onTextChunk("<think>a</think>mid<think>b</think>end")
    const output = stdoutChunks.join("")
    expect(output).toContain("mid")
    expect(output).toContain("end")
  })

  it("handles partial think opening tag split across chunks", () => {
    callbacks.onTextChunk("<thi")
    callbacks.onTextChunk("nk>inside</think>after")
    const output = stdoutChunks.join("")
    expect(output).toContain("\x1b[2m")
    expect(output).toContain("after")
  })

  it("handles partial think closing tag split across chunks", () => {
    callbacks.onTextChunk("<think>start</th")
    callbacks.onTextChunk("ink>visible")
    const output = stdoutChunks.join("")
    expect(output).toContain("visible")
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
    const agent = await import("../agent")
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
    const agent = await import("../agent")
    const callbacks = agent.createCliCallbacks()

    callbacks.onModelStart()
    stderrChunks.length = 0
    callbacks.onModelStreamStart()
    const output = stderrChunks.join("")
    expect(output).toContain("\x1b[K")

    vi.restoreAllMocks()
  })
})

describe("CLI adapter - onToolStart", () => {
  it("starts a tool-specific spinner with tool name", async () => {
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../agent")
    const callbacks = agent.createCliCallbacks()

    callbacks.onToolStart("read_file", { path: "/tmp/test.txt" })
    const output = stderrChunks.join("")
    expect(output).toContain("read_file")

    // Clean up
    callbacks.onToolEnd("read_file", "/tmp/test.txt", true)
    vi.restoreAllMocks()
  })
})

describe("CLI adapter - onToolEnd", () => {
  it("stops tool spinner and logs invocation to stdout on success", async () => {
    const stdoutChunks: string[] = []
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../agent")
    const callbacks = agent.createCliCallbacks()

    callbacks.onToolStart("read_file", { path: "/tmp/test.txt" })
    callbacks.onToolEnd("read_file", "/tmp/test.txt", true)
    const output = stdoutChunks.join("")
    expect(output).toContain("read_file")

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
    const agent = await import("../agent")
    const callbacks = agent.createCliCallbacks()

    callbacks.onToolStart("read_file", { path: "/tmp/test.txt" })
    callbacks.onToolEnd("read_file", "/tmp/test.txt", false)
    const output = stderrChunks.join("")
    expect(output).toContain("read_file")
    expect(output).toContain("error")

    vi.restoreAllMocks()
  })

  it("handles empty argSummary without extra formatting", async () => {
    const stdoutChunks: string[] = []
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    vi.resetModules()
    const agent = await import("../agent")
    const callbacks = agent.createCliCallbacks()

    callbacks.onToolStart("get_current_time", {})
    callbacks.onToolEnd("get_current_time", "", true)
    const output = stdoutChunks.join("")
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
    const agent = await import("../agent")
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
    const agent = await import("../agent")
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
    const agent = await import("../agent")
    expect(typeof agent.bootGreeting).toBe("function")
  })

  it("pushes hello as first user message", async () => {
    vi.resetModules()

    vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    // We need to mock runAgent within core
    const mockRunAgent = vi.fn()
    vi.doMock("../core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const agent = await import("../agent")
    const messages: any[] = [{ role: "system", content: "system prompt" }]
    const callbacks = agent.createCliCallbacks()
    await agent.bootGreeting(messages, callbacks)

    expect(messages.some((m: any) => m.role === "user" && m.content === "hello")).toBe(true)
    expect(mockRunAgent).toHaveBeenCalledWith(messages, callbacks)

    vi.restoreAllMocks()
  })
})
