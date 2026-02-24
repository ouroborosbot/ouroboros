import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChannelCallbacks } from "../core"

// Tests for src/teams.ts Teams channel adapter.

describe("Teams adapter - exports", () => {
  it("exports createTeamsCallbacks", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    expect(typeof teams.createTeamsCallbacks).toBe("function")
  })

  it("exports startTeamsApp", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    expect(typeof teams.startTeamsApp).toBe("function")
  })

  it("exports stripThinkTags", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    expect(typeof teams.stripThinkTags).toBe("function")
  })
})

describe("Teams adapter - stripThinkTags", () => {
  let stripThinkTags: (text: string) => string

  beforeEach(async () => {
    vi.resetModules()
    const teams = await import("../teams")
    stripThinkTags = teams.stripThinkTags
  })

  it("passes through text with no think tags", () => {
    expect(stripThinkTags("hello world")).toBe("hello world")
  })

  it("strips think tag at start", () => {
    expect(stripThinkTags("<think>reasoning</think>visible")).toBe("visible")
  })

  it("strips think tag at end", () => {
    expect(stripThinkTags("visible<think>reasoning</think>")).toBe("visible")
  })

  it("strips think tag in middle", () => {
    expect(stripThinkTags("before<think>inner</think>after")).toBe("beforeafter")
  })

  it("strips multiple think blocks", () => {
    expect(stripThinkTags("<think>a</think>mid<think>b</think>end")).toBe("midend")
  })

  it("returns empty string when content is only think tags", () => {
    expect(stripThinkTags("<think>only thinking</think>")).toBe("")
  })

  it("handles empty string", () => {
    expect(stripThinkTags("")).toBe("")
  })
})

describe("Teams adapter - createTeamsCallbacks (buffered streaming)", () => {
  let mockStream: { emit: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
  let controller: AbortController

  beforeEach(() => {
    vi.useFakeTimers()
    mockStream = {
      emit: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
    }
    controller = new AbortController()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("onModelStart sends thinking status update", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onModelStart()
    expect(mockStream.update).toHaveBeenCalledWith("thinking...")
  })

  it("onModelStreamStart is a no-op (does not throw)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)
    expect(() => callbacks.onModelStreamStart()).not.toThrow()
  })

  // --- Cumulative content tests ---

  it("first emit contains the full cumulative text", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onTextChunk("Hello")
    vi.advanceTimersByTime(1500)
    expect(mockStream.emit).toHaveBeenCalledWith("Hello")
  })

  it("second emit contains all previous content plus new (cumulative)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("Hello")
    vi.advanceTimersByTime(1500)
    expect(mockStream.emit).toHaveBeenCalledWith("Hello")

    callbacks.onTextChunk(" world")
    vi.advanceTimersByTime(1500)
    expect(mockStream.emit).toHaveBeenCalledWith("Hello world")
  })

  // --- Buffered flushing tests ---

  it("does not emit before timer fires (content is held)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onTextChunk("buffered")
    // Do NOT advance timers
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("multiple rapid chunks result in a single emit after timer fires", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("a")
    callbacks.onTextChunk("b")
    callbacks.onTextChunk("c")
    vi.advanceTimersByTime(1500)

    // Should be exactly one emit call with cumulative "abc"
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("abc")
  })

  it("timer resets on each chunk (debounce behavior)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("a")
    vi.advanceTimersByTime(1000) // not yet 1500ms
    expect(mockStream.emit).not.toHaveBeenCalled()

    callbacks.onTextChunk("b") // resets the timer
    vi.advanceTimersByTime(1000) // 1000ms after "b", not yet 1500ms total
    expect(mockStream.emit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500) // now 1500ms after "b"
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("ab")
  })

  // --- Flush-on-close tests ---

  it("flush() emits remaining buffer without waiting for timer", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks, flush } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("remaining")
    flush()

    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("remaining")
  })

  it("flush() after already-emitted content sends cumulative total", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks, flush } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("first")
    vi.advanceTimersByTime(1500)
    expect(mockStream.emit).toHaveBeenCalledWith("first")

    callbacks.onTextChunk(" second")
    flush()
    expect(mockStream.emit).toHaveBeenCalledWith("first second")
  })

  // --- Stop-streaming tests ---

  it("when emit throws (403), controller is aborted", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.emit.mockImplementation(() => { throw new Error("403 Forbidden") })
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("data")
    vi.advanceTimersByTime(1500)

    expect(controller.signal.aborted).toBe(true)
  })

  it("after abort, subsequent onTextChunk calls do not emit", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.emit.mockImplementationOnce(() => { throw new Error("403 Forbidden") })
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("first")
    vi.advanceTimersByTime(1500) // this throws and aborts

    mockStream.emit.mockClear()
    callbacks.onTextChunk("second")
    vi.advanceTimersByTime(1500)

    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("onError after abort does not emit (graceful stop)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.emit.mockImplementationOnce(() => { throw new Error("403 Forbidden") })
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("data")
    vi.advanceTimersByTime(1500) // triggers abort

    mockStream.emit.mockClear()
    callbacks.onError(new Error("connection lost"))
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  // --- Think-tag stripping with cumulative content ---

  it("think tags stripped, visible text accumulated cumulatively", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("<think>reasoning</think>visible")
    vi.advanceTimersByTime(1500)
    expect(mockStream.emit).toHaveBeenCalledWith("visible")

    callbacks.onTextChunk(" more")
    vi.advanceTimersByTime(1500)
    expect(mockStream.emit).toHaveBeenCalledWith("visible more")
  })

  it("think tags split across chunks with cumulative emit", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("<think>")
    callbacks.onTextChunk("reasoning")
    callbacks.onTextChunk("</think>")
    callbacks.onTextChunk("visible")
    vi.advanceTimersByTime(1500)

    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("visible")
  })

  it("content that is only think tags does not emit", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("<think>only thinking</think>")
    vi.advanceTimersByTime(1500)
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  // --- Leading whitespace trimming with cumulative content ---

  it("leading whitespace trimmed after think block", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("<think>reasoning</think>\n\nhello")
    vi.advanceTimersByTime(1500)
    expect(mockStream.emit).toHaveBeenCalledWith("hello")
  })

  it("preserves whitespace after first real content", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("first")
    vi.advanceTimersByTime(1500)

    callbacks.onTextChunk("\n\nsecond")
    vi.advanceTimersByTime(1500)
    // Cumulative: "first" + "\n\nsecond" = "first\n\nsecond"
    expect(mockStream.emit).toHaveBeenCalledWith("first\n\nsecond")
  })

  // --- Tool/status callbacks unchanged ---

  it("onToolStart sends informative status", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolStart("read_file", { path: "package.json" })
    expect(mockStream.update).toHaveBeenCalledWith("running read_file (package.json)...")
  })

  it("onToolEnd updates status with result summary", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolEnd("read_file", "package.json", true)
    expect(mockStream.update).toHaveBeenCalledWith("package.json")
  })

  it("onToolEnd handles empty summary", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolEnd("get_current_time", "", true)
    expect(mockStream.update).toHaveBeenCalledWith("get_current_time done")
  })

  it("onToolEnd handles failure", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolEnd("read_file", "missing.txt", false)
    expect(mockStream.update).toHaveBeenCalledWith("read_file failed: missing.txt")
  })

  it("onError sends error text to stream via emit", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onError(new Error("something broke"))
    // onError emits immediately (not buffered)
    expect(mockStream.emit).toHaveBeenCalledWith("Error: something broke")
  })
})

