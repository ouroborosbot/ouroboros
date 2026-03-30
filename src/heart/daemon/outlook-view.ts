import {
  OUTLOOK_PRODUCT_NAME,
  type OutlookAgentSummary,
  type OutlookAttentionLevel,
  type OutlookMachineDaemonSummary,
  type OutlookMachineMood,
  type OutlookMachineView,
  type OutlookMachineAgentView,
  type OutlookMachineState,
  type OutlookMachineTotals,
} from "./outlook-types"

const ATTENTION_RANK: Record<OutlookAttentionLevel, number> = {
  degraded: 0,
  stale: 1,
  blocked: 2,
  active: 3,
  idle: 4,
}

function deriveAttention(agent: OutlookAgentSummary): OutlookMachineAgentView["attention"] {
  if (agent.degraded.status === "degraded") {
    return { level: "degraded", label: "Needs intervention" }
  }

  if (agent.freshness.status === "stale") {
    return { level: "stale", label: "Needs reorientation" }
  }

  if (agent.tasks.blockedCount > 0 || agent.coding.blockedCount > 0) {
    return { level: "blocked", label: "Blocked" }
  }

  if (agent.tasks.liveCount > 0 || agent.coding.activeCount > 0 || agent.obligations.openCount > 0) {
    return { level: "active", label: "In motion" }
  }

  return { level: "idle", label: "Idle" }
}

function buildTotals(machine: OutlookMachineState): OutlookMachineTotals {
  return machine.agents.reduce<OutlookMachineTotals>((totals, agent) => ({
    agents: totals.agents + 1,
    enabledAgents: totals.enabledAgents + (agent.enabled ? 1 : 0),
    degradedAgents: totals.degradedAgents + (agent.degraded.status === "degraded" ? 1 : 0),
    staleAgents: totals.staleAgents + (agent.freshness.status === "stale" ? 1 : 0),
    liveTasks: totals.liveTasks + agent.tasks.liveCount,
    blockedTasks: totals.blockedTasks + agent.tasks.blockedCount,
    openObligations: totals.openObligations + agent.obligations.openCount,
    activeCodingAgents: totals.activeCodingAgents + (agent.coding.activeCount > 0 ? 1 : 0),
    blockedCodingAgents: totals.blockedCodingAgents + (agent.coding.blockedCount > 0 ? 1 : 0),
  }), {
    agents: 0,
    enabledAgents: 0,
    degradedAgents: 0,
    staleAgents: 0,
    liveTasks: 0,
    blockedTasks: 0,
    openObligations: 0,
    activeCodingAgents: 0,
    blockedCodingAgents: 0,
  })
}

function deriveMood(machine: OutlookMachineState, daemon: OutlookMachineDaemonSummary): OutlookMachineMood {
  if (machine.degraded.status === "degraded" || daemon.health === "warn") {
    return "strained"
  }

  if (machine.freshness.status === "stale") {
    return "watchful"
  }

  return "calm"
}

export function buildOutlookMachineView(input: {
  machine: OutlookMachineState
  daemon: OutlookMachineDaemonSummary
}): OutlookMachineView {
  const totals = buildTotals(input.machine)
  const agents = input.machine.agents
    .map((agent, index) => ({
      ...agent,
      attention: deriveAttention(agent),
      _index: index,
    }))
    .sort((left, right) => {
      const levelDelta = ATTENTION_RANK[left.attention.level] - ATTENTION_RANK[right.attention.level]
      return levelDelta !== 0 ? levelDelta : left._index - right._index
    })
    .map(({ _index: _discarded, ...agent }) => agent)

  return {
    overview: {
      productName: OUTLOOK_PRODUCT_NAME,
      observedAt: input.machine.observedAt,
      primaryEntryPoint: input.daemon.outlookUrl,
      daemon: input.daemon,
      runtime: input.machine.runtime,
      freshness: input.machine.freshness,
      degraded: input.machine.degraded,
      totals,
      mood: deriveMood(input.machine, input.daemon),
      entrypoints: [
        { kind: "web", label: "Open Outlook", target: input.daemon.outlookUrl },
        { kind: "cli", label: "CLI JSON", target: "ouro outlook --json" },
      ],
    },
    agents,
  }
}
