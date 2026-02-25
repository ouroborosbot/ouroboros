import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChannelCallbacks } from "../core"
import { THINKING_PHRASES, FOLLOWUP_PHRASES } from "../phrases"

// Tests for src/teams.ts Teams channel adapter.

// AzureOpenAI requires endpoint env var when AZURE_OPENAI_API_KEY is set.
// Ensure Azure path isn't triggered during tests that only need MiniMax.
const _savedAzureKey = process.env.AZURE_OPENAI_API_KEY
beforeEach(() => { delete process.env.AZURE_OPENAI_API_KEY })
afterEach(() => { if (_savedAzureKey) process.env.AZURE_OPENAI_API_KEY = _savedAzureKey })

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

})

describe("Teams adapter - createTeamsCallbacks (SDK-delegated streaming)", () => {
  let mockStream: { emit: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
  let controller: AbortController

  beforeEach(() => {
    mockStream = {
      emit: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
    }
    controller = new AbortController()
  })

  it("onModelStart sends a phrase from THINKING_PHRASES with trailing ...", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onModelStart()
    const calledWith = mockStream.update.mock.calls[0][0] as string
    expect(calledWith).toMatch(/\.\.\.$/)
    const phrase = calledWith.replace(/\.\.\.$/, "")
    expect(THINKING_PHRASES).toContain(phrase)
    // Clean up timer
    callbacks.onModelStreamStart()
  })

  it("onModelStreamStart stops phrase rotation (does not throw)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    expect(() => callbacks.onModelStreamStart()).not.toThrow()
  })

  // --- Delta emit tests (SDK handles accumulation) ---

  it("emits text delta directly to stream", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onTextChunk("Hello")
    expect(mockStream.emit).toHaveBeenCalledWith("Hello")
  })

  it("emits each chunk as a delta (not cumulative)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("Hello")
    callbacks.onTextChunk(" world")

    expect(mockStream.emit).toHaveBeenCalledTimes(2)
    expect(mockStream.emit).toHaveBeenNthCalledWith(1, "Hello")
    expect(mockStream.emit).toHaveBeenNthCalledWith(2, " world")
  })

  // --- Stop-streaming tests ---

  it("when emit throws (403), controller is aborted", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.emit.mockImplementation(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("data")
    expect(controller.signal.aborted).toBe(true)
  })

  it("after abort, subsequent onTextChunk calls do not emit", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.emit.mockImplementationOnce(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("first") // this throws and aborts
    mockStream.emit.mockClear()
    callbacks.onTextChunk("second")
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("onError after abort does not emit (graceful stop)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.emit.mockImplementationOnce(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("data") // triggers abort
    mockStream.emit.mockClear()
    callbacks.onError(new Error("connection lost"))
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  // --- update() error handling ---

  it("when update throws (403), controller is aborted", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.update.mockImplementation(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onToolStart("read_file", { path: "test.txt" })
    expect(controller.signal.aborted).toBe(true)
  })

  it("after abort via update, subsequent updates are skipped", async () => {
    vi.useFakeTimers()
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.update.mockImplementationOnce(() => { throw new Error("403") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart() // this throws and aborts
    mockStream.update.mockClear()
    callbacks.onToolStart("shell", { command: "ls" }) // should be skipped
    expect(mockStream.update).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  // --- onReasoningChunk tests ---

  it("onReasoningChunk calls stream.update() with accumulated text", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("analyzing code")
    expect(mockStream.update).toHaveBeenCalledWith("analyzing code")
  })

  it("multiple reasoning chunks accumulate into growing update()", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("step 1")
    callbacks.onReasoningChunk(" step 2")
    expect(mockStream.update).toHaveBeenCalledTimes(2)
    expect(mockStream.update).toHaveBeenNthCalledWith(1, "step 1")
    expect(mockStream.update).toHaveBeenNthCalledWith(2, "step 1 step 2")
  })

  it("onReasoningChunk after stop (403) does not call update()", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.emit.mockImplementation(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("data") // triggers 403, sets stopped
    mockStream.update.mockClear()
    callbacks.onReasoningChunk("should not appear")
    expect(mockStream.update).not.toHaveBeenCalled()
  })

  it("onReasoningChunk when update() throws (403) aborts controller", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.update.mockImplementation(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("reasoning")
    expect(controller.signal.aborted).toBe(true)
  })

  it("onTextChunk calls stream.emit() directly (no think-tag processing)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("hello")
    expect(mockStream.emit).toHaveBeenCalledWith("hello")
  })

  it("first text chunk after reasoning emits formatted reasoning + separator + text", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("step 1")
    callbacks.onReasoningChunk(" step 2")
    callbacks.onTextChunk("answer")
    // Should emit reasoning as italic, then separator, then text
    expect(mockStream.emit).toHaveBeenCalledTimes(2)
    expect(mockStream.emit).toHaveBeenNthCalledWith(1, "*step 1 step 2*\n\n")
    expect(mockStream.emit).toHaveBeenNthCalledWith(2, "answer")
  })

  it("text without prior reasoning emits directly", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("just text")
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("just text")
  })

  it("onModelStart resets reasoning buffer for new turn", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("old reasoning")
    callbacks.onModelStart() // reset
    callbacks.onModelStreamStart() // stop rotation timer
    callbacks.onTextChunk("answer")
    // Should not emit old reasoning
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("answer")
  })

  // --- Tool/status callbacks ---

  it("onToolStart sends informative status", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolStart("read_file", { path: "package.json" })
    expect(mockStream.update).toHaveBeenCalledWith("running read_file (package.json)...")
  })

  it("onToolEnd updates status with result summary", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolEnd("read_file", "package.json", true)
    expect(mockStream.update).toHaveBeenCalledWith("package.json")
  })

  it("onToolEnd handles empty summary", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolEnd("get_current_time", "", true)
    expect(mockStream.update).toHaveBeenCalledWith("get_current_time done")
  })

  it("onToolEnd handles failure", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolEnd("read_file", "missing.txt", false)
    expect(mockStream.update).toHaveBeenCalledWith("read_file failed: missing.txt")
  })

  it("onError sends error text to stream via emit", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onError(new Error("something broke"))
    expect(mockStream.emit).toHaveBeenCalledWith("Error: something broke")
  })
})

