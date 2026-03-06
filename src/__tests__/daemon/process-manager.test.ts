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
})
