import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Tests for main() in agent.ts -- the CLI entry point that wires readline,
// boot greeting, input loop, SIGINT handling, and history.
// Uses vi.hoisted + vi.mock so agent.ts is loaded ONCE (single V8 instance
// for accurate branch coverage).

// ── hoisted mock fns (available before vi.mock factories run) ──
const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  buildSystem: vi.fn().mockReturnValue("system prompt"),
  sessionPath: vi.fn().mockReturnValue("/tmp/test-session.json"),
  getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
  loadSession: vi.fn().mockReturnValue(null),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
  trimMessages: vi.fn().mockImplementation((msgs: any) => [...msgs]),
  cachedBuildSystem: vi.fn().mockReturnValue("system prompt"),
  createCommandRegistry: vi.fn(),
  registerDefaultCommands: vi.fn(),
  parseSlashCommand: vi.fn().mockReturnValue(null),
  createInterface: vi.fn(),
  // per-test registry (rebuilt in beforeEach)
  registry: {
    register: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    dispatch: vi.fn().mockReturnValue({ handled: false }),
  },
}))

vi.mock("readline", () => ({
  createInterface: (...a: any[]) => mocks.createInterface(...a),
}))
vi.mock("../../engine/core", () => ({
  runAgent: (...a: any[]) => mocks.runAgent(...a),
  buildSystem: (...a: any[]) => mocks.buildSystem(...a),
}))
vi.mock("../../config", () => ({
  sessionPath: (...a: any[]) => mocks.sessionPath(...a),
  getContextConfig: (...a: any[]) => mocks.getContextConfig(...a),
}))
vi.mock("../../mind/context", () => ({
  loadSession: (...a: any[]) => mocks.loadSession(...a),
  saveSession: (...a: any[]) => mocks.saveSession(...a),
  deleteSession: (...a: any[]) => mocks.deleteSession(...a),
  trimMessages: (...a: any[]) => mocks.trimMessages(...a),
  cachedBuildSystem: (...a: any[]) => mocks.cachedBuildSystem(...a),
}))
vi.mock("../../repertoire/commands", () => ({
  createCommandRegistry: (...a: any[]) => mocks.createCommandRegistry(...a),
  registerDefaultCommands: (...a: any[]) => mocks.registerDefaultCommands(...a),
  parseSlashCommand: (...a: any[]) => mocks.parseSlashCommand(...a),
}))

import { main } from "../../channels/cli"

// ── helpers ──

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

  return { mockRl, getCloseHandler: () => closeHandler, getSigintHandler: () => sigintHandler }
}

/** Reset all hoisted mocks to default behaviour */
function resetMocks() {
  mocks.runAgent.mockReset()
  mocks.buildSystem.mockReset().mockReturnValue("system prompt")
  mocks.sessionPath.mockReset().mockReturnValue("/tmp/test-session.json")
  mocks.getContextConfig.mockReset().mockReturnValue({ maxTokens: 80000, contextMargin: 20 })
  mocks.loadSession.mockReset().mockReturnValue(null)
  mocks.saveSession.mockReset()
  mocks.deleteSession.mockReset()
  mocks.trimMessages.mockReset().mockImplementation((msgs: any) => [...msgs])
  mocks.cachedBuildSystem.mockReset().mockReturnValue("system prompt")
  mocks.registerDefaultCommands.mockReset()
  mocks.parseSlashCommand.mockReset().mockReturnValue(null)

  // Fresh registry each test
  mocks.registry = {
    register: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    dispatch: vi.fn().mockReturnValue({ handled: false }),
  }
  mocks.createCommandRegistry.mockReset().mockReturnValue(mocks.registry)
}

/** Wire a simple mockRl and common slash-command routing */
function setupBasic(opts: {
  inputSequence: string[]
  loadSessionReturn?: any
  parseSlash?: boolean
  dispatchFn?: (name: string) => any
}) {
  const {
    inputSequence,
    loadSessionReturn = null,
    parseSlash = true,
    dispatchFn = (name: string) => name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false },
  } = opts

  const { mockRl, getCloseHandler, getSigintHandler } = createMockRl(inputSequence)
  mocks.createInterface.mockReturnValue(mockRl)
  mocks.loadSession.mockReturnValue(loadSessionReturn)

  if (parseSlash) {
    mocks.parseSlashCommand.mockImplementation((input: string) =>
      input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null)
  }
  mocks.registry.dispatch.mockImplementation(dispatchFn)

  return { mockRl, getCloseHandler, getSigintHandler }
}

// ── tests ──