describe("Teams adapter - message handling", () => {
  function mockHandlingDeps(mockRunAgent: any) {
    vi.doMock("../core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/teams-test-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
      getTeamsConfig: vi.fn().mockReturnValue({ clientId: "", clientSecret: "", tenantId: "" }),
    }))
    vi.doMock("../context", () => ({
      loadSession: vi.fn().mockReturnValue(null),
      saveSession: vi.fn(),
      deleteSession: vi.fn(),
      trimMessages: vi.fn().mockImplementation((msgs: any) => [...msgs]),
      cachedBuildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../commands", () => ({
      createCommandRegistry: vi.fn().mockReturnValue({
        register: vi.fn(),
        get: vi.fn(),
        list: vi.fn().mockReturnValue([]),
        dispatch: vi.fn().mockReturnValue({ handled: false }),
      }),
      registerDefaultCommands: vi.fn(),
      parseSlashCommand: vi.fn().mockReturnValue(null),
    }))
  }

  it("on incoming message, pushes system and user message and calls runAgent", async () => {
    vi.resetModules()

    const mockRunAgent = vi.fn()
    mockHandlingDeps(mockRunAgent)

    const teams = await import("../teams")

    const mockStream = {
      emit: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
    }

    await teams.handleTeamsMessage("hello from Teams", mockStream as any, "conv-test")

    expect(mockRunAgent).toHaveBeenCalled()
    const messages = mockRunAgent.mock.calls[0][0]
    expect(messages.some((m: any) => m.role === "system")).toBe(true)
    expect(messages.some((m: any) => m.role === "user" && m.content === "hello from Teams")).toBe(true)
  })

  it("passes AbortSignal to runAgent", async () => {
    vi.resetModules()

    const mockRunAgent = vi.fn()
    mockHandlingDeps(mockRunAgent)

    const teams = await import("../teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("test", mockStream as any, "conv-test")

    // Third argument to runAgent should be an AbortSignal
    expect(mockRunAgent).toHaveBeenCalled()
    const signal = mockRunAgent.mock.calls[0][2]
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it("does not explicitly close stream (framework auto-closes)", async () => {
    vi.resetModules()

    mockHandlingDeps(vi.fn())

    const teams = await import("../teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hi", mockStream as any, "conv-test")

    expect(mockStream.close).not.toHaveBeenCalled()
  })

  it("per-conversation sessions: each call loads/saves independently", async () => {
    vi.resetModules()

    const capturedMessages: any[][] = []
    const mockRunAgent = vi.fn().mockImplementation((msgs: any[]) => {
      capturedMessages.push([...msgs])
    })
    mockHandlingDeps(mockRunAgent)

    const teams = await import("../teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }

    await teams.handleTeamsMessage("first", mockStream as any, "conv-1")
    await teams.handleTeamsMessage("second", mockStream as any, "conv-2")

    // Both calls get fresh sessions (loadSession returns null), so each has system + user = 2 msgs
    expect(capturedMessages[0].length).toBe(2)
    expect(capturedMessages[1].length).toBe(2)
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

  it("message handler catches errors without crashing", async () => {
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

    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockRejectedValue(new Error("agent crashed")),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await expect(capturedHandler!({
      stream: mockStream,
      activity: { text: "test" },
    })).resolves.not.toThrow()

    expect(errorSpy).toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})

describe("Teams adapter - unhandledRejection guard", () => {
  afterEach(() => {
    // Clean up any __ouroboros listeners we registered
    const listeners = process.listeners("unhandledRejection")
    for (const l of listeners) {
      if ((l as any).__ouroboros) process.removeListener("unhandledRejection", l)
    }
  })

  it("registers unhandledRejection handler with __ouroboros marker", async () => {
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

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    const listeners = process.listeners("unhandledRejection")
    const ouroboros = listeners.find((l) => (l as any).__ouroboros)
    expect(ouroboros).toBeDefined()

    // Invoke the handler to cover the console.error line
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    ;(ouroboros as Function)(new Error("test rejection"))
    expect(errorSpy).toHaveBeenCalledWith("Unhandled rejection (non-fatal):", expect.any(Error))

    vi.restoreAllMocks()
  })

  it("does not register duplicate handler on second call", async () => {
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

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()
    teams.startTeamsApp()

    const listeners = process.listeners("unhandledRejection")
    const ouroborosCount = listeners.filter((l) => (l as any).__ouroboros).length
    expect(ouroborosCount).toBe(1)

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

  function mockBotConfig(clientId: string, clientSecret: string, tenantId: string) {
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/bot-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
      getTeamsConfig: vi.fn().mockReturnValue({ clientId, clientSecret, tenantId }),
    }))
  }

  it("creates App WITHOUT DevtoolsPlugin when CLIENT_ID is set", async () => {
    vi.resetModules()

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
    }))
    mockBotConfig("test-client-id", "test-secret", "test-tenant-id")

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    // Bot mode should NOT have plugins (no DevtoolsPlugin)
    expect(capturedOpts.plugins).toBeUndefined()

    vi.restoreAllMocks()
  })

  it("passes clientId, clientSecret, tenantId to App constructor", async () => {
    vi.resetModules()

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
    }))
    mockBotConfig("my-app-id", "my-secret", "my-tenant")

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
    }))
    mockBotConfig("test-id", "test-secret", "test-tenant")

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(capturedOpts.activity).toEqual({ mentions: { stripText: true } })

    vi.restoreAllMocks()
  })

  it("logs 'with Bot Service' in bot mode", async () => {
    vi.resetModules()

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
    }))
    mockBotConfig("test-id", "test-secret", "test-tenant")

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Bot Service"))

    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it("registers message handler in bot mode", async () => {
    vi.resetModules()

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
    }))
    mockBotConfig("test-id", "test-secret", "test-tenant")

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../teams")
    teams.startTeamsApp()

    expect(mockOn).toHaveBeenCalledWith("message", expect.any(Function))

    vi.restoreAllMocks()
  })
})

