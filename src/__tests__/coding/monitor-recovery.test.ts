import { describe, expect, it, vi } from "vitest"

import { CodingSessionMonitor } from "../../coding/monitor"
import { formatCodingMonitorReport } from "../../coding/reporter"
import type { CodingSession } from "../../coding/types"

interface ManagerLike {
  checkStalls: (nowMs: number) => number
  listSessions: () => CodingSession[]
}

function session(overrides: Partial<CodingSession>): CodingSession {
  return {
    id: "coding-001",
    runner: "claude",
    subagent: "doer",
    workdir: "/Users/test/AgentWorkspaces/ouroboros",
    status: "running",
    pid: 100,
    startedAt: "2026-03-05T23:00:00.000Z",
    lastActivityAt: "2026-03-05T23:05:00.000Z",
    endedAt: null,
    restartCount: 0,
    lastExitCode: null,
    lastSignal: null,
    ...overrides,
  }
}

describe("coding monitor + recovery", () => {
  it("collects stall metrics and active session counts", () => {
    const manager: ManagerLike = {
      checkStalls: vi.fn(() => 1),
      listSessions: vi.fn(() => [
        session({ id: "coding-001", status: "stalled", restartCount: 1 }),
        session({ id: "coding-002", status: "running" }),
      ]),
    }

    const monitor = new CodingSessionMonitor({
      manager,
      nowMs: () => Date.parse("2026-03-05T23:10:00.000Z"),
    })

    const report = monitor.tick()
    expect(report.summary.active).toBe(2)
    expect(report.summary.stalled).toBe(1)
    expect(report.summary.restarts).toBe(1)
  })

  it("flags waiting_input sessions as blocked and exposes blocker ids", () => {
    const manager: ManagerLike = {
      checkStalls: vi.fn(() => 0),
      listSessions: vi.fn(() => [
        session({ id: "coding-010", status: "waiting_input" }),
        session({ id: "coding-011", status: "running" }),
      ]),
    }

    const monitor = new CodingSessionMonitor({ manager, nowMs: () => Date.parse("2026-03-05T23:10:00.000Z") })
    const report = monitor.tick()

    expect(report.summary.blocked).toBe(1)
    expect(report.blockedSessionIds).toEqual(["coding-010"])
  })

  it("records completion and exhausted-recovery crashes", () => {
    const manager: ManagerLike = {
      checkStalls: vi.fn(() => 0),
      listSessions: vi.fn(() => [
        session({ id: "coding-020", status: "completed", endedAt: "2026-03-05T23:12:00.000Z" }),
        session({ id: "coding-021", status: "failed", lastExitCode: 1, restartCount: 1 }),
      ]),
    }

    const monitor = new CodingSessionMonitor({ manager, nowMs: () => Date.parse("2026-03-05T23:13:00.000Z") })
    const report = monitor.tick()

    expect(report.summary.completed).toBe(1)
    expect(report.summary.failed).toBe(1)
    expect(report.recoveryActions).toContainEqual(
      expect.objectContaining({ sessionId: "coding-021", action: "manual_intervention_required" }),
    )
  })

  it("formats a monitor report with blockers and recovery guidance", () => {
    const text = formatCodingMonitorReport({
      at: "2026-03-05T23:13:00.000Z",
      summary: {
        active: 2,
        completed: 1,
        blocked: 1,
        stalled: 1,
        failed: 1,
        restarts: 2,
      },
      blockedSessionIds: ["coding-010"],
      stalledSessionIds: ["coding-011"],
      completedSessionIds: ["coding-012"],
      recoveryActions: [{ sessionId: "coding-011", action: "send_guidance", reason: "stalled" }],
    })

    expect(text).toContain("active=2")
    expect(text).toContain("blocked: coding-010")
    expect(text).toContain("recovery: coding-011 -> send_guidance")
  })

  it("formats a clean monitor report when no sessions are active", () => {
    const text = formatCodingMonitorReport({
      at: "2026-03-05T23:20:00.000Z",
      summary: {
        active: 0,
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
    })

    expect(text).toContain("no active coding sessions")
  })
})
