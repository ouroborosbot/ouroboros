import { DaemonProcessManager } from "./process-manager"
import { OuroDaemon } from "./daemon"
import { emitNervesEvent } from "../../nerves/runtime"
import { FileMessageRouter } from "./message-router"
import { HealthMonitor } from "./health-monitor"
import { TaskDrivenScheduler } from "./task-scheduler"
import { configureDaemonRuntimeLogger } from "./runtime-logging"

function parseSocketPath(argv: string[]): string {
  const socketIndex = argv.indexOf("--socket")
  if (socketIndex >= 0) {
    const value = argv[socketIndex + 1]
    if (value && value.trim().length > 0) return value
  }
  return "/tmp/ouroboros-daemon.sock"
}

const socketPath = parseSocketPath(process.argv)

configureDaemonRuntimeLogger("daemon")

emitNervesEvent({
  component: "daemon",
  event: "daemon.entry_start",
  message: "starting daemon entrypoint",
  meta: { socketPath },
})

const processManager = new DaemonProcessManager({
  agents: [
    { name: "ouroboros", entry: "heart/agent-entry.js", channel: "cli", autoStart: true },
    { name: "slugger", entry: "heart/agent-entry.js", channel: "cli", autoStart: true },
  ],
})

const scheduler = new TaskDrivenScheduler({
  agents: ["ouroboros", "slugger"],
})

const router = new FileMessageRouter()

const healthMonitor = new HealthMonitor({
  processManager,
  scheduler,
  alertSink: (message) => {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.health_alert",
      message: "health monitor produced critical alert",
      meta: { message },
    })
  },
})

const daemon = new OuroDaemon({
  socketPath,
  processManager,
  scheduler,
  healthMonitor,
  router,
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
