import { describe, expect, it, vi } from "vitest"

import type { CodingMonitorReport } from "../../coding/monitor"
import { runCodingPipeline } from "../../coding/pipeline"

function report(overrides: Partial<CodingMonitorReport>): CodingMonitorReport {
  return {
    at: "2026-03-05T23:58:00.000Z",
    summary: {
      active: 1,
      completed: 0,
      blocked: 0,
      stalled: 0,
      failed: 0,
      restarts: 0,
    },
    blockedSessionIds: [],
    stalledSessionIds: [],
    completedSessionIds: [],
    recoveryActions: [],
    ...overrides,
  }
}

describe("coding pipeline integration", () => {
  it("orchestrates planner -> doer -> merger and emits monitor reports", async () => {
    const manager = {
      spawnSession: vi
        .fn()
        .mockResolvedValueOnce({ id: "coding-001", status: "running" })
        .mockResolvedValueOnce({ id: "coding-002", status: "running" })
        .mockResolvedValueOnce({ id: "coding-003", status: "running" }),
      sendInput: vi.fn(),
    }

    const monitor = {
      tick: vi
        .fn()
        .mockReturnValueOnce(report({ at: "2026-03-05T23:58:01.000Z" }))
        .mockReturnValueOnce(report({ at: "2026-03-05T23:58:02.000Z" }))
        .mockReturnValueOnce(report({ at: "2026-03-05T23:58:03.000Z", summary: { active: 0, completed: 3, blocked: 0, stalled: 0, failed: 0, restarts: 0 } })),
    }

    const onReport = vi.fn()

    const result = await runCodingPipeline({
      runner: "claude",
      workdir: "/Users/test/AgentWorkspaces/ouroboros",
      taskRef: "task-500",
      plannerPrompt: "plan it",
      doerPrompt: "implement it",
      mergerPrompt: "merge it",
      manager,
      monitor,
      onReport,
    })

    expect(manager.spawnSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ subagent: "planner", prompt: "plan it" }),
    )
    expect(manager.spawnSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ subagent: "doer", prompt: "implement it" }),
    )
    expect(manager.spawnSession).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ subagent: "merger", prompt: "merge it" }),
    )

    expect(monitor.tick).toHaveBeenCalledTimes(3)
    expect(onReport).toHaveBeenCalledTimes(3)
    expect(result).toEqual({
      plannerSessionId: "coding-001",
      doerSessionId: "coding-002",
      mergerSessionId: "coding-003",
    })
  })

  it("sends recovery guidance when monitor reports blocked sessions", async () => {
    const manager = {
      spawnSession: vi
        .fn()
        .mockResolvedValueOnce({ id: "coding-011", status: "running" })
        .mockResolvedValueOnce({ id: "coding-012", status: "running" })
        .mockResolvedValueOnce({ id: "coding-013", status: "running" }),
      sendInput: vi.fn(),
    }

    const monitor = {
      tick: vi
        .fn()
        .mockReturnValueOnce(
          report({
            summary: {
              active: 1,
              completed: 0,
              blocked: 1,
              stalled: 0,
              failed: 0,
              restarts: 0,
            },
            blockedSessionIds: ["coding-011"],
          }),
        )
        .mockReturnValueOnce(report({ blockedSessionIds: [], summary: { active: 1, completed: 1, blocked: 0, stalled: 0, failed: 0, restarts: 0 } }))
        .mockReturnValueOnce(report({ blockedSessionIds: [], summary: { active: 0, completed: 3, blocked: 0, stalled: 0, failed: 0, restarts: 0 } })),
    }

    await runCodingPipeline({
      runner: "codex",
      workdir: "/Users/test/AgentWorkspaces/slugger",
      taskRef: "task-777",
      plannerPrompt: "plan",
      doerPrompt: "do",
      mergerPrompt: "merge",
      manager,
      monitor,
    })

    expect(manager.sendInput).toHaveBeenCalledWith("coding-011", expect.stringContaining("status: NEEDS_REVIEW"))
  })
})
