import { DaemonProcessManager } from "./process-manager"
import { OuroDaemon, type DaemonCronJobSummary, type DaemonHealthResult, type DaemonMessageReceipt } from "./daemon"
import { emitNervesEvent } from "../nerves/runtime"

const inMemoryScheduler: {
  listJobs: () => DaemonCronJobSummary[]
  triggerJob: (jobId: string) => Promise<{ ok: boolean; message: string }>
} = {
  listJobs: () => [],
  triggerJob: async (jobId) => ({ ok: true, message: `triggered ${jobId}` }),
}

const inMemoryHealthMonitor: { runChecks: () => Promise<DaemonHealthResult[]> } = {
  runChecks: async () => [{ name: "agent-processes", status: "ok", message: "checks passing" }],
}

const inMemoryRouter: {
  send: () => Promise<DaemonMessageReceipt>
  pollInbox: () => Array<{ id: string; from: string; content: string; queuedAt: string; priority: string }>
} = {
  send: async () => ({ id: `msg-${Date.now()}`, queuedAt: new Date().toISOString() }),
  pollInbox: () => [],
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
  scheduler: inMemoryScheduler,
  healthMonitor: inMemoryHealthMonitor,
  router: inMemoryRouter,
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