describe("Teams adapter - phrase rotation", () => {
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

  it("rotates phrases every 1.5s during onModelStart", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    const firstCall = mockStream.update.mock.calls[0][0] as string
    expect(firstCall).toMatch(/\.\.\.$/)

    mockStream.update.mockClear()
    vi.advanceTimersByTime(1500)
    expect(mockStream.update).toHaveBeenCalledTimes(1)
    const rotatedCall = mockStream.update.mock.calls[0][0] as string
    expect(rotatedCall).toMatch(/\.\.\.$/)
    const phrase = rotatedCall.replace(/\.\.\.$/, "")
    expect(THINKING_PHRASES).toContain(phrase)

    callbacks.onModelStreamStart() // cleanup
  })

  it("stopPhraseRotation on onModelStreamStart stops timer", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    callbacks.onModelStreamStart()
    mockStream.update.mockClear()
    vi.advanceTimersByTime(3000)
    expect(mockStream.update).not.toHaveBeenCalled()
  })

  it("onReasoningChunk stops phrase rotation", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    callbacks.onReasoningChunk("thinking hard")
    mockStream.update.mockClear()
    vi.advanceTimersByTime(3000)
    // Only reasoning updates, no phrase rotation
    expect(mockStream.update).not.toHaveBeenCalled()
  })

  it("uses FOLLOWUP_PHRASES after tool run", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    // First model call
    callbacks.onModelStart()
    callbacks.onModelStreamStart()
    // Tool run
    callbacks.onToolStart("read_file", { path: "x" })
    callbacks.onToolEnd("read_file", "x", true)
    // Second model call
    mockStream.update.mockClear()
    callbacks.onModelStart()
    const calledWith = mockStream.update.mock.calls[0][0] as string
    const phrase = calledWith.replace(/\.\.\.$/, "")
    expect(FOLLOWUP_PHRASES).toContain(phrase)

    callbacks.onModelStreamStart() // cleanup
  })

  it("onError stops phrase rotation", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    callbacks.onError(new Error("boom"))
    mockStream.update.mockClear()
    vi.advanceTimersByTime(3000)
    expect(mockStream.update).not.toHaveBeenCalled()
  })

  it("onToolStart stops phrase rotation from onModelStart", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    callbacks.onModelStreamStart()
    callbacks.onToolStart("shell", { command: "ls" })
    mockStream.update.mockClear()
    vi.advanceTimersByTime(3000)
    // No rotation after tool start (it uses static tool name display)
    expect(mockStream.update).not.toHaveBeenCalled()
  })
})

