import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

vi.mock("../../heart/identity", () => ({
  getAgentName: vi.fn(() => "testagent"),
  getAgentRoot: vi.fn(() => "/tmp/AgentBundles/testagent.ouro"),
}))

describe("Teams tool callbacks via createToolActivityCallbacks", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function loadModule() {
    const { createToolActivityCallbacks } = await import("../../heart/tool-activity-callbacks")
    return createToolActivityCallbacks
  }

  describe("default mode", () => {
    it("safeUpdate called with human-readable text on tool START", async () => {
      const createToolActivityCallbacks = await loadModule()
      const safeUpdate = vi.fn()

      const { onToolStart } = createToolActivityCallbacks({
        onDescription: safeUpdate,
        onResult: vi.fn(),
        onFailure: vi.fn(),
        isDebug: () => false,
      })

      onToolStart("shell", { command: "npm test" })
      expect(safeUpdate).toHaveBeenCalledWith("running npm test...")
    })

    it("no safeUpdate on tool END in default mode", async () => {
      const createToolActivityCallbacks = await loadModule()
      const safeUpdate = vi.fn()

      const { onToolEnd } = createToolActivityCallbacks({
        onDescription: vi.fn(),
        onResult: safeUpdate,
        onFailure: vi.fn(),
        isDebug: () => false,
      })

      onToolEnd("read_file", "200 lines", true)
      expect(safeUpdate).not.toHaveBeenCalled()
    })

    it("no 'shared work: processing' text anywhere", async () => {
      const createToolActivityCallbacks = await loadModule()
      const allCalls: string[] = []
      const capture = vi.fn((text: string) => allCalls.push(text))

      const { onToolStart, onToolEnd } = createToolActivityCallbacks({
        onDescription: capture,
        onResult: capture,
        onFailure: capture,
        isDebug: () => false,
      })

      onToolStart("read_file", { path: "/a/b.ts" })
      onToolEnd("read_file", "done", true)
      onToolStart("shell", { command: "npm test" })
      onToolEnd("shell", "exit 0", true)

      for (const text of allCalls) {
        expect(text).not.toContain("shared work")
      }
    })
  })

  describe("debug mode", () => {
    it("safeUpdate includes result on tool END", async () => {
      const createToolActivityCallbacks = await loadModule()
      const safeUpdate = vi.fn()

      const { onToolEnd } = createToolActivityCallbacks({
        onDescription: vi.fn(),
        onResult: safeUpdate,
        onFailure: vi.fn(),
        isDebug: () => true,
      })

      onToolEnd("read_file", "200 lines", true)
      expect(safeUpdate).toHaveBeenCalledWith("✓ read_file")
    })

    it("onFailure called with x mark prefix on failure", async () => {
      const createToolActivityCallbacks = await loadModule()
      const onFailure = vi.fn()

      const { onToolEnd } = createToolActivityCallbacks({
        onDescription: vi.fn(),
        onResult: vi.fn(),
        onFailure,
        isDebug: () => true,
      })

      onToolEnd("shell", "exit code 1", false)
      expect(onFailure).toHaveBeenCalledWith("✗ shell — exit code 1")
    })
  })
})

describe("Teams createTeamsCallbacks - flushNow (speak tool)", () => {
  let mockStream: { emit: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
  let controller: AbortController

  beforeEach(() => {
    vi.resetModules()
    mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    controller = new AbortController()
  })

  it("exposes flushNow on the callbacks object", async () => {
    const teams = await import("../../senses/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    expect(typeof (callbacks as any).flushNow).toBe("function")
  })

  it("flushNow after onTextChunk emits buffered text via stream.emit exactly once", async () => {
    const teams = await import("../../senses/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onTextChunk("hello world this is enough chars")
    await (callbacks as any).flushNow()
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    expect(mockStream.emit.mock.calls[0][0]).toEqual(expect.objectContaining({
      text: "hello world this is enough chars",
    }))
  })

  it("falls back to sendMessage when stream.emit throws", async () => {
    const teams = await import("../../senses/teams")
    mockStream.emit = vi.fn(() => { throw new Error("stream dead") })
    const sendMessage = vi.fn(async () => {})
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, sendMessage)
    callbacks.onTextChunk("hello fallback")
    await (callbacks as any).flushNow()
    expect(sendMessage).toHaveBeenCalledWith("hello fallback")
  })

  it("clears the internal textBuffer after flushNow (subsequent flush does not re-send)", async () => {
    const teams = await import("../../senses/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onTextChunk("once")
    await (callbacks as any).flushNow()
    expect(mockStream.emit).toHaveBeenCalledTimes(1)
    // End-of-turn flush() should not resend the text — buffer is empty so it falls
    // through to the empty-stream fallback ("(completed with tool calls only ...)") path.
    mockStream.emit.mockClear()
    await callbacks.flush()
    // Either no call (if already had content emitted) or the fallback message — never the original text
    const emittedTexts = mockStream.emit.mock.calls.map((c: any) => c[0]?.text ?? "")
    expect(emittedTexts).not.toContain("once")
  })

  it("cancels any pending periodic flush timer after flushNow", async () => {
    vi.useFakeTimers()
    try {
      const teams = await import("../../senses/teams")
      const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
      callbacks.onTextChunk("hello world this is enough chars to emit")
      // Pending timer is now set. flushNow should clear it so the next timer tick
      // doesn't re-emit anything (because the buffer is also drained).
      await (callbacks as any).flushNow()
      expect(mockStream.emit).toHaveBeenCalledTimes(1)
      mockStream.emit.mockClear()
      vi.advanceTimersByTime(teams.DEFAULT_FLUSH_INTERVAL_MS * 3)
      expect(mockStream.emit).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("flushNow with empty buffer is a safe noop — no emit, no error", async () => {
    const teams = await import("../../senses/teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    await expect((callbacks as any).flushNow()).resolves.not.toThrow()
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("flushNow THROWS when stream.emit fails AND sendMessage also fails (hard delivery failure)", async () => {
    const teams = await import("../../senses/teams")
    mockStream.emit = vi.fn(() => { throw new Error("stream dead") })
    const sendMessage = vi.fn(async () => { throw new Error("sendMessage dead") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller, sendMessage)
    callbacks.onTextChunk("hello will fail")
    await expect((callbacks as any).flushNow()).rejects.toThrow(/teams.*delivery failed|sendMessage|stream/i)
  })

  it("flushNow THROWS when stream.emit fails AND no sendMessage fallback is wired", async () => {
    const teams = await import("../../senses/teams")
    mockStream.emit = vi.fn(() => { throw new Error("stream dead") })
    const callbacks = teams.createTeamsCallbacks(mockStream as any, controller)
    callbacks.onTextChunk("hello no fallback")
    await expect((callbacks as any).flushNow()).rejects.toThrow(/teams.*delivery failed|stream/i)
  })
})
