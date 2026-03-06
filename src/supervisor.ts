import { fork, type ChildProcess } from "child_process"
import * as path from "path"
import { emitNervesEvent } from "./nerves/runtime"

export interface AgentSupervisorOptions {
  agent: string
  workerScript?: string
  workerArgs?: string[]
  heartbeatMs?: number
  restartBaseMs?: number
  restartMaxMs?: number
}

export class AgentSupervisor {
  private readonly agent: string
  private readonly workerScript: string
  private readonly workerArgs: string[]
  private readonly heartbeatMs: number
  private readonly restartBaseMs: number
  private readonly restartMaxMs: number
  private child: ChildProcess | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private shuttingDown = false
  private restartCount = 0

  constructor(options: AgentSupervisorOptions) {
    this.agent = options.agent
    this.workerScript = options.workerScript ?? path.join(__dirname, "inner-worker-entry.js")
    this.workerArgs = options.workerArgs ?? ["--agent", options.agent]
    this.heartbeatMs = options.heartbeatMs ?? 60_000
    this.restartBaseMs = options.restartBaseMs ?? 1_000
    this.restartMaxMs = options.restartMaxMs ?? 60_000
  }

  async start(): Promise<void> {
    if (this.child) return
    this.shuttingDown = false
    this.spawnWorker()
    this.startHeartbeat()
  }

  async stop(): Promise<void> {
    this.shuttingDown = true
    this.clearRestartTimer()
    this.stopHeartbeat()

    const child = this.child
    this.child = null
    if (!child) return

    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }

      child.once("exit", finish)
      try {
        if (child.connected) child.send({ type: "shutdown", agent: this.agent })
      } catch {
        // ignore send failures during shutdown
      }

      try {
        child.kill("SIGTERM")
      } catch {
        finish()
        return
      }

      setTimeout(() => {
        if (!done) {
          try {
            child.kill("SIGKILL")
          } catch {
            // ignore
          }
          finish()
        }
      }, 500)
    })
  }

  getRestartCount(): number {
    return this.restartCount
  }

  private spawnWorker(): void {
    const child = fork(this.workerScript, this.workerArgs, {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    })
    this.child = child
    emitNervesEvent({
      component: "supervisor",
      event: "supervisor.worker_started",
      message: "inner dialog worker started",
      meta: { agent: this.agent, pid: child.pid ?? null },
    })

    child.once("exit", (code, signal) => {
      const exitedPid = child.pid ?? null
      if (this.child === child) this.child = null
      emitNervesEvent({
        level: this.shuttingDown ? "info" : "warn",
        component: "supervisor",
        event: "supervisor.worker_exit",
        message: "inner dialog worker exited",
        meta: { agent: this.agent, pid: exitedPid, code, signal, shuttingDown: this.shuttingDown },
      })

      if (this.shuttingDown) return
      this.restartCount += 1
      const waitMs = Math.min(this.restartBaseMs * Math.pow(2, this.restartCount - 1), this.restartMaxMs)
      this.clearRestartTimer()
      this.restartTimer = setTimeout(() => {
        if (this.shuttingDown) return
        this.spawnWorker()
      }, waitMs)
    })
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.child || !this.child.connected) return
      try {
        this.child.send({
          type: "heartbeat",
          agent: this.agent,
          at: new Date().toISOString(),
        })
      } catch {
        // worker restart loop handles dead IPC channels
      }
    }, this.heartbeatMs)
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) return
    clearTimeout(this.restartTimer)
    this.restartTimer = null
  }
}
