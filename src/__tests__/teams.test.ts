import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChannelCallbacks } from "../core"

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

  it("onModelStart sends thinking status update", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onModelStart()
    expect(mockStream.update).toHaveBeenCalledWith("thinking...")
  })

  it("onModelStreamStart is a no-op (does not throw)", async () => {
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
    vi.resetModules()
    const teams = await import("../teams")
    mockStream.update.mockImplementationOnce(() => { throw new Error("403") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onModelStart() // this throws and aborts
    mockStream.update.mockClear()
    callbacks.onToolStart("shell", { command: "ls" }) // should be skipped
    expect(mockStream.update).not.toHaveBeenCalled()
  })

  // --- onReasoningChunk tests ---

  it("onReasoningChunk calls stream.update()", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("analyzing code")
    expect(mockStream.update).toHaveBeenCalledWith("analyzing code")
  })

  it("multiple reasoning chunks each call update()", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)

    callbacks.onReasoningChunk("step 1")
    callbacks.onReasoningChunk("step 2")
    expect(mockStream.update).toHaveBeenCalledTimes(2)
    expect(mockStream.update).toHaveBeenNthCalledWith(1, "step 1")
    expect(mockStream.update).toHaveBeenNthCalledWith(2, "step 2")
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

  it("does not explicitly close stream (framework auto-closes)", async () => {
    vi.resetModules()

    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const teams = await import("../teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hi", mockStream as any)

    expect(mockStream.close).not.toHaveBeenCalled()
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
