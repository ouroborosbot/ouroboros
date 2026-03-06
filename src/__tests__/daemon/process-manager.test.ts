import { beforeEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "events"

import {
  DaemonProcessManager,
  type DaemonManagedAgent,
} from "../../daemon/process-manager"
import { ensureAgentWorkspace, workspacePathForAgent } from "../../daemon/workspaces"

class MockChild extends EventEmitter {
  connected = true
  pid = 4321
  kill = vi.fn((_signal?: string) => {
    this.connected = false
    this.emit("exit", 0, null)
    return true
  })
}

describe("workspace isolation", () => {
  const mkdirSync = vi.fn()
  const existsSync = vi.fn()
  const execSync = vi.fn()

  beforeEach(() => {
    mkdirSync.mockReset()
    existsSync.mockReset()
    execSync.mockReset()
  })

  it("resolves workspace path under ~/AgentWorkspaces/<agent>", () => {
    expect(workspacePathForAgent("slugger", "/Users/test")).toBe("/Users/test/AgentWorkspaces/slugger")
  })

  it("clones a workspace when missing", () => {
    existsSync.mockReturnValue(false)
    const result = ensureAgentWorkspace("slugger", {
      branch: "main",
      homeDir: "/Users/test",
      deps: {
        existsSync,
        mkdirSync,
        execSync,
        getOriginUrl: () => "https://github.com/ouroborosbot/ouroboros",
      },
    })

    expect(result.created).toBe(true)
    expect(result.updated).toBe(false)
    expect(result.workspacePath).toBe("/Users/test/AgentWorkspaces/slugger")
    expect(mkdirSync).toHaveBeenCalledWith("/Users/test/AgentWorkspaces", { recursive: true })
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("git clone --branch main https://github.com/ouroborosbot/ouroboros /Users/test/AgentWorkspaces/slugger"),
      expect.objectContaining({ encoding: "utf-8" }),
    )
  })

  it("fetches and fast-forwards existing workspace", () => {
    existsSync.mockReturnValue(true)
    const result = ensureAgentWorkspace("ouroboros", {
      homeDir: "/Users/test",
      deps: {
        existsSync,
        mkdirSync,
        execSync,
        getOriginUrl: () => "https://github.com/ouroborosbot/ouroboros",
      },
    })

    expect(result.created).toBe(false)
    expect(result.updated).toBe(true)
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("git -C /Users/test/AgentWorkspaces/ouroboros fetch origin main"),
      expect.objectContaining({ encoding: "utf-8" }),
    )
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("git -C /Users/test/AgentWorkspaces/ouroboros pull --ff-only origin main"),
      expect.objectContaining({ encoding: "utf-8" }),
    )
  })
})

