import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Tests for main() in agent.ts -- the CLI entry point that wires readline,
// boot greeting, input loop, SIGINT handling, and history.
// Now that main() is exported, we call it directly through vitest for V8 coverage.

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

  it("runs full loop: boot greeting, processes input, exits on 'exit'", async () => {
    const { mockRl } = createMockRl(["hello world", "exit"])
    const runAgentCalls: any[][] = []

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) }),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))

    const agent = await import("../agent")
    await agent.main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("ouroboros"))).toBe(true)
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
    expect(runAgentCalls.length).toBe(2) // boot greeting + "hello world"
  })

  it("skips empty input without calling runAgent", async () => {
    const { mockRl } = createMockRl(["", "  ", "exit"])
    const runAgentCalls: any[][] = []

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockImplementation(async (...args: any[]) => { runAgentCalls.push(args) }),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
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

    const agent = await import("../agent")
    await agent.main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
  })

  it("handles boot greeting rejection gracefully", async () => {
    const { mockRl } = createMockRl(["exit"])

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn().mockRejectedValue(new Error("boot failed")),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
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
          return { value: "exit", done: false }
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

    const agent = await import("../agent")
    await agent.main()

    expect(bootSignal?.aborted).toBe(true)
  })

  it("abort callback fires during runAgent when Ctrl-C is pressed", async () => {
    let agentSignal: AbortSignal | undefined
    let callCount = 0

    const { mockRl } = createMockRl(["hello", "exit"])

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

    const agent = await import("../agent")
    await agent.main()

    expect(agentSignal?.aborted).toBe(true)
  })

  it("exits when input is 'exit' (case insensitive)", async () => {
    const { mockRl } = createMockRl(["EXIT"])

    vi.doMock("readline", () => ({
      createInterface: () => mockRl,
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
    }))

    const agent = await import("../agent")
    await agent.main()

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
  })
})
