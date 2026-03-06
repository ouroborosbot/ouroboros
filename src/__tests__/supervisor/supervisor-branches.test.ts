import { beforeEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "events"

const mockFork = vi.fn()

vi.mock("child_process", () => ({
  fork: (...args: any[]) => mockFork(...args),
}))

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

import { AgentSupervisor } from "../../supervisor"
import { emitNervesEvent } from "../../nerves/runtime"

class MockChild extends EventEmitter {
  connected = true
  pid = 12345
  send = vi.fn()
  kill = vi.fn()
}

describe("AgentSupervisor branch coverage", () => {
  beforeEach(() => {
    mockFork.mockReset()
    vi.mocked(emitNervesEvent).mockReset()
    vi.useRealTimers()
  })

  it("returns immediately when stop() is called without an active child", async () => {
    const supervisor = new AgentSupervisor({ agent: "testagent", heartbeatMs: 10, restartBaseMs: 10 })
    await expect(supervisor.stop()).resolves.toBeUndefined()
  })

  it("does not spawn twice when start() is called while already running", async () => {
    const child = new MockChild()
    child.kill.mockImplementation(() => {
      child.emit("exit", 0, null)
    })
    mockFork.mockReturnValue(child)
    const supervisor = new AgentSupervisor({ agent: "testagent", heartbeatMs: 10, restartBaseMs: 10 })

    await supervisor.start()
    await supervisor.start()

    expect(mockFork).toHaveBeenCalledTimes(1)
    await supervisor.stop()
  })

  it("handles SIGTERM kill errors during shutdown", async () => {
    const child = new MockChild()
    child.kill.mockImplementation(() => {
      throw new Error("sigterm-failed")
    })
    mockFork.mockReset().mockReturnValue(child)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      heartbeatMs: 10,
      restartBaseMs: 10,
    })

    await supervisor.start()
    await expect(supervisor.stop()).resolves.toBeUndefined()
    child.emit("exit", 0, null)
  })

  it("handles send failures during shutdown", async () => {
    const child = new MockChild()
    child.send.mockImplementation(() => {
      throw new Error("send-failed")
    })
    child.kill.mockImplementation(() => {
      child.emit("exit", 0, null)
    })
    mockFork.mockReturnValue(child)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      heartbeatMs: 10,
      restartBaseMs: 10,
    })

    await supervisor.start()
    await expect(supervisor.stop()).resolves.toBeUndefined()
  })

  it("forces SIGKILL when child does not exit after SIGTERM", async () => {
    vi.useFakeTimers()
    const child = new MockChild()
    mockFork.mockReset().mockReturnValue(child)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      heartbeatMs: 10,
      restartBaseMs: 10,
    })

    await supervisor.start()
    const stopPromise = supervisor.stop()
    await vi.advanceTimersByTimeAsync(500)
    await stopPromise

    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
    expect(child.kill).toHaveBeenCalledWith("SIGKILL")
    vi.useRealTimers()
  })

  it("restarts crashed workers after backoff", async () => {
    vi.useFakeTimers()
    const first = new MockChild()
    const second = new MockChild()
    second.kill.mockImplementation(() => {
      second.emit("exit", 0, null)
    })
    mockFork.mockReturnValueOnce(first).mockReturnValueOnce(second)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      heartbeatMs: 10,
      restartBaseMs: 20,
      restartMaxMs: 20,
    })

    await supervisor.start()
    first.emit("exit", 1, null)
    expect(supervisor.getRestartCount()).toBe(1)
    expect(mockFork).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(20)
    expect(mockFork).toHaveBeenCalledTimes(2)

    await supervisor.stop()
    vi.useRealTimers()
  })

  it("heartbeat loop skips disconnected workers and tolerates send errors", async () => {
    vi.useFakeTimers()
    const child = new MockChild()
    child.connected = false
    child.kill.mockImplementation(() => {
      child.emit("exit", 0, null)
    })
    mockFork.mockReturnValue(child)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      heartbeatMs: 10,
      restartBaseMs: 10,
    })

    await supervisor.start()
    await vi.advanceTimersByTimeAsync(20)
    expect(child.send).not.toHaveBeenCalled()

    child.connected = true
    child.send.mockImplementation(() => {
      throw new Error("ipc-send-failed")
    })
    await vi.advanceTimersByTimeAsync(20)
    expect(child.send).toHaveBeenCalled()

    await supervisor.stop()
    vi.useRealTimers()
  })

  it("applies default heartbeat/restart timings when options are omitted", async () => {
    vi.useFakeTimers()
    const first = new MockChild()
    const second = new MockChild()
    second.kill.mockImplementation(() => {
      second.emit("exit", 0, null)
    })
    mockFork.mockReset().mockReturnValueOnce(first).mockReturnValueOnce(second)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      workerScript: "/tmp/fake-worker.js",
      workerArgs: [],
    })

    await supervisor.start()
    await vi.advanceTimersByTimeAsync(59_999)
    expect(first.send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(first.send).toHaveBeenCalled()

    first.emit("exit", 1, null)
    await vi.advanceTimersByTimeAsync(999)
    expect(mockFork).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mockFork).toHaveBeenCalledTimes(2)

    await supervisor.stop()
    vi.useRealTimers()
  })

  it("skips shutdown IPC send when child is disconnected", async () => {
    const child = new MockChild()
    child.connected = false
    child.kill.mockImplementation(() => {
      child.emit("exit", 0, null)
    })
    mockFork.mockReset().mockReturnValue(child)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      heartbeatMs: 10,
      restartBaseMs: 10,
    })

    await supervisor.start()
    await supervisor.stop()
    expect(child.send).not.toHaveBeenCalled()
  })

  it("does not force SIGKILL when child exits before timeout", async () => {
    vi.useFakeTimers()
    const child = new MockChild()
    child.kill.mockImplementation((signal?: string) => {
      if (signal === "SIGTERM") child.emit("exit", 0, null)
    })
    mockFork.mockReset().mockReturnValue(child)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      heartbeatMs: 10,
      restartBaseMs: 10,
    })

    await supervisor.start()
    const stopPromise = supervisor.stop()
    await stopPromise
    await vi.advanceTimersByTimeAsync(500)

    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
    expect(child.kill).not.toHaveBeenCalledWith("SIGKILL")
    vi.useRealTimers()
  })

  it("emits null pid metadata when worker pid is unavailable", async () => {
    const child = new MockChild()
    ;(child as any).pid = undefined
    child.kill.mockImplementation(() => {
      child.emit("exit", 0, null)
    })
    mockFork.mockReset().mockReturnValue(child)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      heartbeatMs: 10,
      restartBaseMs: 10,
    })

    await supervisor.start()
    await supervisor.stop()

    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "supervisor.worker_started",
        meta: expect.objectContaining({ pid: null }),
      }),
    )
    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "supervisor.worker_exit",
        meta: expect.objectContaining({ pid: null }),
      }),
    )
  })

  it("skips respawn when shuttingDown is true inside restart timer", async () => {
    vi.useFakeTimers()
    const child = new MockChild()
    mockFork.mockReset().mockReturnValue(child)

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      heartbeatMs: 10,
      restartBaseMs: 20,
      restartMaxMs: 20,
    })

    await supervisor.start()
    child.emit("exit", 1, null)
    ;(supervisor as any).shuttingDown = true
    await vi.advanceTimersByTimeAsync(20)

    expect(mockFork).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
