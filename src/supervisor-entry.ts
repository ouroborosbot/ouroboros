// Thin entrypoint for running the agent supervisor.
if (!process.argv.includes("--agent")) {
  // eslint-disable-next-line no-console -- pre-boot guard
  console.error("Missing required --agent <name> argument.\nUsage: node dist/supervisor-entry.js --agent ouroboros")
  process.exit(1)
}

import { AgentSupervisor } from "./supervisor"

function parseAgentArg(argv: string[]): string {
  const index = argv.indexOf("--agent")
  if (index < 0 || index === argv.length - 1) {
    throw new Error("Missing required --agent value.")
  }
  return argv[index + 1]
}

const agent = parseAgentArg(process.argv)
const supervisor = new AgentSupervisor({ agent })

async function shutdown(): Promise<void> {
  await supervisor.stop()
  process.exit(0)
}

process.on("SIGINT", () => { void shutdown() })
process.on("SIGTERM", () => { void shutdown() })

void supervisor.start()

