import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChannelCallbacks } from "../../engine/core"
import { THINKING_PHRASES, FOLLOWUP_PHRASES } from "../../repertoire/phrases"

// Tests for src/teams.ts Teams channel adapter.

// AzureOpenAI requires endpoint env var when AZURE_OPENAI_API_KEY is set.
// Ensure Azure path isn't triggered during tests that only need MiniMax.
const _savedAzureKey = process.env.AZURE_OPENAI_API_KEY
beforeEach(() => { delete process.env.AZURE_OPENAI_API_KEY })
afterEach(() => { if (_savedAzureKey) process.env.AZURE_OPENAI_API_KEY = _savedAzureKey })

describe("Teams adapter - exports", () => {
  it("exports createTeamsCallbacks", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    expect(typeof teams.createTeamsCallbacks).toBe("function")
  })

  it("exports startTeamsApp", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
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
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onModelStart()
    const calledWith = mockStream.update.mock.calls[0][0] as string
    expect(calledWith).toMatch(/\.\.\.$/)
    const phrase = calledWith.replace(/\.\.\.$/, "")
    expect(THINKING_PHRASES).toContain(phrase)
    // Clean up timer
    callbacks.onTextChunk("done")
  })

  it("onModelStreamStart stops phrase rotation (does not throw)", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    expect(() => callbacks.onModelStreamStart()).not.toThrow()
  })

  // --- Delta emit tests (SDK handles accumulation) ---

  it("emits text delta directly to stream", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onTextChunk("Hello")
    expect(mockStream.emit).toHaveBeenCalledWith("Hello")
  })

  it("emits each chunk as a delta (not cumulative)", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
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
    const teams = await import("../../channels/teams")
    mockStream.emit.mockImplementation(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("data")
    expect(controller.signal.aborted).toBe(true)
  })

  it("after abort, subsequent onTextChunk calls do not emit", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    mockStream.emit.mockImplementationOnce(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("first") // this throws and aborts
    mockStream.emit.mockClear()
    callbacks.onTextChunk("second")
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("onError after abort does not emit (graceful stop)", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
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
    const teams = await import("../../channels/teams")
    mockStream.update.mockImplementation(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onToolStart("read_file", { path: "test.txt" })
    expect(controller.signal.aborted).toBe(true)
  })

  it("after abort via update, subsequent updates are skipped", async () => {
    vi.useFakeTimers()
    vi.resetModules()
    const teams = await import("../../channels/teams")
    mockStream.update.mockImplementationOnce(() => { throw new Error("403") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart() // this throws and aborts
    mockStream.update.mockClear()
    callbacks.onToolStart("shell", { command: "ls" }) // should be skipped
    expect(mockStream.update).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  // --- onReasoningChunk tests ---

  it("onReasoningChunk sends reasoning text via update()", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("analyzing code")
    expect(mockStream.update).toHaveBeenCalledWith("analyzing code")
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("onReasoningChunk after stop (403) is still a no-op", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    mockStream.emit.mockImplementation(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("data") // triggers 403, sets stopped
    mockStream.update.mockClear()
    callbacks.onReasoningChunk("should not appear")
    expect(mockStream.update).not.toHaveBeenCalled()
  })

  it("onTextChunk calls stream.emit() directly (no think-tag processing)", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("hello")
    expect(mockStream.emit).toHaveBeenCalledWith("hello")
  })

  it("onReasoningChunk accumulates chunks into a single update()", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("step 1")
    callbacks.onReasoningChunk(" step 2")
    // Each chunk updates with the accumulated buffer
    expect(mockStream.update).toHaveBeenCalledWith("step 1")
    expect(mockStream.update).toHaveBeenCalledWith("step 1 step 2")
    // Text emits only final answer, not reasoning
    callbacks.onTextChunk("answer")
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("answer")
  })

  it("text without prior reasoning emits directly", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onTextChunk("just text")
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("just text")
  })

  it("reasoning never leaks into emitted text across turns", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("old reasoning")
    callbacks.onModelStart()
    callbacks.onTextChunk("answer")
    // Reasoning was shown via update(), never emitted
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("answer")
  })

  // --- Tool/status callbacks ---

  it("onToolStart sends informative status", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolStart("read_file", { path: "package.json" })
    expect(mockStream.update).toHaveBeenCalledWith("running read_file (package.json)...")
  })

  it("onToolEnd updates status with result summary", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolEnd("read_file", "package.json", true)
    expect(mockStream.update).toHaveBeenCalledWith("package.json")
  })

  it("onToolEnd handles empty summary", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolEnd("get_current_time", "", true)
    expect(mockStream.update).toHaveBeenCalledWith("get_current_time done")
  })

  it("onToolEnd handles failure", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onToolEnd("read_file", "missing.txt", false)
    expect(mockStream.update).toHaveBeenCalledWith("read_file failed: missing.txt")
  })

  it("onError sends error text to stream via emit", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onError(new Error("something broke"))
    expect(mockStream.emit).toHaveBeenCalledWith("Error: something broke")
  })
})

