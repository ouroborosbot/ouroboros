import { describe, it, expect, vi, afterEach } from "vitest"
import * as path from "path"
import * as fs from "fs"
import Module from "module"

// Tests for main() in agent.ts (lines 149-203) and entrypoint guard (lines 207-209).
//
// IMPORTANT: main() is a private function only called via the entrypoint guard
// `if (require.main === module) { main() }`. In vitest's module system,
// require.main !== module, so main() never executes. The entrypoint guard
// itself (lines 207-209) DOES execute (evaluating to false) and gets V8
// coverage credit for the guard evaluation path.
//
// To test main()'s actual behavior, we load the compiled dist/agent.js via
// Node's Module._load(path, null, true) which sets require.main === module.
// This executes main() in the real Node CJS runtime, verifying its behavior.
// While V8 tracks this execution, vitest's coverage reporter only credits
// code that goes through Vite's transform pipeline, so these tests give
// behavioral verification without vitest V8 coverage credit on the TS source.

const AGENT_PATH = path.resolve(__dirname, "..", "..", "dist", "agent.js")
const CORE_PATH = path.resolve(__dirname, "..", "..", "dist", "core.js")
const DIST_EXISTS = fs.existsSync(AGENT_PATH)
const nativeModule = (Module as any).Module || Module

// Use Module.createRequire for cache manipulation
const { createRequire } = await import("module")
const nativeRequire = createRequire(AGENT_PATH)

function setupMocks(
  mockRl: any,
  runAgentFn: (...args: any[]) => Promise<void> = async () => {},
) {
  nativeRequire.cache[CORE_PATH] = {
    id: CORE_PATH,
    filename: CORE_PATH,
    loaded: true,
    exports: {
      runAgent: runAgentFn,
      buildSystem: () => "system prompt",
      summarizeArgs: () => "",
    },
    children: [],
    paths: [],
    path: path.dirname(CORE_PATH),
  } as any

  const rlPath = nativeRequire.resolve("readline")
  nativeRequire.cache[rlPath] = {
    id: rlPath,
    filename: rlPath,
    loaded: true,
    exports: { createInterface: () => mockRl },
    children: [],
    paths: [],
    path: path.dirname(rlPath),
  } as any

  return rlPath
}

function cleanupCache(rlPath: string) {
  delete nativeRequire.cache[AGENT_PATH]
  delete nativeRequire.cache[CORE_PATH]
  delete nativeRequire.cache[rlPath]
}

let logCalls: string[][]
const origLog = console.log
const origStdout = process.stdout.write
const origStderr = process.stderr.write

function patchGlobals() {
  logCalls = []
  console.log = (...args: any[]) => { logCalls.push(args.map(String)) }
  process.stdout.write = (() => true) as any
  process.stderr.write = (() => true) as any
}

function restoreGlobals() {
  console.log = origLog
  process.stdout.write = origStdout
  process.stderr.write = origStderr
}

describe.skipIf(!DIST_EXISTS)("agent.ts main() - integration via Module._load", () => {
  afterEach(() => {
    restoreGlobals()
  })

  it("runs full loop: boot greeting, processes input, exits on 'exit'", async () => {
    patchGlobals()

    const inputSequence = ["hello world", "exit"]
    let inputIdx = 0
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
          if (inputIdx < inputSequence.length) {
            return { value: inputSequence[inputIdx++], done: false }
          }
          return { value: undefined as any, done: true }
        },
      }),
    }

    const runAgentCalls: any[][] = []
    const rlPath = setupMocks(mockRl, async (...args) => { runAgentCalls.push(args) })

    nativeModule._load(AGENT_PATH, null, true)
    await new Promise((resolve) => setTimeout(resolve, 200))

    const flatLogs = logCalls.flat()
    expect(flatLogs.some((l) => l.includes("mini-max chat"))).toBe(true)
    expect(flatLogs.some((l) => l.includes("bye"))).toBe(true)
    expect(runAgentCalls.length).toBe(2) // boot greeting + "hello world"

    cleanupCache(rlPath)
  })

  it("skips empty input without calling runAgent", async () => {
    patchGlobals()

    const inputSequence = ["", "  ", "exit"]
    let inputIdx = 0
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
          if (inputIdx < inputSequence.length) {
            return { value: inputSequence[inputIdx++], done: false }
          }
          return { value: undefined as any, done: true }
        },
      }),
    }

    const runAgentCalls: any[][] = []
    const rlPath = setupMocks(mockRl, async (...args) => { runAgentCalls.push(args) })

    nativeModule._load(AGENT_PATH, null, true)
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(runAgentCalls.length).toBe(1) // only boot greeting
    expect(logCalls.flat().some((l) => l.includes("bye"))).toBe(true)

    cleanupCache(rlPath)
  })

  it("SIGINT: clear on non-empty, warn on first empty, exit on second", async () => {
    patchGlobals()

    let sigintHandler: (() => void) | null = null
    let closeHandler: (() => void) | null = null
    let inputResolve: ((result: IteratorResult<string>) => void) | null = null

    const mockRl: any = {
      on: (event: string, handler: (...args: any[]) => void) => {
        if (event === "close") closeHandler = handler
        if (event === "SIGINT") sigintHandler = handler
        return mockRl
      },
      close: () => { if (closeHandler) closeHandler() },
      pause: () => {},
      resume: () => {},
      line: "partial",
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<string>> => {
          return new Promise((resolve) => { inputResolve = resolve })
        },
      }),
    }

    const rlPath = setupMocks(mockRl)

    nativeModule._load(AGENT_PATH, null, true)
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(sigintHandler).not.toBeNull()

    // Clear path
    mockRl.line = "partial"
    sigintHandler!()

    // Warn path
    mockRl.line = ""
    sigintHandler!()

    // Exit path
    sigintHandler!()

    if (inputResolve) inputResolve({ value: undefined as any, done: true })
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(logCalls.flat().some((l) => l.includes("bye"))).toBe(true)

    cleanupCache(rlPath)
  })

  it("breaks loop when closed flag is set during runAgent", async () => {
    patchGlobals()

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

    const rlPath = setupMocks(mockRl, async () => {
      if (inputCall > 0 && closeHandler) closeHandler()
    })

    nativeModule._load(AGENT_PATH, null, true)
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(logCalls.flat().some((l) => l.includes("bye"))).toBe(true)

    cleanupCache(rlPath)
  })
})

// This test ensures the entrypoint guard code (lines 207-209) is exercised
// through vitest's module system for V8 coverage credit.
// When imported via vitest, the guard evaluates require.main === module (false),
// so lines 207-208 get coverage but line 209 (inside the if-block) does not.
describe("agent.ts entrypoint guard", () => {
  it("module loads without triggering main() in test context", async () => {
    vi.resetModules()

    vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const agent = await import("../agent")

    // Module loaded successfully, main() did NOT run
    expect(agent.createCliCallbacks).toBeDefined()
    expect(agent.bootGreeting).toBeDefined()
    expect(agent.InputController).toBeDefined()
    expect(agent.handleSigint).toBeDefined()
    expect(agent.addHistory).toBeDefined()

    vi.restoreAllMocks()
  })
})
