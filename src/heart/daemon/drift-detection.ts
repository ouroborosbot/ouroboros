import type { AgentConfig, AgentFacingConfig } from "../identity"
import type { ProviderLane, ProviderState } from "../provider-state"

/**
 * Per-lane drift between intent (`agent.json`) and observation
 * (`state/providers.json`).
 *
 * `reason` is the existing `EffectiveProviderReadiness.reason` enum value
 * `"provider-model-changed"` — Layer 4 surfaces drift through that vocabulary
 * rather than coining a new one.
 *
 * `repairCommand` is a copy-pasteable `ouro use` invocation that, when the
 * operator runs it, rewrites `state/providers.json` to match intent. This PR
 * never executes the command — it only emits the string.
 */
export interface DriftFinding {
  agent: string
  lane: ProviderLane
  intentProvider: string
  intentModel: string
  observedProvider: string
  observedModel: string
  reason: "provider-model-changed"
  repairCommand: string
}

/**
 * Permissive view of `agent.json` for the drift comparator. The repo-wide
 * `AgentConfig` type currently models only the legacy `humanFacing` /
 * `agentFacing` keys, but the rename to `outward` / `inner` is in flight,
 * and a single `agent.json` file may carry either or both sets of keys
 * during the transition. The comparator therefore accepts an `AgentConfig`
 * extended with the new optional keys and resolves each lane's intent
 * with a "new key wins, fall back to legacy" precedence rule.
 */
type DriftAgentJson = AgentConfig & {
  outward?: AgentFacingConfig
  inner?: AgentFacingConfig
}

interface LaneIntent {
  provider: string
  model: string
}

/**
 * Pull the per-lane intent out of an agent.json view, preferring the new
 * `outward`/`inner` keys over the legacy `humanFacing`/`agentFacing` keys
 * when both are present. Returns `null` if neither set carries a usable
 * binding for this lane (the comparator treats that as "no intent to
 * compare against" and emits no drift for that lane).
 */
function resolveLaneIntent(agentJson: DriftAgentJson, lane: ProviderLane): LaneIntent | null {
  const newKey = lane === "outward" ? agentJson.outward : agentJson.inner
  if (newKey && typeof newKey.provider === "string" && typeof newKey.model === "string") {
    return { provider: newKey.provider, model: newKey.model }
  }
  const legacy = lane === "outward" ? agentJson.humanFacing : agentJson.agentFacing
  if (legacy && typeof legacy.provider === "string" && typeof legacy.model === "string") {
    return { provider: legacy.provider, model: legacy.model }
  }
  return null
}

function buildRepairCommand(agentName: string, lane: ProviderLane, provider: string, model: string): string {
  return `ouro use --agent ${agentName} --lane ${lane} --provider ${provider} --model ${model}`
}

export interface DetectProviderBindingDriftInput {
  agentName: string
  agentJson: DriftAgentJson
  providerState: ProviderState | null
}

/**
 * Pure intent-vs-observed comparator. Emits one `DriftFinding` per lane
 * whose intent (agent.json) does not match its observation
 * (state/providers.json).
 *
 * Returns `[]` when:
 * - `providerState === null` (fresh install, nothing to drift against), OR
 * - both lanes match, OR
 * - a lane has no intent in agent.json AND no observation in providerState
 *   (deferred to other layers — drift detection is silent on that lane).
 */
export function detectProviderBindingDrift(input: DetectProviderBindingDriftInput): DriftFinding[] {
  if (input.providerState === null) {
    return []
  }

  const findings: DriftFinding[] = []
  const lanes: ProviderLane[] = ["outward", "inner"]
  for (const lane of lanes) {
    const intent = resolveLaneIntent(input.agentJson, lane)
    if (!intent) continue
    const observed = input.providerState.lanes[lane]
    if (intent.provider === observed.provider && intent.model === observed.model) {
      continue
    }
    findings.push({
      agent: input.agentName,
      lane,
      intentProvider: intent.provider,
      intentModel: intent.model,
      observedProvider: observed.provider,
      observedModel: observed.model,
      reason: "provider-model-changed",
      repairCommand: buildRepairCommand(input.agentName, lane, intent.provider, intent.model),
    })
  }
  return findings
}
