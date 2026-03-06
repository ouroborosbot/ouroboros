import { emitNervesEvent } from "../nerves/runtime"

export const HARNESS_BOOTSTRAP_PHASES = ["bundle", "governance", "psyche", "inner-dialog"] as const

export const GOVERNANCE_CHECK_RESULTS = ["within-bounds", "requires-review"] as const

export type HarnessBootstrapPhase = (typeof HARNESS_BOOTSTRAP_PHASES)[number]

export type GovernanceCheckResult = (typeof GOVERNANCE_CHECK_RESULTS)[number]

export interface HarnessToolCall {
  tool: string
  input: Record<string, unknown>
  rationale: string
}

export interface HarnessToolResult {
  tool: string
  success: boolean
  output: string
  meta?: Record<string, unknown>
}

export interface HarnessToolSurface {
  readonly availableTools: readonly string[]
  invoke(call: HarnessToolCall): Promise<HarnessToolResult>
}

export interface HarnessBootstrapStep {
  phase: HarnessBootstrapPhase
  sourcePath: string
  required: boolean
}

export interface HarnessBootstrapPlan {
  steps: HarnessBootstrapStep[]
}

export interface GovernanceCheck {
  id: string
  description: string
}

export interface GovernanceEvaluation {
  result: GovernanceCheckResult
  summary: string
  violations: string[]
}

export function isGovernanceCheckResult(value: string): value is GovernanceCheckResult {
  emitNervesEvent({
    component: "harness",
    event: "harness.governance_result_check",
    message: "evaluating governance result",
    meta: { value },
  })
  return GOVERNANCE_CHECK_RESULTS.includes(value as GovernanceCheckResult)
}