describe("Teams adapter - session persistence", () => {
  beforeEach(() => {
    delete process.env.AZURE_OPENAI_API_KEY
  })

  function mockTeamsDeps(overrides: {
    runAgentFn?: any
    loadSessionReturn?: any
    saveSessionCalls?: any[][]
    deleteSessionCalls?: string[]
    trimMessagesFn?: any
    parseSlashCommandFn?: any
    dispatchFn?: any
  } = {}) {
    const {
      runAgentFn = vi.fn(),
      loadSessionReturn = null,
      saveSessionCalls = [],
      deleteSessionCalls = [],
      trimMessagesFn = ((msgs: any) => [...msgs]),
      parseSlashCommandFn = (() => null),
      dispatchFn = (() => ({ handled: false })),
    } = overrides

    vi.doMock("../core", () => ({
      runAgent: runAgentFn,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/teams-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
      getTeamsConfig: vi.fn().mockReturnValue({ clientId: "", clientSecret: "", tenantId: "" }),
    }))
    vi.doMock("../context", () => ({
      loadSession: vi.fn().mockReturnValue(loadSessionReturn),
      saveSession: vi.fn().mockImplementation((...args: any[]) => { saveSessionCalls.push(args) }),
      deleteSession: vi.fn().mockImplementation((...args: any[]) => { deleteSessionCalls.push(args[0]) }),
      trimMessages: vi.fn().mockImplementation(trimMessagesFn),
      cachedBuildSystem: vi.fn().mockReturnValue("cached teams prompt"),
    }))
    vi.doMock("../commands", () => ({
      createCommandRegistry: vi.fn().mockReturnValue({
        register: vi.fn(),
        get: vi.fn(),
        list: vi.fn().mockReturnValue([]),
        dispatch: vi.fn().mockImplementation(dispatchFn),
      }),
      registerDefaultCommands: vi.fn(),
      parseSlashCommand: vi.fn().mockImplementation(parseSlashCommandFn),
    }))
  }

  it("handleTeamsMessage accepts conversationId parameter", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn()
    mockTeamsDeps({ runAgentFn })
    const teams = await import("../teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")
    expect(runAgentFn).toHaveBeenCalled()
  })

  it("loads session for conversation on each message", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn()
    const savedSession = [
      { role: "system", content: "old prompt" },
      { role: "user", content: "previous msg" },
    ]
    mockTeamsDeps({ runAgentFn, loadSessionReturn: savedSession })
    const teams = await import("../teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("new msg", mockStream as any, "conv-123")

    const msgs = runAgentFn.mock.calls[0][0]
    // Should have system prompt (refreshed), previous msg, and new msg
    expect(msgs[0].content).toBe("cached teams prompt")
    expect(msgs.some((m: any) => m.content === "new msg")).toBe(true)
  })

  it("saves session after runAgent", async () => {
    vi.resetModules()
    const saveSessionCalls: any[][] = []
    mockTeamsDeps({ saveSessionCalls })
    const teams = await import("../teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")

    expect(saveSessionCalls.length).toBe(1)
    expect(saveSessionCalls[0][0]).toBe("/tmp/teams-session.json")
  })

  it("trims messages before runAgent", async () => {
    vi.resetModules()
    const trimCalls: any[][] = []
    mockTeamsDeps({
      trimMessagesFn: (...args: any[]) => { trimCalls.push(args); return [...args[0]] },
    })
    const teams = await import("../teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")

    expect(trimCalls.length).toBe(1)
    expect(trimCalls[0][1]).toBe(80000) // maxTokens
  })

  it("creates fresh session when no session exists", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn()
    mockTeamsDeps({ runAgentFn, loadSessionReturn: null })
    const teams = await import("../teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")

    const msgs = runAgentFn.mock.calls[0][0]
    expect(msgs[0].role).toBe("system")
    expect(msgs[0].content).toBe("cached teams prompt")
    expect(msgs.length).toBe(2) // system + user
  })

  it("/new clears session and sends confirmation via stream", async () => {
    vi.resetModules()
    const deleteSessionCalls: string[] = []
    const runAgentFn = vi.fn()
    mockTeamsDeps({
      runAgentFn,
      deleteSessionCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => {
        if (name === "new") return { handled: true, result: { action: "new" } }
        return { handled: false }
      },
    })
    const teams = await import("../teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("/new", mockStream as any, "conv-123")

    expect(deleteSessionCalls.length).toBe(1)
    expect(mockStream.emit).toHaveBeenCalledWith(expect.stringContaining("session cleared"))
    expect(runAgentFn).not.toHaveBeenCalled()
  })

  it("/commands sends command list via stream without calling runAgent", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn()
    mockTeamsDeps({
      runAgentFn,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => {
        if (name === "commands") return { handled: true, result: { action: "response", message: "/new - start new" } }
        return { handled: false }
      },
    })
    const teams = await import("../teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("/commands", mockStream as any, "conv-123")

    expect(mockStream.emit).toHaveBeenCalledWith(expect.stringContaining("/new"))
    expect(runAgentFn).not.toHaveBeenCalled()
  })

  it("multiple conversations maintain separate sessions", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn()
    mockTeamsDeps({ runAgentFn })
    const teams = await import("../teams")
    const mockStream1 = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    const mockStream2 = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }

    await teams.handleTeamsMessage("msg for conv1", mockStream1 as any, "conv-1")
    await teams.handleTeamsMessage("msg for conv2", mockStream2 as any, "conv-2")

    // Each call gets its own session (both load null, get fresh messages)
    expect(runAgentFn).toHaveBeenCalledTimes(2)
    const msgs1 = runAgentFn.mock.calls[0][0]
    const msgs2 = runAgentFn.mock.calls[1][0]
    expect(msgs1.find((m: any) => m.content === "msg for conv1")).toBeDefined()
    expect(msgs2.find((m: any) => m.content === "msg for conv2")).toBeDefined()
  })

  it("graceful fallback on corrupt session file", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn()
    mockTeamsDeps({ runAgentFn, loadSessionReturn: null }) // null = corrupt
    const teams = await import("../teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")

    expect(runAgentFn).toHaveBeenCalled()
    const msgs = runAgentFn.mock.calls[0][0]
    expect(msgs[0].role).toBe("system")
  })

  it("withConversationLock serializes messages for same conversation", async () => {
    vi.resetModules()
    const order: string[] = []
    mockTeamsDeps({})
    const teams = await import("../teams")

    const { withConversationLock } = teams
    let callCount = 0
    await Promise.all([
      withConversationLock("conv-1", async () => {
        const id = callCount++
        order.push(`start-${id}`)
        await new Promise((r) => setTimeout(r, 10))
        order.push(`end-${id}`)
      }),
      withConversationLock("conv-1", async () => {
        const id = callCount++
        order.push(`start-${id}`)
        await new Promise((r) => setTimeout(r, 10))
        order.push(`end-${id}`)
      }),
    ])

    // Should be sequential: start-0, end-0, start-1, end-1
    expect(order).toEqual(["start-0", "end-0", "start-1", "end-1"])
  })

  it("withConversationLock allows parallel for different conversations", async () => {
    vi.resetModules()
    const order: string[] = []
    const runAgentFn = vi.fn().mockImplementation(async (id: string) => {
      order.push(`start-${id}`)
      await new Promise((r) => setTimeout(r, 10))
      order.push(`end-${id}`)
    })
    mockTeamsDeps({ runAgentFn })
    const teams = await import("../teams")

    const { withConversationLock } = teams
    await Promise.all([
      withConversationLock("conv-1", async () => { await runAgentFn("1") }),
      withConversationLock("conv-2", async () => { await runAgentFn("2") }),
    ])

    // Both start before either ends (parallel)
    expect(order[0]).toBe("start-1")
    expect(order[1]).toBe("start-2")
  })
})
