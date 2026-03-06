import { emitNervesEvent } from "../nerves/runtime"
import { spawnCodingProcess, type CodingProcess } from "./spawner"
import type { CodingActionResult, CodingSession, CodingSessionRequest } from "./types"

interface CodingSessionRecord {
  request: CodingSessionRequest
  session: CodingSession
  process: CodingProcess | null
}

export interface CodingSessionManagerOptions {
  spawnProcess?: (request: CodingSessionRequest) => CodingProcess
  nowIso?: () => string
  isManagedWorkdir?: (workdir: string) => boolean
  maxRestarts?: number
  defaultStallThresholdMs?: number
}

function isDefaultManagedWorkdir(workdir: string): boolean {
  return workdir.includes("AgentWorkspaces")
}

function cloneSession(session: CodingSession): CodingSession {
  return {
    ...session,
  }
}

export class CodingSessionManager {
  private readonly records = new Map<string, CodingSessionRecord>()
  private readonly spawnProcess: (request: CodingSessionRequest) => CodingProcess
  private readonly nowIso: () => string
  private readonly isManagedWorkdir: (workdir: string) => boolean
  private readonly maxRestarts: number
  private readonly defaultStallThresholdMs: number
  private sequence = 0

  constructor(options: CodingSessionManagerOptions) {
    this.spawnProcess = options.spawnProcess ?? ((request) => spawnCodingProcess(request).process)
    this.nowIso = options.nowIso ?? (() => new Date().toISOString())
    this.isManagedWorkdir = options.isManagedWorkdir ?? isDefaultManagedWorkdir
    this.maxRestarts = options.maxRestarts ?? 1
    this.defaultStallThresholdMs = options.defaultStallThresholdMs ?? 5 * 60_000
  }

  async spawnSession(request: CodingSessionRequest): Promise<CodingSession> {
    if (!this.isManagedWorkdir(request.workdir)) {
      throw new Error(`workdir must be under AgentWorkspaces: ${request.workdir}`)
    }

    this.sequence += 1
    const id = `coding-${String(this.sequence).padStart(3, "0")}`
    const now = this.nowIso()
    const session: CodingSession = {
      id,
      runner: request.runner,
      subagent: request.subagent,
      workdir: request.workdir,
      taskRef: request.taskRef,
      scopeFile: request.scopeFile,
      stateFile: request.stateFile,
      status: "spawning",
      pid: null,
      startedAt: now,
      lastActivityAt: now,
      endedAt: null,
      restartCount: 0,
      lastExitCode: null,
      lastSignal: null,
    }

    const process = this.spawnProcess(request)
    session.pid = process.pid ?? null
    session.status = "running"

    const record: CodingSessionRecord = {
      request,
      session,
      process,
    }
    this.records.set(id, record)

    this.attachProcessListeners(record)

    emitNervesEvent({
      component: "repertoire",
      event: "repertoire.coding_session_spawned",
      message: "coding session spawned",
      meta: { id, runner: request.runner, subagent: request.subagent, pid: session.pid },
    })

    return cloneSession(session)
  }

