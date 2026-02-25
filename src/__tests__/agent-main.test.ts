import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Tests for main() in agent.ts -- the CLI entry point that wires readline,
// boot greeting, input loop, SIGINT handling, and history.
// Now that main() is exported, we call it directly through vitest for V8 coverage.

function mockNewDeps() {
  vi.doMock("../config", () => ({
    sessionPath: vi.fn().mockReturnValue("/tmp/test-session.json"),
    getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
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

let stdoutChunks: string[]
let stderrChunks: string[]
let logCalls: string[][]
let stdoutSpy: ReturnType<typeof vi.spyOn>
let stderrSpy: ReturnType<typeof vi.spyOn>
let consoleSpy: ReturnType<typeof vi.spyOn>

function setupSpies() {
  stdoutChunks = []
  stderrChunks = []
  logCalls = []
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
    stdoutChunks.push(chunk.toString())
    return true
  })
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
    stderrChunks.push(chunk.toString())
    return true
  })
  consoleSpy = vi.spyOn(console, "log").mockImplementation((...args: any[]) => {
    logCalls.push(args.map(String))
  })
}

function restoreSpies() {
  stdoutSpy?.mockRestore()
  stderrSpy?.mockRestore()
  consoleSpy?.mockRestore()
}

function createMockRl(inputSequence: string[]) {
  let inputIdx = 0
  let closeHandler: (() => void) | null = null
  let sigintHandler: ((...args: any[]) => void) | null = null

  const mockRl: any = {
    on: (event: string, handler: (...args: any[]) => void) => {
      if (event === "close") closeHandler = handler
      if (event === "SIGINT") sigintHandler = handler
      return mockRl
    },
    close: () => { if (closeHandler) closeHandler() },
    pause: () => {},
    resume: () => {},
    line: "",
    [Symbol.asyncIterator]: () => ({
      next: async (): Promise<IteratorResult<string>> => {
        if (inputIdx < inputSequence.length) {
          return { value: inputSequence[inputIdx++], done: false }
        }
        return { value: undefined as any, done: true }
      },
    }),
  }

  return { mockRl, getSigintHandler: () => sigintHandler }
}

