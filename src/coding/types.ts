export type CodingRunner = "claude" | "codex"

export type CodingSubagent = "planner" | "doer" | "merger"

export type CodingSessionStatus =
  | "spawning"
  | "running"
  | "waiting_input"
  | "completed"
  | "failed"
  | "stalled"
  | "killed"

export interface CodingSessionRequest {
  runner: CodingRunner
  subagent: CodingSubagent
  workdir: string
  prompt: string
  taskRef?: string
  scopeFile?: string
  stateFile?: string
  autoRestartOnCrash?: boolean
  autoRestartOnStall?: boolean
  stallThresholdMs?: number
}

export interface CodingSession {
  id: string
  runner: CodingRunner
  subagent: CodingSubagent
  workdir: string
  taskRef?: string
  scopeFile?: string
  stateFile?: string
  status: CodingSessionStatus
  pid: number | null
  startedAt: string
  lastActivityAt: string
  endedAt: string | null
  restartCount: number
  lastExitCode: number | null
  lastSignal: NodeJS.Signals | null
}

export interface CodingActionResult {
  ok: boolean
  message: string
}
