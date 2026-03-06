import type { CodingMonitorReport } from "./monitor"
import { formatCodingMonitorReport } from "./reporter"
import type { CodingRunner } from "./types"

type PipelineSubagent = "planner" | "doer" | "merger"

interface PipelineManagerLike {
  spawnSession: (request: {
    runner: CodingRunner
    subagent: PipelineSubagent
    workdir: string
    prompt: string
    taskRef?: string
  }) => Promise<{ id: string; status: string }>
  sendInput: (sessionId: string, input: string) => unknown
}

interface PipelineMonitorLike {
  tick: () => CodingMonitorReport
}

export interface RunCodingPipelineOptions {
  runner: CodingRunner
  workdir: string
  taskRef?: string
  plannerPrompt: string
  doerPrompt: string
  mergerPrompt: string
  manager: PipelineManagerLike
  monitor: PipelineMonitorLike
  onReport?: (text: string, report: CodingMonitorReport) => void
}

export interface RunCodingPipelineResult {
  plannerSessionId: string
  doerSessionId: string
  mergerSessionId: string
}

function guidanceMessage(taskRef?: string): string {
  const prefix = taskRef ? `Task ${taskRef}: ` : ""
  return `${prefix}status: NEEDS_REVIEW detected. Please summarize blocker and next concrete action, then continue.`
}

function emitReport(
  monitor: PipelineMonitorLike,
  manager: PipelineManagerLike,
  onReport: RunCodingPipelineOptions["onReport"],
  taskRef?: string,
): void {
  const snapshot = monitor.tick()
  const text = formatCodingMonitorReport(snapshot)
  onReport?.(text, snapshot)

  for (const blockedSessionId of snapshot.blockedSessionIds) {
    manager.sendInput(blockedSessionId, guidanceMessage(taskRef))
  }
}

async function spawnStage(
  manager: PipelineManagerLike,
  runner: CodingRunner,
  subagent: PipelineSubagent,
  workdir: string,
  prompt: string,
  taskRef?: string,
): Promise<string> {
  const session = await manager.spawnSession({
    runner,
    subagent,
    workdir,
    prompt,
    taskRef,
  })
  return session.id
}

export async function runCodingPipeline(options: RunCodingPipelineOptions): Promise<RunCodingPipelineResult> {
  const plannerSessionId = await spawnStage(
    options.manager,
    options.runner,
    "planner",
    options.workdir,
    options.plannerPrompt,
    options.taskRef,
  )
  emitReport(options.monitor, options.manager, options.onReport, options.taskRef)

  const doerSessionId = await spawnStage(
    options.manager,
    options.runner,
    "doer",
    options.workdir,
    options.doerPrompt,
    options.taskRef,
  )
  emitReport(options.monitor, options.manager, options.onReport, options.taskRef)

  const mergerSessionId = await spawnStage(
    options.manager,
    options.runner,
    "merger",
    options.workdir,
    options.mergerPrompt,
    options.taskRef,
  )
  emitReport(options.monitor, options.manager, options.onReport, options.taskRef)

  return {
    plannerSessionId,
    doerSessionId,
    mergerSessionId,
  }
}