describe("agent.ts main()", () => {
  beforeEach(() => {
    vi.resetModules()
    setupSpies()
  })

  afterEach(() => {
    restoreSpies()
    vi.restoreAllMocks()
  })

  it("runs full loop: boot greeting, processes input, exits on /exit", async () => {
    const { mockRl } = createMockRl(["hello world", "/exit"])
    const runAgentCalls: any[][] = []

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) }),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/test-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
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
        dispatch: vi.fn().mockImplementation((name: string) => {
          if (name === "exit") return { handled: true, result: { action: "exit" } }
          return { handled: false }
        }),
      }),
      registerDefaultCommands: vi.fn(),
      parseSlashCommand: vi.fn().mockImplementation((input: string) => {
        if (input.startsWith("/")) return { command: input.slice(1).toLowerCase(), args: "" }
        return null
      }),
    }))

    const agent = await import("../agent")
    await agent.main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("ouroboros") || l.includes("/commands"))).toBe(true)
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
    expect(runAgentCalls.length).toBe(2) // boot greeting + "hello world"
  })

  it("skips empty input without calling runAgent", async () => {
    const { mockRl } = createMockRl(["", "  ", "/exit"])
    const runAgentCalls: any[][] = []

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) }),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/test-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
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
        dispatch: vi.fn().mockImplementation((name: string) => {
          if (name === "exit") return { handled: true, result: { action: "exit" } }
          return { handled: false }
        }),
      }),
      registerDefaultCommands: vi.fn(),
      parseSlashCommand: vi.fn().mockImplementation((input: string) => {
        if (input.startsWith("/")) return { command: input.slice(1).toLowerCase(), args: "" }
        return null
      }),
    }))

    const agent = await import("../agent")
    await agent.main()

    expect(runAgentCalls.length).toBe(1) // only boot greeting
    // Prompt re-displayed for empty inputs
    const prompts = stdoutChunks.filter((c) => c.includes("> "))
    expect(prompts.length).toBeGreaterThanOrEqual(2)
  })

  it("SIGINT: clear on non-empty, warn on first empty, exit on second", async () => {
    let inputResolve: ((result: IteratorResult<string>) => void) | null = null

    const mockRl: any = {
      on: (event: string, handler: (...args: any[]) => void) => {
        if (event === "close") mockRl._closeHandler = handler
        if (event === "SIGINT") mockRl._sigintHandler = handler
        return mockRl
      },
      close: () => { if (mockRl._closeHandler) mockRl._closeHandler() },
      pause: () => {},
      resume: () => {},
      line: "partial",
      _closeHandler: null as any,
      _sigintHandler: null as any,
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<string>> => {
          return new Promise((resolve) => { inputResolve = resolve })
        },
      }),
    }

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    mockNewDeps()

    const agent = await import("../agent")
    const mainPromise = agent.main()

    // Wait for main to start and register handlers
    await new Promise((r) => setTimeout(r, 50))

    expect(mockRl._sigintHandler).not.toBeNull()

    // Clear path (non-empty line)
    mockRl.line = "partial"
    mockRl._sigintHandler()

    // Warn path (first empty Ctrl-C)
    mockRl.line = ""
    mockRl._sigintHandler()
    expect(stderrChunks.join("")).toContain("Ctrl-C again to exit")

    // Exit path (second Ctrl-C)
    mockRl._sigintHandler()

    // Resolve the pending input iterator to let main() finish
    if (inputResolve) inputResolve({ value: undefined as any, done: true })
    await mainPromise

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
  })

  it("breaks loop when closed flag is set during runAgent", async () => {
    let closeHandler: (() => void) | null = null
    let inputCall = 0

    const mockRl: any = {
      on: (event: string, handler: (...args: any[]) => void) => {
        if (event === "close") closeHandler = handler
        return mockRl
      },
      close: () => { if (closeHandler) closeHandler() },
      pause: () => {},
      resume: () => {},
      line: "",
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<string>> => {
          inputCall++
          if (inputCall === 1) return { value: "some input", done: false }
          return { value: undefined as any, done: true }
        },
      }),
    }

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockImplementation(async () => {
        // Simulate stream closing during runAgent
        if (inputCall > 0 && closeHandler) closeHandler()
      }),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    mockNewDeps()

    const agent = await import("../agent")
    await agent.main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
  })

  it("handles boot greeting rejection gracefully", async () => {
    const { mockRl } = createMockRl(["/exit"])

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockRejectedValue(new Error("boot failed")),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/test-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
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
        dispatch: vi.fn().mockImplementation((name: string) => {
          if (name === "exit") return { handled: true, result: { action: "exit" } }
          return { handled: false }
        }),
      }),
      registerDefaultCommands: vi.fn(),
      parseSlashCommand: vi.fn().mockImplementation((input: string) => {
        if (input.startsWith("/")) return { command: input.slice(1).toLowerCase(), args: "" }
        return null
      }),
    }))

    const agent = await import("../agent")
    await agent.main()

    // Should still reach "bye" despite boot greeting failing
    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
  })

  it("abort callback fires during boot when Ctrl-C is pressed", async () => {
    let bootSignal: AbortSignal | undefined

    const mockRl: any = {
      on: (event: string, handler: (...args: any[]) => void) => {
        if (event === "close") mockRl._closeHandler = handler
        return mockRl
      },
      close: () => { if (mockRl._closeHandler) mockRl._closeHandler() },
      pause: () => {},
      resume: () => {},
      line: "",
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<string>> => {
          return { value: "/exit", done: false }
        },
      }),
    }

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockImplementation(async (_msgs: any, _cb: any, signal?: AbortSignal) => {
        bootSignal = signal
        // Simulate Ctrl-C by writing 0x03 to the data handler on stdin
        const listeners = process.stdin.listeners("data") as ((data: Buffer) => void)[]
        if (listeners.length > 0) {
          listeners[listeners.length - 1](Buffer.from([0x03]))
        }
      }),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/test-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
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
        dispatch: vi.fn().mockImplementation((name: string) => {
          if (name === "exit") return { handled: true, result: { action: "exit" } }
          return { handled: false }
        }),
      }),
      registerDefaultCommands: vi.fn(),
      parseSlashCommand: vi.fn().mockImplementation((input: string) => {
        if (input.startsWith("/")) return { command: input.slice(1).toLowerCase(), args: "" }
        return null
      }),
    }))

    const agent = await import("../agent")
    await agent.main()

    expect(bootSignal?.aborted).toBe(true)
  })

  it("abort callback fires during runAgent when Ctrl-C is pressed", async () => {
    let agentSignal: AbortSignal | undefined
    let callCount = 0

    const { mockRl } = createMockRl(["hello", "/exit"])

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockImplementation(async (_msgs: any, _cb: any, signal?: AbortSignal) => {
        callCount++
        if (callCount === 2) {
          // This is the "hello" input call, simulate Ctrl-C
          agentSignal = signal
          const listeners = process.stdin.listeners("data") as ((data: Buffer) => void)[]
          if (listeners.length > 0) {
            listeners[listeners.length - 1](Buffer.from([0x03]))
          }
        }
      }),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/test-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
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
        dispatch: vi.fn().mockImplementation((name: string) => {
          if (name === "exit") return { handled: true, result: { action: "exit" } }
          return { handled: false }
        }),
      }),
      registerDefaultCommands: vi.fn(),
      parseSlashCommand: vi.fn().mockImplementation((input: string) => {
        if (input.startsWith("/")) return { command: input.slice(1).toLowerCase(), args: "" }
        return null
      }),
    }))

    const agent = await import("../agent")
    await agent.main()

    expect(agentSignal?.aborted).toBe(true)
  })

  it("exits when input is /Exit (case insensitive slash command)", async () => {
    const { mockRl } = createMockRl(["/Exit"])

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
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
        dispatch: vi.fn().mockImplementation((name: string) => {
          if (name === "exit") return { handled: true, result: { action: "exit" } }
          return { handled: false }
        }),
      }),
      registerDefaultCommands: vi.fn(),
      parseSlashCommand: vi.fn().mockImplementation((input: string) => {
        if (input.startsWith("/")) return { command: input.slice(1).toLowerCase(), args: "" }
        return null
      }),
    }))

    const agent = await import("../agent")
    await agent.main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
  })
})

