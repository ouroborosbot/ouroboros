import type { ProviderErrorClassification } from "./core"
import type { AgentProvider } from "./identity"
import type { HealthInventoryResult, PingResult } from "./provider-ping"
import { emitNervesEvent } from "../nerves/runtime"

export interface FailoverContext {
  errorSummary: string
  classification: ProviderErrorClassification
  currentProvider: AgentProvider
  agentName: string
  workingProviders: AgentProvider[]
  unconfiguredProviders: AgentProvider[]
  userMessage: string
}

export type FailoverAction =
  | { action: "switch"; provider: AgentProvider }
  | { action: "dismiss" }

const CLASSIFICATION_LABELS: Record<ProviderErrorClassification, string> = {
  "auth-failure": "authentication failed",
  "usage-limit": "hit its usage limit",
  "rate-limit": "is being rate limited",
  "server-error": "is experiencing an outage",
  "network-error": "is unreachable (network error)",
  "unknown": "encountered an error",
}

export function buildFailoverContext(
  _errorMessage: string,
  classification: ProviderErrorClassification,
  currentProvider: AgentProvider,
  agentName: string,
  inventory: HealthInventoryResult,
): FailoverContext {
  const errorSummary = `${currentProvider} ${CLASSIFICATION_LABELS[classification]}`

  const workingProviders: AgentProvider[] = []
  const unconfiguredProviders: AgentProvider[] = []

  for (const [provider, result] of Object.entries(inventory) as [AgentProvider, PingResult][]) {
    if (result.ok) {
      workingProviders.push(provider)
    } else if (result.classification === "auth-failure" && result.message === "no credentials configured") {
      unconfiguredProviders.push(provider)
    }
    // Providers that are configured but failing (e.g., also rate-limited) are omitted from both lists
  }

  const lines: string[] = [`${errorSummary}.`]

  if (workingProviders.length > 0) {
    const switchOptions = workingProviders.map((p) => `"switch to ${p}"`).join(" or ")
    lines.push(`these providers are ready to go: ${workingProviders.join(", ")}.`)
    lines.push(`reply ${switchOptions} to continue.`)
  }

  if (unconfiguredProviders.length > 0) {
    lines.push(`to set up ${unconfiguredProviders.join(", ")}, run \`ouro auth --agent ${agentName}\` in terminal.`)
  }

  if (workingProviders.length === 0 && unconfiguredProviders.length === 0) {
    lines.push(`no other providers are available. run \`ouro auth --agent ${agentName}\` in terminal to configure one.`)
  }

  emitNervesEvent({
    component: "engine",
    event: "engine.failover_context_built",
    message: "built provider failover context",
    meta: { currentProvider, classification, workingProviders, unconfiguredProviders },
  })

  return {
    errorSummary,
    classification,
    currentProvider,
    agentName,
    workingProviders,
    unconfiguredProviders,
    userMessage: lines.join(" "),
  }
}

export function handleFailoverReply(
  reply: string,
  context: FailoverContext,
): FailoverAction {
  const lower = reply.toLowerCase().trim()
  for (const provider of context.workingProviders) {
    if (lower === `switch to ${provider}` || lower === provider) {
      return { action: "switch", provider }
    }
  }
  return { action: "dismiss" }
}