describe("agent.ts main()", () => {
  beforeEach(() => {
    resetMocks()
    setupSpies()
  })

  afterEach(() => {
    restoreSpies()
    vi.restoreAllMocks()
  })

  it("runs full loop: boot greeting, processes input, exits on /exit", async () => {
    setupBasic({ inputSequence: ["hello world", "/exit"] })

    const runAgentCalls: any[][] = []
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) })

    await main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("ouroboros") || l.includes("/commands"))).toBe(true)
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
    expect(runAgentCalls.length).toBe(2) // boot greeting + "hello world"
  })

  it("skips empty input without calling runAgent", async () => {
    setupBasic({ inputSequence: ["", "  ", "/exit"] })

    const runAgentCalls: any[][] = []
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) })

    await main()

    expect(runAgentCalls.length).toBe(1) // only boot greeting
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

    mocks.createInterface.mockReturnValue(mockRl)
    const mainPromise = main()

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
          // Yield another value AFTER close fires so `if (closed) break` is hit
          if (inputCall === 2) return { value: "should not process", done: false }
          return { value: undefined as any, done: true }
        },
      }),
    }

    mocks.createInterface.mockReturnValue(mockRl)
    const runAgentCalls: any[][] = []
    mocks.runAgent.mockImplementation(async (...args: any[]) => {
      runAgentCalls.push(args)
      // Simulate stream closing during runAgent for user input
      if (inputCall > 0 && closeHandler) closeHandler()
    })

    await main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
    // "should not process" should not have been sent to runAgent
    // Only boot greeting + "some input" = 2 calls
    expect(runAgentCalls.length).toBe(2)
  })

  it("breaks on first iteration when closed during boot greeting", async () => {
    let closeHandler: (() => void) | null = null

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
          // Always yield input -- but closed flag should prevent processing
          return { value: "should not process", done: false }
        },
      }),
    }

    mocks.createInterface.mockReturnValue(mockRl)
    const runAgentCalls: any[][] = []
    mocks.runAgent.mockImplementation(async (...args: any[]) => {
      runAgentCalls.push(args)
      // Close during boot greeting (before for-await loop)
      if (closeHandler) closeHandler()
    })

    await main()

    // Only boot greeting; the loop input should be skipped via if (closed) break
    expect(runAgentCalls.length).toBe(1)
  })

  it("handles boot greeting rejection gracefully", async () => {
    setupBasic({ inputSequence: ["/exit"] })
    mocks.runAgent.mockRejectedValue(new Error("boot failed"))

    await main()

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

    mocks.createInterface.mockReturnValue(mockRl)
    mocks.runAgent.mockImplementation(async (_msgs: any, _cb: any, signal?: AbortSignal) => {
      bootSignal = signal
      const listeners = process.stdin.listeners("data") as ((data: Buffer) => void)[]
      if (listeners.length > 0) {
        listeners[listeners.length - 1](Buffer.from([0x03]))
      }
    })
    mocks.parseSlashCommand.mockImplementation((input: string) =>
      input.startsWith("/") ? { command: input.slice(1).toLowerCase(), args: "" } : null)
    mocks.registry.dispatch.mockImplementation((name: string) =>
      name === "exit" ? { handled: true, result: { action: "exit" } } : { handled: false })

    await main()

    expect(bootSignal?.aborted).toBe(true)
  })

  it("abort callback fires during runAgent when Ctrl-C is pressed", async () => {
    let agentSignal: AbortSignal | undefined
    let callCount = 0

    setupBasic({ inputSequence: ["hello", "/exit"] })
    mocks.runAgent.mockImplementation(async (_msgs: any, _cb: any, signal?: AbortSignal) => {
      callCount++
      if (callCount === 2) {
        agentSignal = signal
        const listeners = process.stdin.listeners("data") as ((data: Buffer) => void)[]
        if (listeners.length > 0) {
          listeners[listeners.length - 1](Buffer.from([0x03]))
        }
      }
    })

    await main()

    expect(agentSignal?.aborted).toBe(true)
  })

  it("exits when input is /Exit (case insensitive slash command)", async () => {
    setupBasic({ inputSequence: ["/Exit"] })

    await main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
  })
})