describe("agent.ts main() - session persistence", () => {
  beforeEach(() => {
    vi.resetModules()
    setupSpies()
  })

  afterEach(() => {
    restoreSpies()
    vi.restoreAllMocks()
  })

  function mockDeps(overrides: {
    inputSequence?: string[]
    loadSessionReturn?: any
    runAgentCalls?: any[][]
    saveSessionCalls?: any[][]
    deleteSessionCalls?: string[]
    trimMessagesFn?: any
    parseSlashCommandFn?: any
    dispatchFn?: any
  } = {}) {
    const {
      inputSequence = [],
      loadSessionReturn = null,
      runAgentCalls = [],
      saveSessionCalls = [],
      deleteSessionCalls = [],
      trimMessagesFn = ((msgs: any) => [...msgs]),
      parseSlashCommandFn = (() => null),
      dispatchFn = (() => ({ handled: false })),
    } = overrides

    const { mockRl } = createMockRl(inputSequence)

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) }),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))
    vi.doMock("../config", () => ({
      sessionPath: vi.fn().mockReturnValue("/tmp/test-session.json"),
      getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
    }))
    vi.doMock("../context", () => ({
      loadSession: vi.fn().mockReturnValue(loadSessionReturn),
      saveSession: vi.fn().mockImplementation((...args: any[]) => { saveSessionCalls.push(args) }),
      deleteSession: vi.fn().mockImplementation((...args: any[]) => { deleteSessionCalls.push(args[0]) }),
      trimMessages: vi.fn().mockImplementation(trimMessagesFn),
      cachedBuildSystem: vi.fn().mockReturnValue("cached system prompt"),
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

    return { mockRl }
  }

  it("loads existing session on startup (no boot greeting)", async () => {
    const runAgentCalls: any[][] = []
    const savedSession = [
      { role: "system", content: "old system" },
      { role: "user", content: "previous message" },
      { role: "assistant", content: "previous reply" },
    ]

    mockDeps({
      inputSequence: ["/exit"],
      loadSessionReturn: savedSession,
      runAgentCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
    })

    const agent = await import("../agent")
    await agent.main()

    // No boot greeting runAgent call -- session was restored
    expect(runAgentCalls.length).toBe(0)
  })

  it("starts fresh with boot greeting when no session exists", async () => {
    const runAgentCalls: any[][] = []

    mockDeps({
      inputSequence: ["/exit"],
      loadSessionReturn: null,
      runAgentCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
    })

    const agent = await import("../agent")
    await agent.main()

    // Boot greeting fires
    expect(runAgentCalls.length).toBe(1) // boot greeting only
  })

  it("starts fresh with boot greeting when session is corrupt", async () => {
    const runAgentCalls: any[][] = []

    mockDeps({
      inputSequence: ["/exit"],
      loadSessionReturn: null, // loadSession returns null for corrupt
      runAgentCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
    })

    const agent = await import("../agent")
    await agent.main()

    expect(runAgentCalls.length).toBe(1) // boot greeting
  })

  it("saves session after each turn", async () => {
    const saveSessionCalls: any[][] = []

    mockDeps({
      inputSequence: ["hello", "/exit"],
      loadSessionReturn: null,
      saveSessionCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
    })

    const agent = await import("../agent")
    await agent.main()

    // saveSession called: after boot greeting + after user turn
    expect(saveSessionCalls.length).toBeGreaterThanOrEqual(2)
    expect(saveSessionCalls[0][0]).toBe("/tmp/test-session.json")
  })

  it("calls trimMessages before runAgent", async () => {
    const trimCalls: any[][] = []

    mockDeps({
      inputSequence: ["hello", "/exit"],
      loadSessionReturn: null,
      trimMessagesFn: (...args: any[]) => { trimCalls.push(args); return [...args[0]] },
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
    })

    const agent = await import("../agent")
    await agent.main()

    // trimMessages should be called for the "hello" input
    expect(trimCalls.length).toBeGreaterThanOrEqual(1)
  })

  it("/exit quits the process", async () => {
    mockDeps({
      inputSequence: ["/exit"],
      loadSessionReturn: null,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
    })

    const agent = await import("../agent")
    await agent.main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
  })

  it("/new clears session and prints confirmation", async () => {
    const deleteSessionCalls: string[] = []
    const saveSessionCalls: any[][] = []

    mockDeps({
      inputSequence: ["/new", "/exit"],
      loadSessionReturn: null,
      deleteSessionCalls,
      saveSessionCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => {
        if (name === "exit") return { handled: true, result: { action: "exit" } }
        if (name === "new") return { handled: true, result: { action: "new" } }
        return { handled: false }
      },
    })

    const agent = await import("../agent")
    await agent.main()

    expect(deleteSessionCalls.length).toBeGreaterThanOrEqual(1)
  })

  it("/commands prints command list without calling runAgent", async () => {
    const runAgentCalls: any[][] = []

    mockDeps({
      inputSequence: ["/commands", "/exit"],
      loadSessionReturn: null,
      runAgentCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => {
        if (name === "exit") return { handled: true, result: { action: "exit" } }
        if (name === "commands") return { handled: true, result: { action: "response", message: "/exit - quit\n/new - new session" } }
        return { handled: false }
      },
    })

    const agent = await import("../agent")
    await agent.main()

    // Only boot greeting, not /commands
    expect(runAgentCalls.length).toBe(1)
  })

  it("context window integration: trims old messages when exceeding limit", async () => {
    const trimCalls: any[][] = []

    mockDeps({
      inputSequence: ["msg1", "msg2", "/exit"],
      loadSessionReturn: null,
      trimMessagesFn: (msgs: any[], maxTokens: number, margin: number) => {
        trimCalls.push([msgs.length, maxTokens, margin])
        // Simulate trimming by keeping system + last 2
        if (msgs.length > 3) return [msgs[0], ...msgs.slice(-2)]
        return [...msgs]
      },
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
    })

    const agent = await import("../agent")
    await agent.main()

    expect(trimCalls.length).toBeGreaterThanOrEqual(1)
    // Verify trimMessages was called with maxTokens and contextMargin
    expect(trimCalls[0][1]).toBe(80000)
    expect(trimCalls[0][2]).toBe(20)
  })

  it("refreshes system prompt from cachedBuildSystem on each turn", async () => {
    const runAgentCalls: any[][] = []

    mockDeps({
      inputSequence: ["hello", "/exit"],
      loadSessionReturn: [
        { role: "system", content: "old stale prompt" },
        { role: "user", content: "old message" },
      ],
      runAgentCalls,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
    })

    const agent = await import("../agent")
    await agent.main()

    // The messages passed to runAgent should have the refreshed system prompt
    expect(runAgentCalls.length).toBe(1) // "hello" turn
    const msgs = runAgentCalls[0][0]
    expect(msgs[0].content).toBe("cached system prompt")
  })

  it("boot message shows slash command hints", async () => {
    mockDeps({
      inputSequence: ["/exit"],
      loadSessionReturn: null,
      parseSlashCommandFn: (input: string) => input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null,
      dispatchFn: (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
    })

    const agent = await import("../agent")
    await agent.main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("/commands"))).toBe(true)
  })
})
