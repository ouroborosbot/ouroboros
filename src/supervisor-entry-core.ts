import { AgentSupervisor } from "./supervisor"
import { emitNervesEvent } from "./nerves/runtime"

export interface SupervisorLike {
  start(): Promise<void>
  stop(): Promise<void>
}

export function parseSupervisorAgents(argv: string[]): string[] {
  const agentsIndex = argv.indexOf("--agents")
  if (agentsIndex >= 0) {
    const rawValue = argv[agentsIndex + 1]
    if (!rawValue) throw new Error("Missing required --agents value.")
    const parsed = rawValue
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    if (parsed.length === 0) throw new Error("Missing required --agents value.")
    return [...new Set(parsed)]
  }

  const agentIndex = argv.indexOf("--agent")
  if (agentIndex >= 0) {
    const value = argv[agentIndex + 1]?.trim()
    if (!value) throw new Error("Missing required --agent value.")
    return [value]
  }

  throw new Error("Missing required --agent or --agents argument.")
}

export function createAgentSupervisors(agents: readonly string[]): AgentSupervisor[] {
  emitNervesEvent({
    level: "info",
    component: "supervisor",
    event: "supervisor.entry_start",
    message: "creating agent supervisors",
    meta: { agentCount: agents.length },
  })
  return agents.map((agent) => new AgentSupervisor({ agent }))
}

export async function startSupervisors(supervisors: readonly SupervisorLike[]): Promise<void> {
  for (const supervisor of supervisors) {
    await supervisor.start()
  }
}

export async function stopSupervisors(supervisors: readonly SupervisorLike[]): Promise<void> {
  for (const supervisor of [...supervisors].reverse()) {
    await supervisor.stop()
  }
}
