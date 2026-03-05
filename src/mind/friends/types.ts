// Context kernel type definitions.
// FriendRecord (merged identity + memory), channel capabilities, and resolved context.

import { emitNervesEvent } from "../../nerves/runtime"

// -- Identity Provider --
// Closed union: "aad" (Azure AD / Teams), "local" (CLI / OS), "teams-conversation" (fallback)
export type IdentityProvider = "aad" | "local" | "teams-conversation"

const IDENTITY_PROVIDERS: ReadonlySet<string> = new Set<IdentityProvider>(["aad", "local", "teams-conversation"])

export function isIdentityProvider(value: unknown): value is IdentityProvider {
  emitNervesEvent({
    component: "friends",
    event: "friends.identity_provider_check",
    message: "identity provider validation",
    meta: {},
  })
  return typeof value === "string" && IDENTITY_PROVIDERS.has(value)
}

// -- Integration --
// Closed union: which external service an action targets
export type Integration = "ado" | "github" | "graph"

const INTEGRATIONS: ReadonlySet<string> = new Set<Integration>(["ado", "github", "graph"])

export function isIntegration(value: unknown): value is Integration {
  return typeof value === "string" && INTEGRATIONS.has(value)
}

// -- External ID --
// Links an internal FriendRecord to an external system identity
export interface ExternalId {
  provider: IdentityProvider
  externalId: string
  tenantId?: string
  linkedAt: string // ISO date
}

// -- Friend Record --
// The single merged type for a person the agent interacts with.
// Combines identity (who they are) and memory (what the agent knows about them).
// Split across two storage backends by PII boundary.
export interface FriendRecord {
  id: string                              // stable UUID
  name: string
  externalIds: ExternalId[]               // PII
  tenantMemberships: string[]             // PII
  toolPreferences: Record<string, string> // keyed by integration name
  notes: Record<string, { value: string, savedAt: string }> // general friend knowledge (timestamped)
  totalTokens: number                     // cumulative token usage across all turns
  createdAt: string                       // ISO date
  updatedAt: string
  schemaVersion: number
}

// -- Channel Capabilities --
// What a channel supports: integrations, formatting, streaming, message limits
export interface ChannelCapabilities {
  channel: "cli" | "teams"
  availableIntegrations: Integration[]
  supportsMarkdown: boolean
  supportsStreaming: boolean
  supportsRichCards: boolean
  maxMessageLength: number
}

// -- Resolved Context --
// The per-request bundle resolved by the FriendResolver.
export interface ResolvedContext {
  readonly friend: FriendRecord
  readonly channel: ChannelCapabilities
}
