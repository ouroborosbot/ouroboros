import { emitNervesEvent } from "../../nerves/runtime"
import { parseFrontmatter } from "../../repertoire/tasks/parser"
import {
  parseCadenceToMs as _parseCadenceToMs,
  DEFAULT_CADENCE_MS as _DEFAULT_CADENCE_MS,
} from "./cadence"

// Re-export for backward compatibility
export const DEFAULT_CADENCE_MS = _DEFAULT_CADENCE_MS

export function parseCadenceMs(raw: unknown): number | null {
  return _parseCadenceToMs(raw)
}

type ReadFileSync = (filePath: string, encoding: string) => string
type ReaddirSync = (dirPath: string) => string[]

export interface HeartbeatTimerDeps {
  readFileSync: ReadFileSync
  readdirSync: ReaddirSync
  heartbeatTaskDir: string
  runtimeStatePath: string
  now?: () => number
}

export interface HeartbeatTimerOptions {
  agent: string
  sendToAgent: (agent: string, message: { type: string }) => void
  deps: HeartbeatTimerDeps
}

export class HeartbeatTimer {
  private readonly agent: string
  private readonly sendToAgent: (agent: string, message: { type: string }) => void
  private readonly readFileSync: ReadFileSync
  private readonly readdirSync: ReaddirSync
  private readonly heartbeatTaskDir: string
  private readonly runtimeStatePath: string
  private readonly now: () => number
  private pendingTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: HeartbeatTimerOptions) {
    this.agent = options.agent
    this.sendToAgent = options.sendToAgent
    this.readFileSync = options.deps.readFileSync
    this.readdirSync = options.deps.readdirSync
    this.heartbeatTaskDir = options.deps.heartbeatTaskDir
    this.runtimeStatePath = options.deps.runtimeStatePath
    this.now = options.deps.now ?? (() => Date.now())
  }

  start(): void {
    this.scheduleNext()
  }

  stop(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
  }

  private scheduleNext(): void {
    const cadenceMs = this.readCadence()
    const lastCompletedAt = this.readLastCompletedAt()
    const nowMs = this.now()

    let delay: number
    if (lastCompletedAt === null) {
      // Never run before — fire once after a full cadence (not immediately, to avoid spin loop
      // when the agent has no inner dialog state to write lastCompletedAt)
      delay = cadenceMs
    } else {
      const elapsed = nowMs - lastCompletedAt
      delay = Math.max(0, cadenceMs - elapsed)
    }

    this.pendingTimer = setTimeout(() => {
      this.fire()
    }, delay)
  }

  private fire(): void {
    this.pendingTimer = null

    emitNervesEvent({
      component: "daemon",
      event: "daemon.heartbeat_fire",
      message: "heartbeat timer fired",
      meta: { agent: this.agent },
    })

    this.sendToAgent(this.agent, { type: "heartbeat" })
    this.scheduleNext()
  }

  private readCadence(): number {
    // Scan habits dir for *-heartbeat.md
    let files: string[]
    try {
      files = this.readdirSync(this.heartbeatTaskDir)
    } catch {
      return DEFAULT_CADENCE_MS
    }

    const heartbeatFile = files.find((f) => f.endsWith("-heartbeat.md"))
    if (!heartbeatFile) return DEFAULT_CADENCE_MS

    try {
      const content = this.readFileSync(
        `${this.heartbeatTaskDir}/${heartbeatFile}`,
        "utf-8",
      )
      const cadence = this.extractCadenceFromTaskFile(content)
      return cadence ?? DEFAULT_CADENCE_MS
    } catch {
      return DEFAULT_CADENCE_MS
    }
  }

  private extractCadenceFromTaskFile(content: string): number | null {
    // Parse frontmatter from task file to get cadence value
    const lines = content.split(/\r?\n/)
    if (lines[0]?.trim() !== "---") return null

    const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
    if (closing === -1) return null

    const rawFrontmatter = lines.slice(1, closing).join("\n")
    const frontmatter = parseFrontmatter(rawFrontmatter)
    return parseCadenceMs(frontmatter.cadence)
  }

  private readLastCompletedAt(): number | null {
    try {
      const raw = this.readFileSync(this.runtimeStatePath, "utf-8")
      const state = JSON.parse(raw) as { lastCompletedAt?: string }
      if (typeof state.lastCompletedAt !== "string") return null
      const ms = new Date(state.lastCompletedAt).getTime()
      if (Number.isNaN(ms)) return null
      return ms
    } catch {
      return null
    }
  }
}
