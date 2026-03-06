import * as fs from "fs"
import * as net from "net"
import { emitNervesEvent } from "../nerves/runtime"

export interface DaemonCronJobSummary {
  id: string
  schedule: string
  lastRun: string | null
}

export interface DaemonHealthResult {
  name: string
  status: "ok" | "warn" | "critical"
  message: string
}

export interface DaemonMessageReceipt {
  id: string
  queuedAt: string
}

export interface DaemonProcessManagerLike {
  startAutoStartAgents(): Promise<void>
  stopAll(): Promise<void>
  startAgent(agent: string): Promise<void>
  stopAgent(agent: string): Promise<void>
  restartAgent(agent: string): Promise<void>
  listAgentSnapshots(): Array<{
    name: string
    channel: string
    status: string
    pid: number | null
    restartCount: number
    startedAt: string | null
    lastCrashAt: string | null
    backoffMs: number
  }>
}

export interface DaemonSchedulerLike {
  listJobs(): DaemonCronJobSummary[]
  triggerJob(jobId: string): Promise<{ ok: boolean; message: string }>
}

export interface DaemonHealthMonitorLike {
  runChecks(): Promise<DaemonHealthResult[]>
}

export interface DaemonRouterLike {
  send(message: { from: string; to: string; content: string; priority?: string }): Promise<DaemonMessageReceipt>
  pollInbox(agent: string): Array<{ id: string; from: string; content: string; queuedAt: string; priority: string }>
}

export type DaemonCommand =
  | { kind: "daemon.start" }
  | { kind: "daemon.stop" }
  | { kind: "daemon.status" }
  | { kind: "daemon.health" }
  | { kind: "agent.start"; agent: string }
  | { kind: "agent.stop"; agent: string }
  | { kind: "agent.restart"; agent: string }
  | { kind: "cron.list" }
  | { kind: "cron.trigger"; jobId: string }
  | { kind: "message.send"; from: string; to: string; content: string; priority?: string }
  | { kind: "message.poll"; agent: string }

export interface DaemonResponse {
  ok: boolean
  summary?: string
  message?: string
  error?: string
  data?: unknown
}

export interface OuroDaemonOptions {
  socketPath: string
  processManager: DaemonProcessManagerLike
  scheduler: DaemonSchedulerLike
  healthMonitor: DaemonHealthMonitorLike
  router: DaemonRouterLike
}

function formatStatusSummary(snapshots: ReturnType<DaemonProcessManagerLike["listAgentSnapshots"]>): string {
  if (snapshots.length === 0) return "no managed agents"
  return snapshots
    .map((snapshot) => {
      return `${snapshot.name}\t${snapshot.channel}\t${snapshot.status}\tpid=${snapshot.pid ?? "none"}\trestarts=${snapshot.restartCount}`
    })
    .join("\n")
}

function parseIncomingCommand(raw: string): DaemonCommand {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Invalid daemon command payload: expected JSON object.")
  }

  if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) {
    throw new Error("Invalid daemon command payload: missing kind.")
  }

  const kind = (parsed as { kind?: unknown }).kind
  if (typeof kind !== "string") {
    throw new Error("Invalid daemon command payload: kind must be a string.")
  }

  return parsed as DaemonCommand
}

export class OuroDaemon {
  private readonly socketPath: string
  private readonly processManager: DaemonProcessManagerLike
  private readonly scheduler: DaemonSchedulerLike
  private readonly healthMonitor: DaemonHealthMonitorLike
  private readonly router: DaemonRouterLike
  private server: net.Server | null = null

  constructor(options: OuroDaemonOptions) {
    this.socketPath = options.socketPath
    this.processManager = options.processManager
    this.scheduler = options.scheduler
    this.healthMonitor = options.healthMonitor
    this.router = options.router
  }

  async start(): Promise<void> {
    if (this.server) return

    emitNervesEvent({
      component: "daemon",
      event: "daemon.server_start",
      message: "starting daemon server",
      meta: { socketPath: this.socketPath },
    })
    await this.processManager.startAutoStartAgents()

    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath)
    }

    this.server = net.createServer((connection) => {
      let raw = ""
      let responded = false

      const flushResponse = async () => {
        if (responded) return
        responded = true
        const response = await this.handleRawPayload(raw)
        connection.end(response)
      }

      connection.on("data", (chunk) => {
        raw += chunk.toString("utf-8")
        void flushResponse()
      })
      connection.on("end", () => {
        void flushResponse()
      })
    })

    const server = this.server
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(this.socketPath, () => resolve())
    })
  }

  async stop(): Promise<void> {
    emitNervesEvent({
      component: "daemon",
      event: "daemon.server_stop",
      message: "stopping daemon server",
      meta: { socketPath: this.socketPath },
    })

    await this.processManager.stopAll()

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve())
      })
      this.server = null
    }

    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath)
    }
  }

  async handleRawPayload(raw: string): Promise<string> {
    try {
      const command = parseIncomingCommand(raw)
      const response = await this.handleCommand(command)
      return JSON.stringify(response)
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies DaemonResponse)
    }
  }

  async handleCommand(command: DaemonCommand): Promise<DaemonResponse> {
    emitNervesEvent({
      component: "daemon",
      event: "daemon.command_received",
      message: "handling daemon command",
      meta: { kind: command.kind },
    })

    switch (command.kind) {
      case "daemon.start":
        await this.start()
        return { ok: true, message: "daemon started" }
      case "daemon.stop":
        await this.stop()
        return { ok: true, message: "daemon stopped" }
      case "daemon.status": {
        const snapshots = this.processManager.listAgentSnapshots()
        return {
          ok: true,
          summary: formatStatusSummary(snapshots),
          data: snapshots,
        }
      }
      case "daemon.health": {
        const checks = await this.healthMonitor.runChecks()
        const summary = checks.map((check) => `${check.name}:${check.status}:${check.message}`).join("\n")
        return { ok: true, summary, data: checks }
      }
      case "agent.start":
        await this.processManager.startAgent(command.agent)
        return { ok: true, message: `started ${command.agent}` }
      case "agent.stop":
        await this.processManager.stopAgent(command.agent)
        return { ok: true, message: `stopped ${command.agent}` }
      case "agent.restart":
        await this.processManager.restartAgent(command.agent)
        return { ok: true, message: `restarted ${command.agent}` }
      case "cron.list": {
        const jobs = this.scheduler.listJobs()
        const summary = jobs.length === 0
          ? "no cron jobs"
          : jobs.map((job) => `${job.id}\t${job.schedule}\tlast=${job.lastRun ?? "never"}`).join("\n")
        return { ok: true, summary, data: jobs }
      }
      case "cron.trigger": {
        const result = await this.scheduler.triggerJob(command.jobId)
        return { ok: result.ok, message: result.message }
      }
      case "message.send": {
        const receipt = await this.router.send({
          from: command.from,
          to: command.to,
          content: command.content,
          priority: command.priority,
        })
        return { ok: true, message: `queued message ${receipt.id}`, data: receipt }
      }
      case "message.poll": {
        const messages = this.router.pollInbox(command.agent)
        return {
          ok: true,
          summary: `${messages.length} messages`,
          data: messages,
        }
      }
      default:
        return {
          ok: false,
          error: `Unknown daemon command kind '${(command as { kind: string }).kind}'.`,
        }
    }
  }
}