describe("Teams adapter - message handling", () => {
  function mockHandlingDeps(mockRunAgent: any) {
    vi.doMock("../../engine/core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/teams-test-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
      getTeamsConfig: vi.fn().mockReturnValue({ clientId: "", clientSecret: "", tenantId: "" }),
      getOAuthConfig: vi.fn().mockReturnValue({ graphConnectionName: "graph", adoConnectionName: "ado" }),
      getAdoConfig: vi.fn().mockReturnValue({ organizations: [] }),
    }))
    vi.doMock("../../mind/context", () => ({
      loadSession: vi.fn().mockReturnValue(null),
      saveSession: vi.fn(),
      deleteSession: vi.fn(),
      trimMessages: vi.fn().mockImplementation((msgs: any) => [...msgs]),
      cachedBuildSystem: vi.fn().mockReturnValue("system prompt"),
      postTurn: vi.fn(),
    }))
    vi.doMock("../../repertoire/commands", () => ({
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

    const mockRunAgent = vi.fn().mockResolvedValue({ usage: undefined })
    mockHandlingDeps(mockRunAgent)

    const teams = await import("../../channels/teams")

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

    const mockRunAgent = vi.fn().mockResolvedValue({ usage: undefined })
    mockHandlingDeps(mockRunAgent)

    const teams = await import("../../channels/teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("test", mockStream as any, "conv-test")

    // Fourth argument to runAgent should be an AbortSignal (channel is third)
    expect(mockRunAgent).toHaveBeenCalled()
    expect(mockRunAgent.mock.calls[0][2]).toBe("teams")
    const signal = mockRunAgent.mock.calls[0][3]
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it("does not explicitly close stream (framework auto-closes)", async () => {
    vi.resetModules()

    mockHandlingDeps(vi.fn().mockResolvedValue({ usage: undefined }))

    const teams = await import("../../channels/teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hi", mockStream as any, "conv-test")

    expect(mockStream.close).not.toHaveBeenCalled()
  })

  it("per-conversation sessions: each call loads/saves independently", async () => {
    vi.resetModules()

    const capturedMessages: any[][] = []
    const mockRunAgent = vi.fn().mockImplementation((msgs: any[]) => {
      capturedMessages.push([...msgs])
      return { usage: undefined }
    })
    mockHandlingDeps(mockRunAgent)

    const teams = await import("../../channels/teams")

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
    const teams = await import("../../channels/teams")
    stripMentions = teams.stripMentions
  })

  it("is exported from teams.ts", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = mockStart
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = mockStart
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    process.env.PORT = "4000"
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))

    const mockRunAgent = vi.fn().mockResolvedValue({ usage: undefined })
    vi.doMock("../../engine/core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))
    vi.doMock("../../mind/context", () => ({
      loadSession: vi.fn().mockReturnValue(null),
      saveSession: vi.fn(),
      deleteSession: vi.fn(),
      trimMessages: vi.fn().mockImplementation((msgs: any) => [...msgs]),
      cachedBuildSystem: vi.fn().mockReturnValue("system prompt"),
      postTurn: vi.fn(),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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

  it("message handler fetches tokens and passes teamsContext to handleTeamsMessage", async () => {
    vi.resetModules()
    delete process.env.CLIENT_ID

    let capturedHandler: ((args: any) => Promise<void>) | null = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn().mockImplementation((_event: string, handler: any) => {
          capturedHandler = handler
        })
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))

    const mockRunAgent = vi.fn().mockResolvedValue({ usage: undefined })
    vi.doMock("../../engine/core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))
    vi.doMock("../../mind/context", () => ({
      loadSession: vi.fn().mockReturnValue(null),
      saveSession: vi.fn(),
      deleteSession: vi.fn(),
      trimMessages: vi.fn().mockImplementation((msgs: any) => [...msgs]),
      cachedBuildSystem: vi.fn().mockReturnValue("system prompt"),
      postTurn: vi.fn(),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
    teams.startTeamsApp()

    // Simulate a full activity context with api.users.token.get and signin
    const mockSignin = vi.fn().mockResolvedValue("token-from-signin")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await capturedHandler!({
      stream: mockStream,
      activity: {
        text: "test",
        conversation: { id: "conv-test" },
        from: { id: "user-123" },
        channelId: "msteams",
      },
      api: {
        users: {
          token: {
            get: vi.fn()
              .mockResolvedValueOnce({ token: "graph-token-123" })
              .mockResolvedValueOnce({ token: "ado-token-456" }),
          },
        },
      },
      signin: mockSignin,
    })

    // runAgent should have been called with toolContext containing both tokens
    expect(mockRunAgent).toHaveBeenCalled()
    const callArgs = mockRunAgent.mock.calls[0]
    const options = callArgs[4]
    expect(options).toBeDefined()
    expect(options.toolContext).toBeDefined()
    expect(options.toolContext.graphToken).toBe("graph-token-123")
    expect(options.toolContext.adoToken).toBe("ado-token-456")
    expect(typeof options.toolContext.signin).toBe("function")

    // Test that the signin function proxies to ctx.signin with connectionName
    await options.toolContext.signin("ado")
    expect(mockSignin).toHaveBeenCalledWith({ connectionName: "ado" })

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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))

    const mockRunAgent = vi.fn().mockResolvedValue({ usage: undefined })
    vi.doMock("../../engine/core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))
    vi.doMock("../../mind/context", () => ({
      loadSession: vi.fn().mockReturnValue(null),
      saveSession: vi.fn(),
      deleteSession: vi.fn(),
      trimMessages: vi.fn().mockImplementation((msgs: any) => [...msgs]),
      cachedBuildSystem: vi.fn().mockReturnValue("system prompt"),
      postTurn: vi.fn(),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))

    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn().mockRejectedValue(new Error("agent crashed")),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
    teams.startTeamsApp()

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await expect(capturedHandler!({
      stream: mockStream,
      activity: { text: "test" },
    })).resolves.not.toThrow()

    expect(errorSpy).toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it("signin wrapper catches errors and returns undefined", async () => {
    vi.resetModules()
    delete process.env.CLIENT_ID

    let capturedHandler: ((args: any) => Promise<void>) | null = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn().mockImplementation((_event: string, handler: any) => {
          capturedHandler = handler
        })
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))

    // runAgent calls graph_profile which returns AUTH_REQUIRED, triggering signin
    const mockRunAgent = vi.fn().mockResolvedValue({ usage: undefined })
    vi.doMock("../../engine/core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))
    vi.doMock("../../mind/context", () => ({
      loadSession: vi.fn().mockReturnValue(null),
      saveSession: vi.fn(),
      deleteSession: vi.fn(),
      trimMessages: vi.fn().mockImplementation((msgs: any) => [...msgs]),
      cachedBuildSystem: vi.fn().mockReturnValue("system prompt"),
      postTurn: vi.fn(),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
    teams.startTeamsApp()

    const failingSignin = vi.fn().mockRejectedValue(new Error("signin failed"))
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await capturedHandler!({
      stream: mockStream,
      activity: {
        text: "test",
        conversation: { id: "conv-test" },
        from: { id: "user-123" },
        channelId: "msteams",
      },
      api: {
        users: { token: { get: vi.fn().mockRejectedValue(new Error("no token")) } },
      },
      signin: failingSignin,
    })

    // Grab the teamsContext.signin that was constructed and call it
    const handleCall = mockRunAgent.mock.calls[0]
    const opts = handleCall[4]
    const result = await opts.toolContext.signin("graph")
    expect(result).toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("signin(graph) failed"))

    vi.restoreAllMocks()
  })

  it("app.event error handler logs error message", async () => {
    vi.resetModules()
    delete process.env.CLIENT_ID

    let capturedEventHandler: ((args: any) => void) | null = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn()
        event = vi.fn().mockImplementation((_name: string, handler: any) => {
          capturedEventHandler = handler
        })
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
    teams.startTeamsApp()

    expect(capturedEventHandler).toBeDefined()
    capturedEventHandler!({ error: new Error("SDK blew up") })
    expect(errorSpy).toHaveBeenCalledWith("[teams] app error: SDK blew up")

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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
    teams.startTeamsApp()

    const listeners = process.listeners("unhandledRejection")
    const ouroboros = listeners.find((l) => (l as any).__ouroboros)
    expect(ouroboros).toBeDefined()

    // Invoke the handler to cover the console.error line
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    ;(ouroboros as Function)(new Error("test rejection"))
    expect(errorSpy).toHaveBeenCalledWith("[teams] unhandled rejection: test rejection")

    vi.restoreAllMocks()
  })

  it("does not register duplicate handler on second call", async () => {
    vi.resetModules()
    delete process.env.CLIENT_ID

    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn()
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
    vi.doMock("../../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/bot-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
      getTeamsConfig: vi.fn().mockReturnValue({ clientId, clientSecret, tenantId }),
      getOAuthConfig: vi.fn().mockReturnValue({ graphConnectionName: "graph", adoConnectionName: "ado" }),
      getAdoConfig: vi.fn().mockReturnValue({ organizations: [] }),
    }))
  }

  it("creates App WITHOUT DevtoolsPlugin when CLIENT_ID is set", async () => {
    vi.resetModules()

    let capturedOpts: any = null
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(opts: any) { capturedOpts = opts }
        on = vi.fn()
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    mockBotConfig("test-client-id", "test-secret", "test-tenant-id")

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    mockBotConfig("my-app-id", "my-secret", "my-tenant")

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    mockBotConfig("test-id", "test-secret", "test-tenant")

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    mockBotConfig("test-id", "test-secret", "test-tenant")

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
        event = vi.fn()
        start = vi.fn()
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../../engine/core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    mockBotConfig("test-id", "test-secret", "test-tenant")

    vi.spyOn(console, "log").mockImplementation(() => {})

    const teams = await import("../../channels/teams")
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
    const teams = await import("../../channels/teams")
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

    callbacks.onTextChunk("done") // cleanup
  })

  it("onModelStreamStart is a no-op (phrases keep cycling through reasoning)", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    callbacks.onModelStreamStart() // no-op — does NOT stop rotation
    mockStream.update.mockClear()
    vi.advanceTimersByTime(1500)
    // Phrases still cycling
    expect(mockStream.update).toHaveBeenCalled()
    // cleanup
    callbacks.onTextChunk("done")
  })

  it("onReasoningChunk stops phrase rotation and shows reasoning", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    callbacks.onReasoningChunk("thinking hard")
    mockStream.update.mockClear()
    vi.advanceTimersByTime(3000)
    // No more phrase rotation after reasoning arrives
    expect(mockStream.update).not.toHaveBeenCalled()
    // cleanup
    callbacks.onTextChunk("done")
  })

  it("onTextChunk stops phrase rotation", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    vi.advanceTimersByTime(1500) // rotation fires
    mockStream.update.mockClear()
    callbacks.onTextChunk("hello") // stops rotation
    vi.advanceTimersByTime(3000)
    // No more rotation after text arrives
    expect(mockStream.update).not.toHaveBeenCalled()
  })

  it("onModelStart is suppressed after real output (tool run)", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    // First model call
    callbacks.onModelStart()
    callbacks.onTextChunk("response") // stops rotation
    // Tool run — sets hadRealOutput
    callbacks.onToolStart("read_file", { path: "x" })
    callbacks.onToolEnd("read_file", "x", true)
    // Second model call — no phrases because real output was already shown
    mockStream.update.mockClear()
    callbacks.onModelStart()
    expect(mockStream.update).not.toHaveBeenCalled()

    callbacks.onTextChunk("done") // cleanup
  })

  it("onModelStart is suppressed after reasoning output", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    callbacks.onReasoningChunk("deep thought") // sets hadRealOutput
    callbacks.onTextChunk("answer")
    // Second model call — no phrases
    mockStream.update.mockClear()
    callbacks.onModelStart()
    expect(mockStream.update).not.toHaveBeenCalled()

    callbacks.onTextChunk("done") // cleanup
  })

  it("onError stops phrase rotation", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
    callbacks.onError(new Error("boom"))
    mockStream.update.mockClear()
    vi.advanceTimersByTime(3000)
    expect(mockStream.update).not.toHaveBeenCalled()
  })

  it("onToolStart stops phrase rotation from onModelStart", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart()
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
    postTurnCalls?: any[][]
    deleteSessionCalls?: string[]
    trimMessagesFn?: any
    parseSlashCommandFn?: any
    dispatchFn?: any
  } = {}) {
    const {
      runAgentFn = vi.fn().mockResolvedValue({ usage: undefined }),
      loadSessionReturn = null,
      saveSessionCalls = [],
      postTurnCalls = [],
      deleteSessionCalls = [],
      trimMessagesFn = ((msgs: any) => [...msgs]),
      parseSlashCommandFn = (() => null),
      dispatchFn = (() => ({ handled: false })),
    } = overrides

    vi.doMock("../../engine/core", () => ({
      runAgent: runAgentFn,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/teams-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
      getTeamsConfig: vi.fn().mockReturnValue({ clientId: "", clientSecret: "", tenantId: "" }),
      getOAuthConfig: vi.fn().mockReturnValue({ graphConnectionName: "graph", adoConnectionName: "ado" }),
      getAdoConfig: vi.fn().mockReturnValue({ organizations: [] }),
    }))
    vi.doMock("../../mind/context", () => ({
      loadSession: vi.fn().mockReturnValue(loadSessionReturn),
      saveSession: vi.fn().mockImplementation((...args: any[]) => { saveSessionCalls.push(args) }),
      deleteSession: vi.fn().mockImplementation((...args: any[]) => { deleteSessionCalls.push(args[0]) }),
      trimMessages: vi.fn().mockImplementation(trimMessagesFn),
      cachedBuildSystem: vi.fn().mockReturnValue("cached teams prompt"),
      postTurn: vi.fn().mockImplementation((...args: any[]) => { postTurnCalls.push(args) }),
    }))
    vi.doMock("../../repertoire/commands", () => ({
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
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({ runAgentFn })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")
    expect(runAgentFn).toHaveBeenCalled()
  })

  it("loads session for conversation on each message", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    const savedSession = [
      { role: "system", content: "old prompt" },
      { role: "user", content: "previous msg" },
    ]
    mockTeamsDeps({ runAgentFn, loadSessionReturn: { messages: savedSession, lastUsage: undefined } })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("new msg", mockStream as any, "conv-123")

    const msgs = runAgentFn.mock.calls[0][0]
    // System prompt comes from loaded session (refresh now happens inside runAgent)
    expect(msgs[0].role).toBe("system")
    expect(msgs.some((m: any) => m.content === "new msg")).toBe(true)
  })

  it("calls postTurn after runAgent with usage", async () => {
    vi.resetModules()
    const usageData = { input_tokens: 200, output_tokens: 100, reasoning_tokens: 20, total_tokens: 320 }
    const postTurnCalls: any[][] = []
    mockTeamsDeps({
      runAgentFn: vi.fn().mockResolvedValue({ usage: usageData }),
      postTurnCalls,
    })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")

    expect(postTurnCalls.length).toBe(1)
    expect(postTurnCalls[0][1]).toBe("/tmp/teams-session.json")
    expect(postTurnCalls[0][2]).toEqual(usageData)
  })

  it("does not call trimMessages directly (postTurn handles it)", async () => {
    vi.resetModules()
    const trimCalls: any[][] = []
    mockTeamsDeps({
      trimMessagesFn: (...args: any[]) => { trimCalls.push(args); return [...args[0]] },
    })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")

    expect(trimCalls.length).toBe(0) // trimming moved to postTurn
  })

  it("creates fresh session when no session exists", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({ runAgentFn, loadSessionReturn: null })
    const teams = await import("../../channels/teams")
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
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({
      runAgentFn,
      deleteSessionCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => {
        if (name === "new") return { handled: true, result: { action: "new" } }
        return { handled: false }
      },
    })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("/new", mockStream as any, "conv-123")

    expect(deleteSessionCalls.length).toBe(1)
    expect(mockStream.emit).toHaveBeenCalledWith(expect.stringContaining("session cleared"))
    expect(runAgentFn).not.toHaveBeenCalled()
  })

  it("/commands sends command list via stream without calling runAgent", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({
      runAgentFn,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => {
        if (name === "commands") return { handled: true, result: { action: "response", message: "/new - start new" } }
        return { handled: false }
      },
    })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("/commands", mockStream as any, "conv-123")

    expect(mockStream.emit).toHaveBeenCalledWith(expect.stringContaining("/new"))
    expect(runAgentFn).not.toHaveBeenCalled()
  })

  it("multiple conversations maintain separate sessions", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({ runAgentFn })
    const teams = await import("../../channels/teams")
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
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({ runAgentFn, loadSessionReturn: null }) // null = corrupt
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")

    expect(runAgentFn).toHaveBeenCalled()
    const msgs = runAgentFn.mock.calls[0][0]
    expect(msgs[0].role).toBe("system")
  })

  it("slash command handled but no result falls through to normal message handling", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({
      runAgentFn,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: () => ({ handled: true, result: undefined }),
    })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("/unknown", mockStream as any, "conv-123")

    // Should fall through to runAgent since dispatch had no result
    expect(runAgentFn).toHaveBeenCalled()
  })

  it("/commands with no message field emits empty string", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({
      runAgentFn,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => {
        if (name === "commands") return { handled: true, result: { action: "response", message: undefined } }
        return { handled: false }
      },
    })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("/commands", mockStream as any, "conv-123")

    expect(mockStream.emit).toHaveBeenCalledWith("")
    expect(runAgentFn).not.toHaveBeenCalled()
  })

  it("slash command with unrecognized action falls through to normal handling", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({
      runAgentFn,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: () => ({ handled: true, result: { action: "exit" } }),
    })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("/exit", mockStream as any, "conv-123")

    // "exit" action is not handled in Teams, so falls through to runAgent
    expect(runAgentFn).toHaveBeenCalled()
  })

  it("withConversationLock serializes messages for same conversation", async () => {
    vi.resetModules()
    const order: string[] = []
    mockTeamsDeps({})
    const teams = await import("../../channels/teams")

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
    const teams = await import("../../channels/teams")

    const { withConversationLock } = teams
    await Promise.all([
      withConversationLock("conv-1", async () => { await runAgentFn("1") }),
      withConversationLock("conv-2", async () => { await runAgentFn("2") }),
    ])

    // Both start before either ends (parallel)
    expect(order[0]).toBe("start-1")
    expect(order[1]).toBe("start-2")
  })

  it("handleTeamsMessage passes toolContext to runAgent when provided via TeamsMessageContext", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({ runAgentFn })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }

    const teamsContext = {
      graphToken: "g-token",
      adoToken: "a-token",
      signin: vi.fn(),
    }

    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123", teamsContext)
    expect(runAgentFn).toHaveBeenCalled()

    // Check that runAgent was called with options containing toolContext
    const callArgs = runAgentFn.mock.calls[0]
    const options = callArgs[4] // 5th arg is options
    expect(options).toBeDefined()
    expect(options.toolContext).toBeDefined()
    expect(options.toolContext.graphToken).toBe("g-token")
    expect(options.toolContext.adoToken).toBe("a-token")
    expect(typeof options.toolContext.signin).toBe("function")
    expect(Array.isArray(options.toolContext.adoOrganizations)).toBe(true)
  })

  it("handleTeamsMessage works without TeamsMessageContext (backward compat)", async () => {
    vi.resetModules()
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps({ runAgentFn })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }

    // No teamsContext parameter -- should still work
    await teams.handleTeamsMessage("hello", mockStream as any, "conv-123")
    expect(runAgentFn).toHaveBeenCalled()
  })
})

