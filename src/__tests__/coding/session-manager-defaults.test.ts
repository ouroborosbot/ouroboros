import { describe, expect, it, vi } from "vitest"

class FakeProcess {
  readonly pid: number | undefined
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

  constructor(pid?: number) {
    this.pid = pid
  }
}

describe("coding session manager defaults", () => {
  it("uses default spawnCodingProcess wiring when spawnProcess override is omitted", async () => {
    vi.resetModules()

    const fake = new FakeProcess(123)
    const spawnCodingProcess = vi.fn(() => ({
      process: fake,
      command: "claude",
      args: ["-p"],
      prompt: "hello",
    }))

    vi.doMock("../../coding/spawner", () => ({
      spawnCodingProcess,
    }))

    const { CodingSessionManager } = await import("../../coding/manager")
    const manager = new CodingSessionManager({
      nowIso: () => "2026-03-05T23:50:00.000Z",
    })

    const session = await manager.spawnSession({
      runner: "claude",
      subagent: "doer",
      workdir: "/Users/test/AgentWorkspaces/ouroboros",
      prompt: "do it",
    })

    expect(session.pid).toBe(123)
    expect(spawnCodingProcess).toHaveBeenCalledWith(
      expect.objectContaining({ runner: "claude", subagent: "doer" }),
    )
  })
})
