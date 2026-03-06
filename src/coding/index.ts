import { emitNervesEvent } from "../nerves/runtime"
import { CodingSessionManager } from "./manager"

let manager: CodingSessionManager | null = null

export function getCodingSessionManager(): CodingSessionManager {
  if (!manager) {
    manager = new CodingSessionManager({})
    emitNervesEvent({
      component: "repertoire",
      event: "repertoire.coding_manager_init",
      message: "initialized coding session manager singleton",
      meta: {},
    })
  }
  return manager
}

export function resetCodingSessionManager(): void {
  manager?.shutdown()
  manager = null
  emitNervesEvent({
    component: "repertoire",
    event: "repertoire.coding_manager_reset",
    message: "reset coding session manager singleton",
    meta: {},
  })
}

export { CodingSessionManager } from "./manager"
export type { CodingActionResult, CodingRunner, CodingSession, CodingSessionRequest, CodingSessionStatus, CodingSubagent } from "./types"
export { CodingSessionMonitor } from "./monitor"
export type { CodingMonitorReport, CodingMonitorSummary, CodingRecoveryAction, CodingRecoveryActionType } from "./monitor"
export { formatCodingMonitorReport } from "./reporter"
export { runCodingPipeline } from "./pipeline"
export type { RunCodingPipelineOptions, RunCodingPipelineResult } from "./pipeline"
