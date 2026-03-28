import { describe, expect, it, vi } from "vitest"
import { emitNervesEvent } from "../../../nerves/runtime"

vi.mock("../../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

import {
  DaemonProcessManager,
  type DaemonManagedAgent,
} from "../../../heart/daemon/process-manager"
import { EventEmitter } from "events"

class MockChild extends EventEmitter {
  connected = true
  pid = 4321
  kill = vi.fn((_signal?: string) => {
    this.connected = false
    this.emit("exit", 0, null)
    return true
  })
  send = vi.fn((_message: unknown, _callback?: (error: Error | null) => void) => true)
}

describe("crash context in agent snapshots", () => {
  const spawn = vi.fn()
  const now = vi.fn()
  const timers: Array<{ delay: number; cb: () => void }> = []
  const setTimeoutFn = vi.fn((cb: () => void, delay: number) => {
    timers.push({ delay, cb })
    return timers.length
  })
  const clearTimeoutFn = vi.fn()
  const agents: DaemonManagedAgent[] = [
    { name: "slugger", entry: "heart/agent-entry.js", channel: "inner-dialog", autoStart: true },
  ]

  it("includes lastExitCode and lastSignal in listAgentSnapshots output", async () => {
    const child = new MockChild()
    spawn.mockReturnValue(child)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
    })

    await manager.startAgent("slugger")
    child.emit("exit", 1, "SIGKILL")

    const snapshots = manager.listAgentSnapshots()
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({
      name: "slugger",
      lastExitCode: 1,
      lastSignal: "SIGKILL",
    })
  })

  it("includes lastExitCode=null and lastSignal=null for agents that never exited", async () => {
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
    })

    const snapshots = manager.listAgentSnapshots()
    expect(snapshots[0]).toMatchObject({
      lastExitCode: null,
      lastSignal: null,
    })
  })

  it("tracks exit code without signal", async () => {
    const child = new MockChild()
    spawn.mockReturnValue(child)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
    })

    await manager.startAgent("slugger")
    child.emit("exit", 42, null)

    const snapshot = manager.getAgentSnapshot("slugger")
    expect(snapshot?.lastExitCode).toBe(42)
    expect(snapshot?.lastSignal).toBeNull()
  })

  it("reports nerves event for crash context via emitNervesEvent", async () => {
    const child = new MockChild()
    spawn.mockReturnValue(child)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
    })

    await manager.startAgent("slugger")
    child.emit("exit", 137, "SIGKILL")

    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "daemon.agent_exit",
        meta: expect.objectContaining({
          agent: "slugger",
          code: 137,
          signal: "SIGKILL",
          crashed: true,
        }),
      }),
    )
  })
})