describe("Teams adapter - createTeamsCallbacks with disableStreaming", () => {
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

  it("onTextChunk buffers text instead of calling stream.emit() when disableStreaming is true", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.onTextChunk("Hello")
    callbacks.onTextChunk(" world")
    // Text should NOT be emitted yet (buffered internally)
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("onReasoningChunk still calls stream.update() when disableStreaming is true", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.onReasoningChunk("analyzing")
    expect(mockStream.update).toHaveBeenCalledWith("analyzing")
  })

  it("onModelStart still calls stream.update() with thinking phrases when disableStreaming is true", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.onModelStart()
    expect(mockStream.update).toHaveBeenCalled()
    const calledWith = mockStream.update.mock.calls[0][0] as string
    expect(calledWith).toMatch(/\.\.\.$/)
    // Clean up timer
    callbacks.onTextChunk("done")
  })

  it("onToolStart still calls stream.update() when disableStreaming is true", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.onToolStart("read_file", { path: "test.txt" })
    expect(mockStream.update).toHaveBeenCalledWith("running read_file (test.txt)...")
  })

  it("onToolEnd still calls stream.update() when disableStreaming is true", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.onToolEnd("read_file", "test.txt", true)
    expect(mockStream.update).toHaveBeenCalledWith("test.txt")
  })

  it("onError still calls stream.emit() immediately when disableStreaming is true", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.onError(new Error("something broke"))
    expect(mockStream.emit).toHaveBeenCalledWith("Error: something broke")
  })

  it("flush() emits entire buffered text as a single stream.emit() call", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.onTextChunk("Hello")
    callbacks.onTextChunk(" world")
    callbacks.onTextChunk("!")
    expect(mockStream.emit).not.toHaveBeenCalled()
    callbacks.flush()
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit).toHaveBeenCalledWith("Hello world!")
  })

  it("flush() with empty buffer does not call stream.emit()", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.flush()
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("when disableStreaming is false, onTextChunk emits directly (no buffering)", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: false })
    callbacks.onTextChunk("Hello")
    expect(mockStream.emit).toHaveBeenCalledWith("Hello")
  })

  it("when disableStreaming is undefined, behavior is identical to current (no buffering)", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onTextChunk("Hello")
    expect(mockStream.emit).toHaveBeenCalledWith("Hello")
  })

  it("flush() exists and is a no-op when disableStreaming is false", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: false })
    callbacks.onTextChunk("Hello")
    mockStream.emit.mockClear()
    callbacks.flush()
    // flush() should not emit anything extra when not buffering
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("stop-streaming (403) still works when disableStreaming is true: emit error aborts controller", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    // flush() will trigger the emit which throws 403
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.onTextChunk("data")
    mockStream.emit.mockImplementation(() => { throw new Error("403 Forbidden") })
    callbacks.flush()
    expect(controller.signal.aborted).toBe(true)
  })

  it("stop-streaming (403) via update still aborts when disableStreaming is true", async () => {
    vi.resetModules()
    const teams = await import("../../channels/teams")
    mockStream.update.mockImplementation(() => { throw new Error("403 Forbidden") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, { disableStreaming: true })
    callbacks.onToolStart("read_file", { path: "test.txt" })
    expect(controller.signal.aborted).toBe(true)
  })
})

