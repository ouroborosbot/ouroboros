// Thin entrypoint for running the agent supervisor.
if (!process.argv.includes("--agent") && !process.argv.includes("--agents")) {
  // eslint-disable-next-line no-console -- pre-boot guard
  console.error(
    "Missing required --agent <name> or --agents <a,b> argument.\nUsage: node dist/supervisor-entry.js --agent ouroboros",
  )
  process.exit(1)
}

import { emitNervesEvent } from "./nerves/runtime"
import {
  createAgentSupervisors,
  parseSupervisorAgents,
  startSupervisors,
  stopSupervisors,
} from "./supervisor-entry-core"

let agents: string[] = []
try {
  agents = parseSupervisorAgents(process.argv)
} catch (error) {
  emitNervesEvent({
    level: "error",
    component: "supervisor",
    event: "supervisor.entry_error",
    message: "failed to parse supervisor agent arguments",
    meta: { error: error instanceof Error ? error.message : String(error) },
  })
  throw error
}

emitNervesEvent({
  component: "supervisor",
  event: "supervisor.entry_start",
  message: "starting supervisor entrypoint",
  meta: { agents },
})

const supervisors = createAgentSupervisors(agents)

async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  emitNervesEvent({
    component: "supervisor",
    event: "supervisor.entry_shutdown",
    message: "received shutdown signal",
    meta: { agents, signal },
  })
  await stopSupervisors(supervisors)
  process.exit(0)
}

process.on("SIGINT", () => { void shutdown("SIGINT") })
process.on("SIGTERM", () => { void shutdown("SIGTERM") })

void startSupervisors(supervisors).catch((error) => {
  emitNervesEvent({
    level: "error",
    component: "supervisor",
    event: "supervisor.entry_error",
    message: "supervisor startup failed",
    meta: { agents, error: error instanceof Error ? error.message : String(error) },
  })
  process.exit(1)
})