describe("agent.ts main() - session persistence", () => {
  beforeEach(() => {
    resetMocks()
    setupSpies()
  })

  afterEach(() => {
    restoreSpies()
    vi.restoreAllMocks()
  })

  it("loads existing session on startup (no boot greeting)", async () => {
    const savedSession = [
      { role: "system", content: "old system" },
      { role: "user", content: "previous message" },
      { role: "assistant", content: "previous reply" },
    ]
    const runAgentCalls: any[][] = []
    setupBasic({ inputSequence: ["/exit"], loadSessionReturn: savedSession })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) })

    await main()

    expect(runAgentCalls.length).toBe(0)
  })

  it("starts fresh with boot greeting when no session exists", async () => {
    const runAgentCalls: any[][] = []
    setupBasic({ inputSequence: ["/exit"] })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) })

    await main()

    expect(runAgentCalls.length).toBe(1)
  })

  it("starts fresh with boot greeting when session is corrupt", async () => {
    const runAgentCalls: any[][] = []
    setupBasic({ inputSequence: ["/exit"], loadSessionReturn: null })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) })

    await main()

    expect(runAgentCalls.length).toBe(1)
  })

  it("saves session after each turn", async () => {
    const saveSessionCalls: any[][] = []
    setupBasic({ inputSequence: ["hello", "/exit"] })
    mocks.runAgent.mockImplementation(async () => {})
    mocks.saveSession.mockImplementation((...args: any[]) => { saveSessionCalls.push(args) })

    await main()

    expect(saveSessionCalls.length).toBeGreaterThanOrEqual(2)
    expect(saveSessionCalls[0][0]).toBe("/tmp/test-session.json")
  })

  it("calls trimMessages before runAgent", async () => {
    const trimCalls: any[][] = []
    setupBasic({ inputSequence: ["hello", "/exit"] })
    mocks.runAgent.mockImplementation(async () => {})
    mocks.trimMessages.mockImplementation((...args: any[]) => { trimCalls.push(args); return [...args[0]] })

    await main()

    expect(trimCalls.length).toBeGreaterThanOrEqual(1)
  })

  it("/exit quits the process", async () => {
    setupBasic({ inputSequence: ["/exit"] })

    await main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
  })

  it("/new clears session and prints confirmation", async () => {
    const deleteSessionCalls: string[] = []
    setupBasic({
      inputSequence: ["/new", "/exit"],
      dispatchFn: (name: string) => {
        if (name === "exit") return { handled: true, result: { action: "exit" } }
        if (name === "new") return { handled: true, result: { action: "new" } }
        return { handled: false }
      },
    })
    mocks.deleteSession.mockImplementation((...args: any[]) => { deleteSessionCalls.push(args[0]) })

    await main()

    expect(deleteSessionCalls.length).toBeGreaterThanOrEqual(1)
  })

  it("/commands prints command list without calling runAgent", async () => {
    const runAgentCalls: any[][] = []
    setupBasic({
      inputSequence: ["/commands", "/exit"],
      dispatchFn: (name: string) => {
        if (name === "exit") return { handled: true, result: { action: "exit" } }
        if (name === "commands") return { handled: true, result: { action: "response", message: "/exit - quit\n/new - new session" } }
        return { handled: false }
      },
    })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) })

    await main()

    expect(runAgentCalls.length).toBe(1) // only boot greeting
  })

  it("context window integration: trims old messages when exceeding limit", async () => {
    const trimCalls: any[][] = []
    setupBasic({ inputSequence: ["msg1", "msg2", "/exit"] })
    mocks.runAgent.mockImplementation(async () => {})
    mocks.trimMessages.mockImplementation((msgs: any[], maxTokens: number, margin: number) => {
      trimCalls.push([msgs.length, maxTokens, margin])
      if (msgs.length > 3) return [msgs[0], ...msgs.slice(-2)]
      return [...msgs]
    })

    await main()

    expect(trimCalls.length).toBeGreaterThanOrEqual(1)
    expect(trimCalls[0][1]).toBe(80000)
    expect(trimCalls[0][2]).toBe(20)
  })

  it("refreshes system prompt from cachedBuildSystem on each turn", async () => {
    const runAgentCalls: any[][] = []
    setupBasic({
      inputSequence: ["hello", "/exit"],
      loadSessionReturn: [
        { role: "system", content: "old stale prompt" },
        { role: "user", content: "old message" },
      ],
    })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) })

    await main()

    expect(runAgentCalls.length).toBe(1) // "hello" turn
    const msgs = runAgentCalls[0][0]
    expect(msgs[0].content).toBe("system prompt")
  })

  it("unhandled slash command falls through to regular input", async () => {
    const runAgentCalls: any[][] = []
    setupBasic({
      inputSequence: ["/unknown", "/exit"],
      dispatchFn: (name: string) => {
        if (name === "exit") return { handled: true, result: { action: "exit" } }
        return { handled: false }
      },
    })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) })

    await main()

    // /unknown is not handled, so it's sent to runAgent as regular input
    // boot greeting + "/unknown" as text = 2 calls
    expect(runAgentCalls.length).toBe(2)
  })

  it("slash command with unknown action falls through to regular input", async () => {
    const runAgentCalls: any[][] = []
    setupBasic({
      inputSequence: ["/weird", "/exit"],
      dispatchFn: (name: string) => {
        if (name === "exit") return { handled: true, result: { action: "exit" } }
        if (name === "weird") return { handled: true, result: { action: "something_else" } }
        return { handled: false }
      },
    })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) })

    await main()

    // /weird is handled but action is unknown, falls through to regular input
    // boot greeting + "/weird" as text = 2 calls
    expect(runAgentCalls.length).toBe(2)
  })

  it("/commands with empty message prints empty line", async () => {
    setupBasic({
      inputSequence: ["/commands", "/exit"],
      dispatchFn: (name: string) => {
        if (name === "exit") return { handled: true, result: { action: "exit" } }
        if (name === "commands") return { handled: true, result: { action: "response" } }
        return { handled: false }
      },
    })

    await main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l === "")).toBe(true)
  })

  it("boot message shows slash command hints", async () => {
    setupBasic({ inputSequence: ["/exit"] })

    await main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("/commands"))).toBe(true)
  })
})