describe("Teams adapter - handleTeamsMessage with disableStreaming", () => {
  beforeEach(() => {
    delete process.env.AZURE_OPENAI_API_KEY
  })

  function mockTeamsDeps2(overrides: {
    runAgentFn?: any
    loadSessionReturn?: any
    postTurnCalls?: any[][]
    deleteSessionCalls?: string[]
    parseSlashCommandFn?: any
    dispatchFn?: any
  } = {}) {
    const {
      runAgentFn = vi.fn().mockResolvedValue({ usage: undefined }),
      loadSessionReturn = null,
      postTurnCalls = [],
      deleteSessionCalls = [],
      parseSlashCommandFn = (() => null),
      dispatchFn = (() => ({ handled: false })),
    } = overrides

    vi.doMock("../../engine/core", () => ({
      runAgent: runAgentFn,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/teams-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
      getTeamsConfig: vi.fn().mockReturnValue({ clientId: "", clientSecret: "", tenantId: "" }),
      getOAuthConfig: vi.fn().mockReturnValue({ graphConnectionName: "graph", adoConnectionName: "ado" }),
      getAdoConfig: vi.fn().mockReturnValue({ organizations: [] }),
    }))
    vi.doMock("../../mind/context", () => ({
      loadSession: vi.fn().mockReturnValue(loadSessionReturn),
      saveSession: vi.fn(),
      deleteSession: vi.fn().mockImplementation((...args: any[]) => { deleteSessionCalls.push(args[0]) }),
      trimMessages: vi.fn().mockImplementation((msgs: any) => [...msgs]),
      cachedBuildSystem: vi.fn().mockReturnValue("cached teams prompt"),
      postTurn: vi.fn().mockImplementation((...args: any[]) => { postTurnCalls.push(args) }),
    }))
    vi.doMock("../../repertoire/commands", () => ({
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

  it("disableStreaming flag is forwarded to createTeamsCallbacks - text is buffered", async () => {
    vi.resetModules()
    const mockRunAgent = vi.fn().mockImplementation(async (_msgs: any, callbacks: any) => {
      // Simulate agent producing text chunks
      callbacks.onTextChunk("Hello")
      callbacks.onTextChunk(" world")
      return { usage: undefined }
    })
    mockTeamsDeps2({ runAgentFn: mockRunAgent })

    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("test", mockStream as any, "conv-123", undefined, true)

    // Text should have been emitted once via flush() after runAgent completes (not twice via streaming)
    const emitCalls = mockStream.emit.mock.calls.filter((c: any) => !c[0].startsWith("Error"))
    expect(emitCalls).toHaveLength(1)
    expect(emitCalls[0][0]).toBe("Hello world")
  })

  it("flush() is called after runAgent completes", async () => {
    vi.resetModules()
    let emitCalledDuringAgent = false
    const mockRunAgent = vi.fn().mockImplementation(async (_msgs: any, callbacks: any) => {
      callbacks.onTextChunk("buffered text")
      return { usage: undefined }
    })
    mockTeamsDeps2({ runAgentFn: mockRunAgent })

    const teams = await import("../../channels/teams")
    const mockStream = {
      emit: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
    }
    await teams.handleTeamsMessage("test", mockStream as any, "conv-123", undefined, true)

    // The emit should have been called (by flush after runAgent)
    expect(mockStream.emit).toHaveBeenCalledWith("buffered text")
  })

  it("when disableStreaming is false/undefined, behavior is unchanged (no buffering)", async () => {
    vi.resetModules()
    const mockRunAgent = vi.fn().mockImplementation(async (_msgs: any, callbacks: any) => {
      callbacks.onTextChunk("Hello")
      callbacks.onTextChunk(" world")
      return { usage: undefined }
    })
    mockTeamsDeps2({ runAgentFn: mockRunAgent })

    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("test", mockStream as any, "conv-123")

    // Text emitted directly (not buffered), so two emit calls
    const textEmits = mockStream.emit.mock.calls.filter((c: any) => !c[0].startsWith("Error"))
    expect(textEmits).toHaveLength(2)
    expect(textEmits[0][0]).toBe("Hello")
    expect(textEmits[1][0]).toBe(" world")
  })

  it("slash command /new does NOT call flush (emits directly)", async () => {
    vi.resetModules()
    const deleteSessionCalls: string[] = []
    const runAgentFn = vi.fn().mockResolvedValue({ usage: undefined })
    mockTeamsDeps2({
      runAgentFn,
      deleteSessionCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => {
        if (name === "new") return { handled: true, result: { action: "new" } }
        return { handled: false }
      },
    })
    const teams = await import("../../channels/teams")
    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("/new", mockStream as any, "conv-123", undefined, true)

    // Slash command emits directly, runAgent not called
    expect(deleteSessionCalls.length).toBe(1)
    expect(mockStream.emit).toHaveBeenCalledWith("session cleared")
    expect(runAgentFn).not.toHaveBeenCalled()
  })
})
