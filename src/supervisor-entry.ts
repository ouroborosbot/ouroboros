// Thin entrypoint for running the agent supervisor.
if (!process.argv.includes("--agent")) {
  // eslint-disable-next-line no-console -- pre-boot guard
  console.error("Missing required --agent <name> argument.\nUsage: node dist/supervisor-entry.js --agent ouroboros")
  process.exit(1)
}

import { AgentSupervisor } from "./supervisor"
import { emitNervesEvent } from "./nerves/runtime"

function parseAgentArg(argv: string[]): string {
  const index = argv.indexOf("--agent")
  if (index < 0 || index === argv.length - 1) {
    throw new Error("Missing required --agent value.")
  }
  return argv[index + 1]
}

let agent = "unknown"
try {
  agent = parseAgentArg(process.argv)
} catch (error) {
  emitNervesEvent({
    level: "error",
    component: "supervisor",
    event: "supervisor.entry_error",
    message: "failed to parse --agent argument",
    meta: { error: error instanceof Error ? error.message : String(error) },
  })
  throw error
}

emitNervesEvent({
  component: "supervisor",
  event: "supervisor.entry_start",
  message: "starting supervisor entrypoint",
  meta: { agent },
})

const supervisor = new AgentSupervisor({ agent })

async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  emitNervesEvent({
    component: "supervisor",
    event: "supervisor.entry_shutdown",
    message: "received shutdown signal",
    meta: { agent, signal },
  })
  await supervisor.stop()
  process.exit(0)
}

process.on("SIGINT", () => { void shutdown("SIGINT") })
process.on("SIGTERM", () => { void shutdown("SIGTERM") })

void supervisor.start().catch((error) => {
  emitNervesEvent({
    level: "error",
    component: "supervisor",
    event: "supervisor.entry_error",
    message: "supervisor startup failed",
    meta: { agent, error: error instanceof Error ? error.message : String(error) },
  })
  process.exit(1)
})
