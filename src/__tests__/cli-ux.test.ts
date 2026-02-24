import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter, Readable, Writable } from "stream"

// Tests for CLI UX improvements.
// These test the input handling behavior.
// Tests must FAIL (red) because UX fixes have not been implemented yet.

describe("CLI UX - InputController", () => {
  // The InputController class will be exported for testability.
  // It manages readline state, input suppression, and SIGINT handling.

  it("is exported from agent.ts", async () => {
    vi.resetModules()
    const agent = await import("../agent")
    expect(typeof agent.InputController).toBe("function")
  })

  it("suppress() pauses readline and swallows keystrokes", async () => {
    vi.resetModules()
    const agent = await import("../agent")

    const mockStdin = new Readable({ read() {} }) as any
    mockStdin.isTTY = true
    mockStdin.setRawMode = vi.fn()

    const mockStdout = new Writable({ write(_chunk, _enc, cb) { cb(); return true } }) as any
    const readline = await import("readline")
    const rl = readline.createInterface({ input: mockStdin, output: mockStdout, terminal: false })

    const ctrl = new agent.InputController(rl, mockStdin)
    ctrl.suppress()

    // Should set raw mode to swallow keystrokes (not false like the bug)
    expect(mockStdin.setRawMode).toHaveBeenCalled()

    rl.close()
  })

  it("restore() resumes readline", async () => {
    vi.resetModules()
    const agent = await import("../agent")

    const mockStdin = new Readable({ read() {} }) as any
    mockStdin.isTTY = true
    mockStdin.setRawMode = vi.fn()

    const mockStdout = new Writable({ write(_chunk, _enc, cb) { cb(); return true } }) as any
    const readline = await import("readline")
    const rl = readline.createInterface({ input: mockStdin, output: mockStdout, terminal: false })

    const ctrl = new agent.InputController(rl, mockStdin)
    ctrl.suppress()
    ctrl.restore()

    // Should be back to normal -- rl is resumed
    // Double restore should be a no-op
    ctrl.restore()

    rl.close()
  })

  it("suppress() works without TTY (no setRawMode)", async () => {
    vi.resetModules()
    const agent = await import("../agent")

    const mockStdin = new Readable({ read() {} }) as any
    // No isTTY, no setRawMode

    const mockStdout = new Writable({ write(_chunk, _enc, cb) { cb(); return true } }) as any
    const readline = await import("readline")
    const rl = readline.createInterface({ input: mockStdin, output: mockStdout, terminal: false })

    const ctrl = new agent.InputController(rl, mockStdin)
    ctrl.suppress()
    ctrl.restore()
    // Should not throw

    rl.close()
  })

  it("suppress() is idempotent", async () => {
    vi.resetModules()
    const agent = await import("../agent")

    const mockStdin = new Readable({ read() {} }) as any
    mockStdin.isTTY = true
    mockStdin.setRawMode = vi.fn()

    const mockStdout = new Writable({ write(_chunk, _enc, cb) { cb(); return true } }) as any
    const readline = await import("readline")
    const rl = readline.createInterface({ input: mockStdin, output: mockStdout, terminal: false })

    const ctrl = new agent.InputController(rl, mockStdin)
    ctrl.suppress()
    ctrl.suppress() // should be idempotent
    expect(mockStdin.setRawMode).toHaveBeenCalledTimes(1)

    rl.close()
  })
})

describe("CLI UX - Ctrl-C handling", () => {
  it("handleSigint is exported from agent.ts", async () => {
    vi.resetModules()
    const agent = await import("../agent")
    expect(typeof agent.handleSigint).toBe("function")
  })

  it("clears input when buffer is non-empty", async () => {
    vi.resetModules()
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    const stdoutChunks: string[] = []
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutChunks.push(chunk.toString())
      return true
    })

    const agent = await import("../agent")

    const mockStdin = new Readable({ read() {} }) as any
    mockStdin.isTTY = true
    mockStdin.setRawMode = vi.fn()

    const mockStdout = new Writable({ write(_chunk, _enc, cb) { cb(); return true } }) as any
    const readline = await import("readline")
    const rl = readline.createInterface({ input: mockStdin, output: mockStdout, terminal: false })

    // Simulate non-empty input
    const result = agent.handleSigint(rl, "some partial input")
    expect(result).toBe("clear")

    rl.close()
    vi.restoreAllMocks()
  })

  it("shows warning when buffer is empty on first press", async () => {
    vi.resetModules()
    const stderrChunks: string[] = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderrChunks.push(chunk.toString())
      return true
    })
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    const agent = await import("../agent")

    const mockStdin = new Readable({ read() {} }) as any
    mockStdin.isTTY = true

    const mockStdout = new Writable({ write(_chunk, _enc, cb) { cb(); return true } }) as any
    const readline = await import("readline")
    const rl = readline.createInterface({ input: mockStdin, output: mockStdout, terminal: false })

    const result = agent.handleSigint(rl, "")
    expect(result).toBe("warn")

    rl.close()
    vi.restoreAllMocks()
  })

  it("returns exit on second consecutive Ctrl-C with empty buffer", async () => {
    vi.resetModules()
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    const agent = await import("../agent")

    const mockStdin = new Readable({ read() {} }) as any
    mockStdin.isTTY = true

    const mockStdout = new Writable({ write(_chunk, _enc, cb) { cb(); return true } }) as any
    const readline = await import("readline")
    const rl = readline.createInterface({ input: mockStdin, output: mockStdout, terminal: false })

    // First Ctrl-C with empty buffer -> warn
    agent.handleSigint(rl, "")
    // Second Ctrl-C with empty buffer -> exit
    const result = agent.handleSigint(rl, "")
    expect(result).toBe("exit")

    rl.close()
    vi.restoreAllMocks()
  })

  it("resets exit warning after non-empty input", async () => {
    vi.resetModules()
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    const agent = await import("../agent")

    const mockStdin = new Readable({ read() {} }) as any
    mockStdin.isTTY = true

    const mockStdout = new Writable({ write(_chunk, _enc, cb) { cb(); return true } }) as any
    const readline = await import("readline")
    const rl = readline.createInterface({ input: mockStdin, output: mockStdout, terminal: false })

    // First Ctrl-C with empty -> warn
    agent.handleSigint(rl, "")
    // Then Ctrl-C with non-empty -> clear (resets warning)
    agent.handleSigint(rl, "text")
    // Next Ctrl-C with empty -> should be warn again, not exit
    const result = agent.handleSigint(rl, "")
    expect(result).toBe("warn")

    rl.close()
    vi.restoreAllMocks()
  })
})

describe("CLI UX - History", () => {
  it("addHistory is exported from agent.ts", async () => {
    vi.resetModules()
    const agent = await import("../agent")
    expect(typeof agent.addHistory).toBe("function")
  })

  it("adds entries to history array", async () => {
    vi.resetModules()
    const agent = await import("../agent")
    const history: string[] = []
    agent.addHistory(history, "first command")
    agent.addHistory(history, "second command")
    expect(history).toEqual(["first command", "second command"])
  })

  it("does not add empty strings to history", async () => {
    vi.resetModules()
    const agent = await import("../agent")
    const history: string[] = []
    agent.addHistory(history, "")
    agent.addHistory(history, "  ")
    expect(history).toHaveLength(0)
  })

  it("does not add duplicate consecutive entries", async () => {
    vi.resetModules()
    const agent = await import("../agent")
    const history: string[] = []
    agent.addHistory(history, "same command")
    agent.addHistory(history, "same command")
    expect(history).toEqual(["same command"])
  })
})
