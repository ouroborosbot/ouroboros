import type { AgentConfig, AgentFacingConfig } from "./identity"

export type ProviderLane = "outward" | "inner"
export type ProviderLaneSelector = ProviderLane | "human" | "agent" | "humanFacing" | "agentFacing"
export type ProviderReadinessStatus = "ready" | "failed" | "stale" | "unknown"

export interface ProviderLaneResolution {
  lane: ProviderLane
  warnings: Array<{ code: string; message: string }>
}

export function facingKeyForProviderLane(lane: ProviderLane): "humanFacing" | "agentFacing" {
  return lane === "outward" ? "humanFacing" : "agentFacing"
}

export function providerLaneForFacingKey(facing: "humanFacing" | "agentFacing"): ProviderLane {
  return facing === "humanFacing" ? "outward" : "inner"
}

export function providerLaneBinding(config: AgentConfig, lane: ProviderLane): AgentFacingConfig {
  return config[facingKeyForProviderLane(lane)]
}
