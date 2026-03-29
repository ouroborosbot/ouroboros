import * as fs from "fs"
import * as path from "path"
import { emitNervesEvent } from "../../nerves/runtime"

export interface DegradedComponent {
  component: string
  reason: string
  since: string
}

export interface AgentHealth {
  status: string
  pid: number | null
  crashes: number
}

export interface HabitHealth {
  cronStatus: string
  lastFired: string | null
  fallback: boolean
}

export interface SafeModeState {
  active: boolean
  reason: string
  enteredAt: string
}

export interface DaemonHealthState {
  status: string
  mode: string
  pid: number
  startedAt: string
  uptimeSeconds: number
  safeMode: SafeModeState | null
  degraded: DegradedComponent[]
  agents: Record<string, AgentHealth>
  habits: Record<string, HabitHealth>
}

export class DaemonHealthWriter {
  private readonly healthPath: string

  constructor(healthPath: string) {
    this.healthPath = healthPath
  }

  writeHealth(state: DaemonHealthState): void {
    try {
      const dir = path.dirname(this.healthPath)
      fs.mkdirSync(dir, { recursive: true })

      const tmpPath = `${this.healthPath}.tmp.${process.pid}`
      fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2) + "\n", "utf-8")
      fs.renameSync(tmpPath, this.healthPath)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.health_written",
        message: "daemon health file written",
        meta: { path: this.healthPath, status: state.status },
      })
    } catch {
      // Best-effort: if we can't write, don't crash the daemon.
    }
  }
}

export function readHealth(healthPath: string): DaemonHealthState | null {
  try {
    const raw = fs.readFileSync(healthPath, "utf-8")
    const parsed = JSON.parse(raw) as Record<string, unknown>

    if (
      typeof parsed.status !== "string" ||
      typeof parsed.mode !== "string" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.uptimeSeconds !== "number" ||
      !Array.isArray(parsed.degraded) ||
      typeof parsed.agents !== "object" ||
      parsed.agents === null ||
      typeof parsed.habits !== "object" ||
      parsed.habits === null
    ) {
      return null
    }

    return {
      status: parsed.status,
      mode: parsed.mode,
      pid: parsed.pid,
      startedAt: parsed.startedAt,
      uptimeSeconds: parsed.uptimeSeconds,
      safeMode: parsed.safeMode as SafeModeState | null,
      degraded: parsed.degraded as DegradedComponent[],
      agents: parsed.agents as Record<string, AgentHealth>,
      habits: parsed.habits as Record<string, HabitHealth>,
    }
  } catch {
    return null
  }
}
