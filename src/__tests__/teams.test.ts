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

  it("flush() with empty buffer does not emit", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { flush } = teams.createTeamsCallbacks(mockStream as any, controller)
    flush()
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("flush() after abort does not emit (stopped flag)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.emit.mockImplementation(() => { throw new Error("403 Forbidden") })
    const { callbacks, flush } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("data")
    vi.advanceTimersByTime(1500) // triggers abort via emit error

    mockStream.emit.mockClear()
    callbacks.onTextChunk("more data")
    flush()
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  // --- update() error handling ---

  it("when update throws (403), controller is aborted", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.update.mockImplementation(() => { throw new Error("403 Forbidden") })
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onToolStart("read_file", { path: "test.txt" })
    expect(controller.signal.aborted).toBe(true)
  })

  it("after abort via update, subsequent updates are skipped", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.update.mockImplementationOnce(() => { throw new Error("403") })
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart() // this throws and aborts
    mockStream.update.mockClear()
    callbacks.onToolStart("shell", { command: "ls" }) // should be skipped
    expect(mockStream.update).not.toHaveBeenCalled()
  })

  // --- Timer fires after abort via update (covers !stopped false branch in timer callback) ---

  it("debounce timer firing after abort via update does not emit", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const { callbacks } = teams.createTeamsCallbacks(mockStream as any, controller)

    // Schedule a debounce timer by sending text content
    callbacks.onTextChunk("data")
    // Advance partway -- timer not yet fired
    vi.advanceTimersByTime(1000)

    // Now make update throw -- this sets stopped=true WITHOUT clearing the timer
    mockStream.update.mockImplementation(() => { throw new Error("403") })
    callbacks.onToolStart("read_file", { path: "test.txt" })
    expect(controller.signal.aborted).toBe(true)

    // Now let the original debounce timer fire -- should be a no-op since stopped=true
    mockStream.emit.mockClear()
    vi.advanceTimersByTime(500)
    expect(mockStream.emit).not.toHaveBeenCalled()
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

describe("Teams adapter - stripMentions", () => {
  let stripMentions: (text: string) => string

  beforeEach(async () => {
    vi.resetModules()
    const teams = await import("../teams")
    stripMentions = teams.stripMentions
  })

  it("is exported from teams.ts", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    expect(typeof teams.stripMentions).toBe("function")
  })

  it("returns text unchanged when no mentions", () => {
    expect(stripMentions("hello world")).toBe("hello world")
  })

  it("strips mention at start of text", () => {
    expect(stripMentions("<at>Ouroboros</at> hello")).toBe("hello")
  })

  it("strips mention in middle of text", () => {
    expect(stripMentions("hey <at>Ouroboros</at> do something")).toBe("hey  do something")
  })

  it("strips multiple mentions", () => {
    expect(stripMentions("<at>Bot</at> and <at>User</at> chat")).toBe("and  chat")
  })

  it("handles extra whitespace after mention removal", () => {
    expect(stripMentions("  <at>Bot</at>  hello  ")).toBe("hello")
  })

  it("returns empty string for empty input", () => {
    expect(stripMentions("")).toBe("")
  })

  it("returns empty string for undefined/null input", () => {
    expect(stripMentions(undefined as any)).toBe("")
    expect(stripMentions(null as any)).toBe("")
  })
})

