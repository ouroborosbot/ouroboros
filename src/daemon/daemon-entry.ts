import { DaemonProcessManager } from "./process-manager"
import { OuroDaemon, type DaemonCronJobSummary, type DaemonHealthResult, type DaemonMessageReceipt } from "./daemon"
import { emitNervesEvent } from "../nerves/runtime"

class InMemoryScheduler {
  private readonly jobs: DaemonCronJobSummary[] = []

  listJobs(): DaemonCronJobSummary[] {
    return [...this.jobs]
  }

  async triggerJob(jobId: string): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: `triggered ${jobId}` }
  }
}

class InMemoryHealthMonitor {
  async runChecks(): Promise<DaemonHealthResult[]> {
    return [{ name: "agent-processes", status: "ok", message: "checks passing" }]
  }
}

class InMemoryRouter {
  async send(): Promise<DaemonMessageReceipt> {
    return { id: `msg-${Date.now()}`, queuedAt: new Date().toISOString() }
  }

  pollInbox(): Array<{ id: string; from: string; content: string; queuedAt: string; priority: string }> {
    return []
  }
}

function parseSocketPath(argv: string[]): string {
  const socketIndex = argv.indexOf("--socket")
  if (socketIndex >= 0) {
    const value = argv[socketIndex + 1]
    if (value && value.trim().length > 0) return value
  }
  return "/tmp/ouroboros-daemon.sock"
}

const socketPath = parseSocketPath(process.argv)

emitNervesEvent({
  component: "daemon",
  event: "daemon.entry_start",
  message: "starting daemon entrypoint",
  meta: { socketPath },
})

const processManager = new DaemonProcessManager({
  agents: [
    { name: "ouroboros", entry: "inner-worker-entry.js", channel: "cli", autoStart: true },
    { name: "slugger", entry: "inner-worker-entry.js", channel: "cli", autoStart: true },
  ],
})

const daemon = new OuroDaemon({
  socketPath,
  processManager,
  scheduler: new InMemoryScheduler(),
  healthMonitor: new InMemoryHealthMonitor(),
  router: new InMemoryRouter(),
})

void daemon.start().catch(async () => {
  emitNervesEvent({
    level: "error",
    component: "daemon",
    event: "daemon.entry_error",
    message: "daemon entrypoint failed",
    meta: {},
  })
  await daemon.stop()
  process.exit(1)
})

process.on("SIGINT", () => {
  void daemon.stop().then(() => process.exit(0))
})

process.on("SIGTERM", () => {
  void daemon.stop().then(() => process.exit(0))
})