describe("daemon process manager", () => {
  const spawn = vi.fn()
  const now = vi.fn()
  const timers: Array<{ delay: number; cb: () => void }> = []

  const setTimeoutFn = vi.fn((cb: () => void, delay: number) => {
    timers.push({ delay, cb })
    return timers.length
  })
  const clearTimeoutFn = vi.fn()

  const ensureWorkspace = vi.fn(() => ({
    workspacePath: "/Users/test/AgentWorkspaces/slugger",
    created: false,
    updated: true,
  }))

const agents: DaemonManagedAgent[] = [
  { name: "slugger", entry: "inner-worker-entry.js", channel: "cli", autoStart: true },
  { name: "ouroboros", entry: "inner-worker-entry.js", channel: "cli", autoStart: false },
]

  beforeEach(() => {
    spawn.mockReset()
    now.mockReset()
    setTimeoutFn.mockClear()
    clearTimeoutFn.mockReset()
    ensureWorkspace.mockReset().mockReturnValue({
      workspacePath: "/Users/test/AgentWorkspaces/slugger",
      created: false,
      updated: true,
    })
    timers.length = 0
  })

  it("starts only autoStart agents on boot", async () => {
    const child = new MockChild()
    spawn.mockReturnValue(child)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
    })

    await manager.startAutoStartAgents()

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith(
      "node",
      [expect.stringContaining("inner-worker-entry.js"), "--agent", "slugger"],
      expect.objectContaining({ cwd: "/Users/test/AgentWorkspaces/slugger" }),
    )
    expect(manager.getAgentSnapshot("slugger")?.status).toBe("running")
    expect(manager.getAgentSnapshot("ouroboros")?.status).toBe("stopped")
  })

  it("restarts crashed agents with exponential backoff", async () => {
    const first = new MockChild()
    const second = new MockChild()
    spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
      initialBackoffMs: 250,
      maxBackoffMs: 2_000,
    })

    await manager.startAgent("slugger")
    first.emit("exit", 1, null)

    expect(timers[0]?.delay).toBe(250)

    timers[0]?.cb()
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it("stops restarting after max restarts per hour", async () => {
    const first = new MockChild()
    spawn.mockReturnValue(first)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
      maxRestartsPerHour: 0,
    })

    await manager.startAgent("slugger")
    first.emit("exit", 1, null)

    expect(manager.getAgentSnapshot("slugger")?.status).toBe("crashed")
    expect(timers).toHaveLength(0)
  })

  it("supports explicit stop and restart", async () => {
    const first = new MockChild()
    const second = new MockChild()
    spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
    })

    await manager.startAgent("slugger")
    await manager.restartAgent("slugger")

    expect(first.kill).toHaveBeenCalledWith("SIGTERM")
    expect(spawn).toHaveBeenCalledTimes(2)

    await manager.stopAgent("slugger")
    expect(manager.getAgentSnapshot("slugger")?.status).toBe("stopped")
  })

  it("lists snapshots and stops all managed agents", async () => {
    const child = new MockChild()
    spawn.mockReturnValue(child)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
    })

    await manager.startAgent("slugger")
    expect(manager.listAgentSnapshots().map((snapshot) => snapshot.name)).toEqual(["slugger", "ouroboros"])

    await manager.stopAll()
    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
    expect(manager.getAgentSnapshot("slugger")?.status).toBe("stopped")
  })

  it("resets backoff after a stable graceful run", async () => {
    const first = new MockChild()
    const second = new MockChild()
    spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    now.mockReturnValue(0)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
      initialBackoffMs: 100,
      maxBackoffMs: 1_000,
      stabilityThresholdMs: 10,
    })

    await manager.startAgent("slugger")
    first.emit("exit", 1, null)
    expect(manager.getAgentSnapshot("slugger")?.backoffMs).toBe(200)

    now.mockReturnValue(20)
    timers[0]?.cb()
    now.mockReturnValue(40)
    second.emit("exit", 0, null)

    expect(manager.getAgentSnapshot("slugger")?.status).toBe("stopped")
    expect(manager.getAgentSnapshot("slugger")?.backoffMs).toBe(100)
  })

  it("warns and continues when stopAgent kill throws", async () => {
    const child = new MockChild()
    child.kill.mockImplementation(() => {
      throw new Error("kill-failed")
    })
    spawn.mockReturnValue(child)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
    })

    await manager.startAgent("slugger")
    await manager.stopAgent("slugger")

    expect(manager.getAgentSnapshot("slugger")?.status).toBe("stopped")
  })

  it("clears scheduled restart timers before manual restarts", async () => {
    const first = new MockChild()
    const second = new MockChild()
    spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
      initialBackoffMs: 30,
      maxBackoffMs: 30,
    })

    await manager.startAgent("slugger")
    first.emit("exit", 1, null)
    await manager.startAgent("slugger")

    expect(clearTimeoutFn).toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it("throws for unknown managed agents", async () => {
    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
    })

    await expect(manager.startAgent("ghost")).rejects.toThrow("Unknown managed agent 'ghost'.")
  })

  it("does not spawn again when startAgent is called while already running", async () => {
    const child = new MockChild()
    spawn.mockReturnValue(child)
    now.mockReturnValue(1_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
    })

    await manager.startAgent("slugger")
    await manager.startAgent("slugger")

    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it("passes custom env to spawned process and normalizes missing pid to null", async () => {
    const pidlessChild = new MockChild()
    ;(pidlessChild as any).pid = undefined
    spawn.mockReturnValue(pidlessChild)
    now.mockReturnValue(1_000)

    const envAgents: DaemonManagedAgent[] = [
      { name: "slugger", entry: "inner-worker-entry.js", channel: "cli", autoStart: true, env: { TEST_FLAG: "1" } },
    ]

    const manager = new DaemonProcessManager({
      agents: envAgents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
    })

    await manager.startAgent("slugger")

    expect(spawn).toHaveBeenCalledWith(
      "node",
      [expect.stringContaining("inner-worker-entry.js"), "--agent", "slugger"],
      expect.objectContaining({
        env: expect.objectContaining({ TEST_FLAG: "1" }),
      }),
    )
    expect(manager.getAgentSnapshot("slugger")?.pid).toBeNull()
  })

  it("keeps increased backoff after short graceful exits and handles null startedAt", async () => {
    const first = new MockChild()
    const second = new MockChild()
    spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    now.mockReturnValue(0)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
      initialBackoffMs: 100,
      maxBackoffMs: 1_000,
      stabilityThresholdMs: 10,
    })

    await manager.startAgent("slugger")
    first.emit("exit", 1, null)
    expect(manager.getAgentSnapshot("slugger")?.backoffMs).toBe(200)

    timers[0]?.cb()
    const snapshot = manager.getAgentSnapshot("slugger")
    if (!snapshot) throw new Error("missing slugger snapshot")
    snapshot.startedAt = null
    now.mockReturnValue(3)
    second.emit("exit", 0, null)

    expect(manager.getAgentSnapshot("slugger")?.status).toBe("stopped")
    expect(manager.getAgentSnapshot("slugger")?.backoffMs).toBe(200)
  })

  it("prunes restart history outside the one-hour window", async () => {
    const first = new MockChild()
    const second = new MockChild()
    const third = new MockChild()
    spawn.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third)

    const nowValues = [0, 0, 0, 3_700_000, 3_700_000]
    now.mockImplementation(() => nowValues.shift() ?? 3_700_000)

    const manager = new DaemonProcessManager({
      agents,
      spawn,
      now,
      setTimeoutFn,
      clearTimeoutFn,
      ensureWorkspace,
      maxRestartsPerHour: 1,
      initialBackoffMs: 10,
      maxBackoffMs: 10,
    })

    await manager.startAgent("slugger")
    first.emit("exit", 1, null)
    timers[0]?.cb()

    second.emit("exit", 1, null)
    expect(manager.getAgentSnapshot("slugger")?.status).toBe("starting")
    expect(manager.getAgentSnapshot("slugger")?.restartCount).toBe(2)
  })
})
