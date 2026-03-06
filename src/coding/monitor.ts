import type { CodingSession } from "./types"

export type CodingRecoveryActionType = "send_guidance" | "manual_intervention_required"

export interface CodingRecoveryAction {
  sessionId: string
  action: CodingRecoveryActionType
  reason: "waiting_input" | "stalled" | "failed"
}

export interface CodingMonitorSummary {
  active: number
  completed: number
  blocked: number
  stalled: number
  failed: number
  restarts: number
}

export interface CodingMonitorReport {
  at: string
  summary: CodingMonitorSummary
  blockedSessionIds: string[]
  stalledSessionIds: string[]
  completedSessionIds: string[]
  recoveryActions: CodingRecoveryAction[]
}

interface CodingMonitorManagerLike {
  checkStalls: (nowMs: number) => number
  listSessions: () => CodingSession[]
}

export interface CodingSessionMonitorOptions {
  manager: CodingMonitorManagerLike
  nowMs?: () => number
}

export class CodingSessionMonitor {
  private readonly manager: CodingMonitorManagerLike
  private readonly nowMs: () => number

  constructor(options: CodingSessionMonitorOptions) {
    this.manager = options.manager
    this.nowMs = options.nowMs ?? Date.now
  }

  tick(): CodingMonitorReport {
    const now = this.nowMs()
    const detectedStalls = this.manager.checkStalls(now)
    const sessions = this.manager.listSessions()

    const blockedSessionIds = sessions.filter((session) => session.status === "waiting_input").map((session) => session.id)
    const stalledSessionIds = sessions.filter((session) => session.status === "stalled").map((session) => session.id)
    const completedSessionIds = sessions.filter((session) => session.status === "completed").map((session) => session.id)
    const failedSessionIds = sessions.filter((session) => session.status === "failed").map((session) => session.id)
    const restarts = sessions.reduce((sum, session) => sum + session.restartCount, 0)

    const recoveryActions: CodingRecoveryAction[] = []
    for (const sessionId of blockedSessionIds) {
      recoveryActions.push({ sessionId, action: "send_guidance", reason: "waiting_input" })
    }
    for (const sessionId of stalledSessionIds) {
      recoveryActions.push({ sessionId, action: "send_guidance", reason: "stalled" })
    }
    for (const sessionId of failedSessionIds) {
      recoveryActions.push({ sessionId, action: "manual_intervention_required", reason: "failed" })
    }

    return {
      at: new Date(now).toISOString(),
      summary: {
        active: sessions.length,
        completed: completedSessionIds.length,
        blocked: blockedSessionIds.length,
        stalled: Math.max(stalledSessionIds.length, detectedStalls),
        failed: failedSessionIds.length,
        restarts,
      },
      blockedSessionIds,
      stalledSessionIds,
      completedSessionIds,
      recoveryActions,
    }
  }
}