describe("Teams adapter - message handling", () => {
  it("on incoming message, pushes system and user message and calls runAgent", async () => {
    vi.resetModules()

    const mockRunAgent = vi.fn()
    vi.doMock("../core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const teams = await import("../teams")

    const mockStream = {
      emit: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
    }

    await teams.handleTeamsMessage("hello from Teams", mockStream as any)

    expect(mockRunAgent).toHaveBeenCalled()
    const messages = mockRunAgent.mock.calls[0][0]
    expect(messages.some((m: any) => m.role === "system")).toBe(true)
    expect(messages.some((m: any) => m.role === "user" && m.content === "hello from Teams")).toBe(true)
  })

  it("passes AbortSignal to runAgent", async () => {
    vi.resetModules()

    const mockRunAgent = vi.fn()
    vi.doMock("../core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const teams = await import("../teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("test", mockStream as any)

    // Third argument to runAgent should be an AbortSignal
    expect(mockRunAgent).toHaveBeenCalled()
    const signal = mockRunAgent.mock.calls[0][2]
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it("flushes and closes stream after runAgent completes", async () => {
    vi.resetModules()

    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const teams = await import("../teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hi", mockStream as any)

    expect(mockStream.close).toHaveBeenCalled()
  })

  it("uses single global messages array across calls", async () => {
    vi.resetModules()

    const capturedMessages: any[][] = []
    const mockRunAgent = vi.fn().mockImplementation((msgs: any[]) => {
      capturedMessages.push([...msgs])
    })
    vi.doMock("../core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const teams = await import("../teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }

    await teams.handleTeamsMessage("first", mockStream as any)
    await teams.handleTeamsMessage("second", mockStream as any)

    expect(capturedMessages[1].length).toBeGreaterThan(capturedMessages[0].length)
  })
})

describe("Teams adapter - startTeamsApp", () => {
  it("creates App with DevtoolsPlugin and starts it", async () => {
    vi.resetModules()

    const mockOn = vi.fn()
    const mockStart = vi.fn()
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = mockOn
        start = mockStart
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(mockOn).toHaveBeenCalledWith("message", expect.any(Function))
    expect(mockStart).toHaveBeenCalledWith(3978)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Teams bot started"))

    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("uses PORT env var when set", async () => {
    vi.resetModules()

    const mockStart = vi.fn()
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn()
        start = mockStart
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    process.env.PORT = "4000"
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(mockStart).toHaveBeenCalledWith(4000)

    delete process.env.PORT
    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("message handler calls handleTeamsMessage with text and stream", async () => {
    vi.resetModules()

    let capturedHandler: ((args: any) => Promise<void>) | null = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn().mockImplementation((_event: string, handler: any) => {
          capturedHandler = handler
        })
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))

    const mockRunAgent = vi.fn()
    vi.doMock("../core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(capturedHandler).not.toBeNull()

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await capturedHandler!({
      stream: mockStream,
      activity: { text: "hello from devtools" },
    })

    expect(mockRunAgent).toHaveBeenCalled()
    expect(mockStream.close).toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it("message handler handles missing activity.text", async () => {
    vi.resetModules()

    let capturedHandler: ((args: any) => Promise<void>) | null = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn().mockImplementation((_event: string, handler: any) => {
          capturedHandler = handler
        })
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))

    const mockRunAgent = vi.fn()
    vi.doMock("../core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await capturedHandler!({
      stream: mockStream,
      activity: {}, // no text property
    })

    expect(mockRunAgent).toHaveBeenCalled()
    const messages = mockRunAgent.mock.calls[0][0]
    const userMsg = messages.filter((m: any) => m.role === "user").pop()
    expect(userMsg.content).toBe("")

    vi.restoreAllMocks()
  })
})
