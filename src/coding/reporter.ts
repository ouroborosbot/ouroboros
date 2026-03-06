import { emitNervesEvent } from "../nerves/runtime"
import type { CodingMonitorReport } from "./monitor"

export function formatCodingMonitorReport(report: CodingMonitorReport): string {
  const lines: string[] = []
  lines.push(`coding-monitor at=${report.at}`)
  lines.push(
    [
      `active=${report.summary.active}`,
      `completed=${report.summary.completed}`,
      `blocked=${report.summary.blocked}`,
      `stalled=${report.summary.stalled}`,
      `failed=${report.summary.failed}`,
      `restarts=${report.summary.restarts}`,
    ].join(" "),
  )

  if (report.summary.active === 0) {
    lines.push("no active coding sessions")
    emitNervesEvent({
      component: "repertoire",
      event: "repertoire.coding_monitor_report",
      message: "formatted coding monitor report",
      meta: { active: report.summary.active, lineCount: lines.length },
    })
    return lines.join("\n")
  }

  if (report.blockedSessionIds.length > 0) {
    lines.push(`blocked: ${report.blockedSessionIds.join(",")}`)
  }
  if (report.stalledSessionIds.length > 0) {
    lines.push(`stalled: ${report.stalledSessionIds.join(",")}`)
  }
  if (report.completedSessionIds.length > 0) {
    lines.push(`completed: ${report.completedSessionIds.join(",")}`)
  }

  for (const action of report.recoveryActions) {
    lines.push(`recovery: ${action.sessionId} -> ${action.action} (${action.reason})`)
  }

  emitNervesEvent({
    component: "repertoire",
    event: "repertoire.coding_monitor_report",
    message: "formatted coding monitor report",
    meta: { active: report.summary.active, lineCount: lines.length },
  })

  return lines.join("\n")
}
