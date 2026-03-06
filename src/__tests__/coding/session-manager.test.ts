import { describe, expect, it, vi } from "vitest"

import { CodingSessionManager } from "../../coding/manager"

class FakeProcess {
  readonly pid: number
  readonly stdin = {
    write: vi.fn(),
  }
  readonly stdout = {
    on: vi.fn(),
  }
  readonly stderr = {
    on: vi.fn(),
  }
  readonly on = vi.fn()
  readonly kill = vi.fn(() => true)

  constructor(pid: number) {
    this.pid = pid
  }
}

describe("coding session manager", () => {
  it("spawns and tracks coding sessions", async () => {
    const spawn = vi.fn(() => new FakeProcess(4312))
    const manager = new CodingSessionManager({
      spawnProcess: spawn,
      nowIso: () => "2026-03-05T23:40:00.000Z",
    })

    const session = await manager.spawnSession({
      runner: "claude",
      subagent: "doer",
      workdir: "/Users/test/AgentWorkspaces/ouroboros",
      prompt: "execute the doing doc",
      taskRef: "task-123",
    })

    expect(session.id).toBe("coding-001")
    expect(session.status).toBe("running")
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(manager.listSessions()).toHaveLength(1)
  })

  it("kills tracked sessions and marks them as killed", async () => {
    const proc = new FakeProcess(222)
    const manager = new CodingSessionManager({
      spawnProcess: vi.fn(() => proc),
      nowIso: () => "2026-03-05T23:41:00.000Z",
    })

    const session = await manager.spawnSession({
      runner: "claude",
      subagent: "planner",
      workdir: "/Users/test/AgentWorkspaces/slugger",
      prompt: "plan this task",
      taskRef: "task-456",
    })

    const result = manager.killSession(session.id)
    expect(result.ok).toBe(true)
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM")
    expect(manager.getSession(session.id)?.status).toBe("killed")
  })

  it("returns an error when sending input to an unknown session", () => {
    const manager = new CodingSessionManager({
      spawnProcess: vi.fn(() => new FakeProcess(1)),
      nowIso: () => "2026-03-05T23:42:00.000Z",
    })

    const result = manager.sendInput("coding-404", "continue")
    expect(result.ok).toBe(false)
    expect(result.message).toContain("not found")
  })

  it("rejects workdirs outside managed AgentWorkspaces clones", async () => {
    const manager = new CodingSessionManager({
      spawnProcess: vi.fn(() => new FakeProcess(9)),
      nowIso: () => "2026-03-05T23:43:00.000Z",
    })

    await expect(
      manager.spawnSession({
        runner: "codex",
        subagent: "doer",
        workdir: "/tmp/unsafe-workdir",
        prompt: "do work",
      }),
    ).rejects.toThrow(/AgentWorkspaces/)
  })
})
