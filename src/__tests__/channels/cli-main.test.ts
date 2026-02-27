import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Tests for main() in agent.ts -- the CLI entry point that wires readline,
// input loop, SIGINT handling, postTurn, and history.
// Uses vi.hoisted + vi.mock so agent.ts is loaded ONCE (single V8 instance
// for accurate branch coverage).

// ── hoisted mock fns (available before vi.mock factories run) ──
const mocks = vi.hoisted(() => ({
  runAgent: vi.fn().mockResolvedValue({ usage: undefined }),
  buildSystem: vi.fn().mockReturnValue("system prompt"),
  sessionPath: vi.fn().mockReturnValue("/tmp/test-session.json"),
  getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
  loadSession: vi.fn().mockReturnValue(null),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
  trimMessages: vi.fn().mockImplementation((msgs: any) => [...msgs]),
  cachedBuildSystem: vi.fn().mockReturnValue("system prompt"),
  postTurn: vi.fn(),
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
  postTurn: (...a: any[]) => mocks.postTurn(...a),
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
  mocks.runAgent.mockReset().mockResolvedValue({ usage: undefined })
  mocks.buildSystem.mockReset().mockReturnValue("system prompt")
  mocks.sessionPath.mockReset().mockReturnValue("/tmp/test-session.json")
  mocks.getContextConfig.mockReset().mockReturnValue({ maxTokens: 80000, contextMargin: 20 })
  mocks.loadSession.mockReset().mockReturnValue(null)
  mocks.saveSession.mockReset()
  mocks.deleteSession.mockReset()
  mocks.trimMessages.mockReset().mockImplementation((msgs: any) => [...msgs])
  mocks.cachedBuildSystem.mockReset().mockReturnValue("system prompt")
  mocks.postTurn.mockReset()
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

  it("runs full loop: processes input, exits on /exit", async () => {
    setupBasic({ inputSequence: ["hello world", "/exit"] })

    const runAgentCalls: any[][] = []
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args); return { usage: undefined } })

    await main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("ouroboros") || l.includes("/commands"))).toBe(true)
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
    expect(runAgentCalls.length).toBe(1) // "hello world" only (no boot greeting)
  })

  it("skips empty input without calling runAgent", async () => {
    setupBasic({ inputSequence: ["", "  ", "/exit"] })

    const runAgentCalls: any[][] = []
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args); return { usage: undefined } })

    await main()

    expect(runAgentCalls.length).toBe(0) // no calls (no boot greeting, all input empty)
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
    // Note: no boot greeting, so runAgent is only called for user input

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
      if (closeHandler) closeHandler()
      return { usage: undefined }
    })

    await main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
    // "should not process" should not have been sent to runAgent
    // "some input" only = 1 call (no boot greeting)
    expect(runAgentCalls.length).toBe(1)
  })

  it("abort callback fires during runAgent when Ctrl-C is pressed", async () => {
    let agentSignal: AbortSignal | undefined
    let callCount = 0

    setupBasic({ inputSequence: ["hello", "/exit"] })
    mocks.runAgent.mockImplementation(async (_msgs: any, _cb: any, _channel?: string, signal?: AbortSignal) => {
      callCount++
      if (callCount === 1) {
        agentSignal = signal
        const listeners = process.stdin.listeners("data") as ((data: Buffer) => void)[]
        if (listeners.length > 0) {
          listeners[listeners.length - 1](Buffer.from([0x03]))
        }
      }
      return { usage: undefined }
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
    setupBasic({ inputSequence: ["/exit"], loadSessionReturn: { messages: savedSession, lastUsage: undefined } })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args); return { usage: undefined } })

    await main()

    expect(runAgentCalls.length).toBe(0)
  })

  it("starts fresh when no session exists (no boot greeting)", async () => {
    const runAgentCalls: any[][] = []
    setupBasic({ inputSequence: ["/exit"] })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args); return { usage: undefined } })

    await main()

    expect(runAgentCalls.length).toBe(0) // no boot greeting
  })

  it("starts fresh when session is corrupt (no boot greeting)", async () => {
    const runAgentCalls: any[][] = []
    setupBasic({ inputSequence: ["/exit"], loadSessionReturn: null })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args); return { usage: undefined } })

    await main()

    expect(runAgentCalls.length).toBe(0) // no boot greeting
  })

  it("renders buffered text with markdown after runAgent", async () => {
    setupBasic({ inputSequence: ["hello", "/exit"] })
    let callCount = 0
    mocks.runAgent.mockImplementation(async (_msgs: any, cb: any) => {
      callCount++
      if (callCount === 1) cb.onTextChunk("**bold** reply")
      return { usage: undefined }
    })

    await main()

    const output = stdoutChunks.join("")
    // Markdown should be rendered (bold ANSI codes, not raw **)
    expect(output).toContain("\x1b[1mbold\x1b[22m reply")
    expect(output).not.toContain("**bold**")
  })

  it("calls postTurn after runAgent with usage", async () => {
    const postTurnCalls: any[][] = []
    const usageData = { input_tokens: 100, output_tokens: 50, reasoning_tokens: 10, total_tokens: 160 }
    setupBasic({ inputSequence: ["hello", "/exit"] })
    mocks.runAgent.mockImplementation(async () => ({ usage: usageData }))
    mocks.postTurn.mockImplementation((...args: any[]) => { postTurnCalls.push(args) })

    await main()

    expect(postTurnCalls.length).toBe(1)
    expect(postTurnCalls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "system" }),
    ]))
    expect(postTurnCalls[0][1]).toBe("/tmp/test-session.json")
    expect(postTurnCalls[0][2]).toEqual(usageData)
  })

  it("does not call trimMessages directly (postTurn handles it)", async () => {
    const trimCalls: any[][] = []
    setupBasic({ inputSequence: ["hello", "/exit"] })
    mocks.runAgent.mockImplementation(async () => ({ usage: undefined }))
    mocks.trimMessages.mockImplementation((...args: any[]) => { trimCalls.push(args); return [...args[0]] })

    await main()

    expect(trimCalls.length).toBe(0) // trimming moved to postTurn
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
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args); return { usage: undefined } })

    await main()

    expect(runAgentCalls.length).toBe(0) // no boot greeting, /commands handled without runAgent
  })

  it("calls postTurn after each user turn (not before runAgent)", async () => {
    const postTurnCalls: any[][] = []
    setupBasic({ inputSequence: ["msg1", "msg2", "/exit"] })
    mocks.runAgent.mockImplementation(async () => ({ usage: undefined }))
    mocks.postTurn.mockImplementation((...args: any[]) => { postTurnCalls.push(args) })

    await main()

    // postTurn called once per user message (msg1, msg2)
    expect(postTurnCalls.length).toBe(2)
    // Each postTurn call gets (messages, sessPath, usage)
    expect(postTurnCalls[0][1]).toBe("/tmp/test-session.json")
    expect(postTurnCalls[1][1]).toBe("/tmp/test-session.json")
  })

  it("passes 'cli' channel to runAgent for system prompt refresh", async () => {
    const runAgentCalls: any[][] = []
    setupBasic({
      inputSequence: ["hello", "/exit"],
      loadSessionReturn: {
        messages: [
          { role: "system", content: "old stale prompt" },
          { role: "user", content: "old message" },
        ],
        lastUsage: undefined,
      },
    })
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args); return { usage: undefined } })

    await main()

    expect(runAgentCalls.length).toBe(1) // "hello" turn
    // channel is the 3rd argument (index 2)
    expect(runAgentCalls[0][2]).toBe("cli")
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
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args); return { usage: undefined } })

    await main()

    // /unknown is not handled, so it's sent to runAgent as regular input
    // No boot greeting, just "/unknown" as text = 1 call
    expect(runAgentCalls.length).toBe(1)
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
    mocks.runAgent.mockImplementation(async (...args: any[]) => { runAgentCalls.push(args); return { usage: undefined } })

    await main()

    // /weird is handled but action is unknown, falls through to regular input
    // No boot greeting, just "/weird" as text = 1 call
    expect(runAgentCalls.length).toBe(1)
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

  it("welcome banner shows slash command hints", async () => {
    setupBasic({ inputSequence: ["/exit"] })

    await main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("/commands"))).toBe(true)
  })
})