  listSessions(): CodingSession[] {
    return [...this.records.values()]
      .map((record) => cloneSession(record.session))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  getSession(sessionId: string): CodingSession | null {
    const record = this.records.get(sessionId)
    return record ? cloneSession(record.session) : null
  }

  sendInput(sessionId: string, input: string): CodingActionResult {
    const record = this.records.get(sessionId)
    if (!record || !record.process) {
      return { ok: false, message: `session not found: ${sessionId}` }
    }

    record.process.stdin.write(`${input}\n`)
    record.session.lastActivityAt = this.nowIso()
    if (record.session.status === "waiting_input" || record.session.status === "stalled") {
      record.session.status = "running"
    }

    emitNervesEvent({
      component: "repertoire",
      event: "repertoire.coding_session_input",
      message: "forwarded input to coding session",
      meta: { id: sessionId },
    })

    return { ok: true, message: `input sent to ${sessionId}` }
  }

  killSession(sessionId: string): CodingActionResult {
    const record = this.records.get(sessionId)
    if (!record || !record.process) {
      return { ok: false, message: `session not found: ${sessionId}` }
    }

    record.process.kill("SIGTERM")
    record.process = null
    record.session.status = "killed"
    record.session.endedAt = this.nowIso()

    emitNervesEvent({
      component: "repertoire",
      event: "repertoire.coding_session_killed",
      message: "coding session terminated",
      meta: { id: sessionId },
    })

    return { ok: true, message: `killed ${sessionId}` }
  }

  checkStalls(nowMs = Date.now()): number {
    let stalled = 0
    for (const record of this.records.values()) {
      if (record.session.status !== "running") continue
      const threshold = record.request.stallThresholdMs ?? this.defaultStallThresholdMs
      const elapsed = nowMs - Date.parse(record.session.lastActivityAt)
      if (elapsed <= threshold) continue

      stalled += 1
      record.session.status = "stalled"

      emitNervesEvent({
        level: "warn",
        component: "repertoire",
        event: "repertoire.coding_session_stalled",
        message: "coding session stalled",
        meta: { id: record.session.id, elapsedMs: elapsed },
      })

      if (record.request.autoRestartOnStall !== false && record.session.restartCount < this.maxRestarts) {
        this.restartSession(record, "stalled")
      }
    }
    return stalled
  }

  shutdown(): void {
    for (const record of this.records.values()) {
      if (!record.process) continue
      record.process.kill("SIGTERM")
      record.process = null
      if (record.session.status === "running" || record.session.status === "spawning") {
        record.session.status = "killed"
        record.session.endedAt = this.nowIso()
      }
    }

    emitNervesEvent({
      component: "repertoire",
      event: "repertoire.coding_manager_shutdown",
      message: "coding session manager shutdown complete",
      meta: { sessionCount: this.records.size },
    })
  }

  private attachProcessListeners(record: CodingSessionRecord): void {
    if (!record.process) return

    record.process.stdout.on("data", (chunk: Buffer | string) => {
      this.onOutput(record, chunk.toString())
    })
    record.process.stderr.on("data", (chunk: Buffer | string) => {
      this.onOutput(record, chunk.toString())
    })
    record.process.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      this.onExit(record, code, signal)
    })
  }

  private onOutput(record: CodingSessionRecord, text: string): void {
    record.session.lastActivityAt = this.nowIso()

    if (text.includes("status: NEEDS_REVIEW") || text.includes("❌ blocked")) {
      record.session.status = "waiting_input"
    }
    if (text.includes("✅ all units complete")) {
      record.session.status = "completed"
      record.session.endedAt = this.nowIso()
    }

    emitNervesEvent({
      component: "repertoire",
      event: "repertoire.coding_session_output",
      message: "received coding session output",
      meta: { id: record.session.id, status: record.session.status },
    })
  }

  private onExit(record: CodingSessionRecord, code: number | null, signal: NodeJS.Signals | null): void {
    if (!record.process) return
    record.process = null
    record.session.pid = null
    record.session.lastExitCode = code
    record.session.lastSignal = signal

    if (record.session.status === "killed" || record.session.status === "completed") {
      record.session.endedAt = this.nowIso()
      return
    }

    if (code === 0) {
      record.session.status = "completed"
      record.session.endedAt = this.nowIso()
      return
    }

    if (record.request.autoRestartOnCrash !== false && record.session.restartCount < this.maxRestarts) {
      this.restartSession(record, "crash")
      return
    }

    record.session.status = "failed"
    record.session.endedAt = this.nowIso()

    emitNervesEvent({
      level: "error",
      component: "repertoire",
      event: "repertoire.coding_session_failed",
      message: "coding session failed without restart",
      meta: { id: record.session.id, code, signal },
    })
  }

  private restartSession(record: CodingSessionRecord, reason: "stalled" | "crash"): void {
    const replacement = this.spawnProcess(record.request)
    record.process = replacement
    record.session.pid = replacement.pid ?? null
    record.session.restartCount += 1
    record.session.status = "running"
    record.session.lastActivityAt = this.nowIso()
    record.session.endedAt = null

    this.attachProcessListeners(record)

    emitNervesEvent({
      level: "warn",
      component: "repertoire",
      event: "repertoire.coding_session_restarted",
      message: "coding session restarted",
      meta: { id: record.session.id, reason, restartCount: record.session.restartCount },
    })
  }
}
