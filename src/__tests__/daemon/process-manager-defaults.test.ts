import { describe, expect, it, vi } from "vitest"
import { EventEmitter } from "events"

class MockChild extends EventEmitter {
  connected = true
  pid = 9876
  kill = vi.fn(() => {
    this.connected = false
    this.emit("exit", 0, null)
    return true
  })
}

describe("process manager default dependency wiring", () => {
  it("uses default spawn/identity wiring when optional deps are omitted", async () => {
    vi.resetModules()
    vi.useFakeTimers()

    const spawn = vi.fn(() => new MockChild())

    vi.doMock("child_process", () => ({ spawn }))
    vi.doMock("../../heart/identity", () => ({ getRepoRoot: () => "/mock/repo" }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    const { DaemonProcessManager } = await import("../../daemon/process-manager")

    const manager = new DaemonProcessManager({
      agents: [
        { name: "slugger", entry: "inner-worker-entry.js", channel: "cli", autoStart: true },
      ],
      initialBackoffMs: 5,
      maxBackoffMs: 10,
      maxRestartsPerHour: 1,
    })

    await manager.startAutoStartAgents()

    expect(spawn).toHaveBeenCalledWith(
      "node",
      ["/mock/repo/dist/inner-worker-entry.js", "--agent", "slugger"],
      expect.objectContaining({ cwd: "/mock/repo" }),
    )

    const first = spawn.mock.results[0]?.value as MockChild
    first.emit("exit", 1, null)

    await vi.advanceTimersByTimeAsync(5)
    expect(spawn).toHaveBeenCalledTimes(2)

    await manager.stopAgent("slugger")
    vi.useRealTimers()
  })
})