describe("Teams adapter - startTeamsApp (DevtoolsPlugin mode)", () => {
  afterEach(() => {
    delete process.env.CLIENT_ID
    delete process.env.CLIENT_SECRET
    delete process.env.TENANT_ID
    delete process.env.PORT
  })

  it("creates App with DevtoolsPlugin when CLIENT_ID is not set", async () => {
    vi.resetModules()
    delete process.env.CLIENT_ID

    let capturedOpts: any = null
    const mockOn = vi.fn()
    const mockStart = vi.fn()
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(opts: any) { capturedOpts = opts }
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

    expect(capturedOpts.plugins).toHaveLength(1)
    expect(mockOn).toHaveBeenCalledWith("message", expect.any(Function))
    expect(mockStart).toHaveBeenCalledWith(3978)

    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("logs 'with DevtoolsPlugin' in DevtoolsPlugin mode", async () => {
    vi.resetModules()
    delete process.env.CLIENT_ID

    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn()
        start = vi.fn()
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

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("DevtoolsPlugin"))

    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("passes activity.mentions.stripText in DevtoolsPlugin mode", async () => {
    vi.resetModules()
    delete process.env.CLIENT_ID

    let capturedOpts: any = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(opts: any) { capturedOpts = opts }
        on = vi.fn()
        start = vi.fn()
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

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(capturedOpts.activity).toEqual({ mentions: { stripText: true } })

    vi.restoreAllMocks()
  })

  it("uses PORT env var when set", async () => {
    vi.resetModules()
    delete process.env.CLIENT_ID

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

    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("message handler calls handleTeamsMessage with text and stream", async () => {
    vi.resetModules()
    delete process.env.CLIENT_ID

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
    delete process.env.CLIENT_ID

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

describe("Teams adapter - startTeamsApp (Bot mode)", () => {
  afterEach(() => {
    delete process.env.CLIENT_ID
    delete process.env.CLIENT_SECRET
    delete process.env.TENANT_ID
    delete process.env.PORT
  })

  it("creates App WITHOUT DevtoolsPlugin when CLIENT_ID is set", async () => {
    vi.resetModules()
    process.env.CLIENT_ID = "test-client-id"
    process.env.CLIENT_SECRET = "test-secret"
    process.env.TENANT_ID = "test-tenant-id"

    let capturedOpts: any = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(opts: any) { capturedOpts = opts }
        on = vi.fn()
        start = vi.fn()
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

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    // Bot mode should NOT have plugins (no DevtoolsPlugin)
    expect(capturedOpts.plugins).toBeUndefined()

    vi.restoreAllMocks()
  })

  it("passes clientId, clientSecret, tenantId to App constructor", async () => {
    vi.resetModules()
    process.env.CLIENT_ID = "my-app-id"
    process.env.CLIENT_SECRET = "my-secret"
    process.env.TENANT_ID = "my-tenant"

    let capturedOpts: any = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(opts: any) { capturedOpts = opts }
        on = vi.fn()
        start = vi.fn()
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

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(capturedOpts.clientId).toBe("my-app-id")
    expect(capturedOpts.clientSecret).toBe("my-secret")
    expect(capturedOpts.tenantId).toBe("my-tenant")

    vi.restoreAllMocks()
  })

  it("passes activity.mentions.stripText in bot mode", async () => {
    vi.resetModules()
    process.env.CLIENT_ID = "test-id"
    process.env.CLIENT_SECRET = "test-secret"
    process.env.TENANT_ID = "test-tenant"

    let capturedOpts: any = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(opts: any) { capturedOpts = opts }
        on = vi.fn()
        start = vi.fn()
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

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(capturedOpts.activity).toEqual({ mentions: { stripText: true } })

    vi.restoreAllMocks()
  })

  it("logs 'with Bot Service' in bot mode", async () => {
    vi.resetModules()
    process.env.CLIENT_ID = "test-id"
    process.env.CLIENT_SECRET = "test-secret"
    process.env.TENANT_ID = "test-tenant"

    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn()
        start = vi.fn()
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

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Bot Service"))

    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("registers message handler in bot mode", async () => {
    vi.resetModules()
    process.env.CLIENT_ID = "test-id"
    process.env.CLIENT_SECRET = "test-secret"
    process.env.TENANT_ID = "test-tenant"

    const mockOn = vi.fn()
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = mockOn
        start = vi.fn()
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

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(mockOn).toHaveBeenCalledWith("message", expect.any(Function))

    vi.restoreAllMocks()
  })
})
