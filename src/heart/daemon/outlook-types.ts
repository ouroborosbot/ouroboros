import type { CodingSessionOrigin, CodingSessionStatus, CodingRunner } from "../../repertoire/coding/types"
import type { TaskStatus } from "../../repertoire/tasks/types"
import type { RuntimeMetadata } from "./runtime-metadata"
import type { InnerJobStatus } from "./thoughts"

export const OUTLOOK_PRODUCT_NAME = "Ouro Outlook" as const
export const OUTLOOK_RELEASE_INTERACTION_MODEL = "read-only" as const
export const OUTLOOK_DEFAULT_INNER_VISIBILITY = "summary" as const

export type OutlookFreshnessStatus = "fresh" | "stale" | "unknown"
export type OutlookHealthStatus = "ok" | "degraded"

export interface OutlookIssue {
  code: string
  detail: string
}

export interface OutlookDegradedState {
  status: OutlookHealthStatus
  issues: OutlookIssue[]
}

export interface OutlookFreshness {
  status: OutlookFreshnessStatus
  latestActivityAt: string | null
  ageMs: number | null
}

export interface OutlookTaskSummary {
  totalCount: number
  liveCount: number
  blockedCount: number
  byStatus: Record<TaskStatus, number>
  liveTaskNames: string[]
  actionRequired: string[]
  activeBridges: string[]
}

export interface OutlookObligationItem {
  id: string
  status: string
  content: string
  updatedAt: string
  nextAction: string | null
}

export interface OutlookObligationSummary {
  openCount: number
  items: OutlookObligationItem[]
}

export interface OutlookSessionItem {
  friendId: string
  friendName: string
  channel: string
  key: string
  sessionPath: string
  lastActivityAt: string
  activitySource: "friend-facing" | "mtime-fallback"
}

export interface OutlookSessionSummary {
  liveCount: number
  items: OutlookSessionItem[]
}

export interface OutlookInnerSummary {
  visibility: typeof OUTLOOK_DEFAULT_INNER_VISIBILITY
  status: InnerJobStatus
  hasPending: boolean
  surfacedSummary: string | null
  origin: { friendId: string; channel: string; key: string; friendName?: string } | null
  obligationStatus: "pending" | "fulfilled" | null
}

export interface OutlookCodingItem {
  id: string
  runner: CodingRunner
  status: CodingSessionStatus
  checkpoint: string | null
  taskRef: string | null
  workdir: string
  originSession: CodingSessionOrigin | null
  lastActivityAt: string
}

export interface OutlookCodingSummary {
  totalCount: number
  activeCount: number
  blockedCount: number
  items: OutlookCodingItem[]
}

export interface OutlookAgentState {
  productName: typeof OUTLOOK_PRODUCT_NAME
  agentName: string
  agentRoot: string
  enabled: boolean
  provider: string | null
  senses: string[]
  freshness: OutlookFreshness
  degraded: OutlookDegradedState
  tasks: OutlookTaskSummary
  obligations: OutlookObligationSummary
  sessions: OutlookSessionSummary
  inner: OutlookInnerSummary
  coding: OutlookCodingSummary
}

export interface OutlookAgentSummary {
  agentName: string
  enabled: boolean
  freshness: OutlookFreshness
  degraded: OutlookDegradedState
  tasks: Pick<OutlookTaskSummary, "liveCount" | "blockedCount">
  obligations: Pick<OutlookObligationSummary, "openCount">
  coding: Pick<OutlookCodingSummary, "activeCount" | "blockedCount">
}

export interface OutlookMachineState {
  productName: typeof OUTLOOK_PRODUCT_NAME
  observedAt: string
  runtime: RuntimeMetadata
  agentCount: number
  freshness: OutlookFreshness
  degraded: OutlookDegradedState
  agents: OutlookAgentSummary[]
}

export interface OutlookMachineDaemonSummary {
  status: "running" | "stopped"
  health: "ok" | "warn"
  mode: "dev" | "production"
  socketPath: string
  outlookUrl: string
  entryPath: string
  workerCount: number
  senseCount: number
}

export interface OutlookMachineTotals {
  agents: number
  enabledAgents: number
  degradedAgents: number
  staleAgents: number
  liveTasks: number
  blockedTasks: number
  openObligations: number
  activeCodingAgents: number
  blockedCodingAgents: number
}

export interface OutlookEntryPoint {
  kind: "web" | "cli"
  label: string
  target: string
}

export type OutlookAttentionLevel = "degraded" | "stale" | "blocked" | "active" | "idle"
export type OutlookMachineMood = "calm" | "watchful" | "strained"

export interface OutlookAttentionSummary {
  level: OutlookAttentionLevel
  label: string
}

export interface OutlookMachineAgentView extends OutlookAgentSummary {
  attention: OutlookAttentionSummary
}

export interface OutlookMachineOverview {
  productName: typeof OUTLOOK_PRODUCT_NAME
  observedAt: string
  primaryEntryPoint: string
  daemon: OutlookMachineDaemonSummary
  runtime: RuntimeMetadata
  freshness: OutlookFreshness
  degraded: OutlookDegradedState
  totals: OutlookMachineTotals
  mood: OutlookMachineMood
  entrypoints: OutlookEntryPoint[]
}

export interface OutlookMachineView {
  overview: OutlookMachineOverview
  agents: OutlookMachineAgentView[]
}
