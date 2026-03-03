// Context kernel type definitions.
// All layer types (Identity, Authority, Memory, Channel) and the resolved context.

// -- Identity Provider --
// Closed union: "aad" (Azure AD / Teams) or "local" (CLI / OS)
export type IdentityProvider = "aad" | "local"

const IDENTITY_PROVIDERS: ReadonlySet<string> = new Set<IdentityProvider>(["aad", "local"])

export function isIdentityProvider(value: unknown): value is IdentityProvider {
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
// Links an internal FriendIdentity to an external system identity
export interface ExternalId {
  provider: IdentityProvider
  externalId: string
  tenantId?: string
  linkedAt: string // ISO date
}

// -- Friend Identity --
// The stable internal record for a person the agent interacts with
export interface FriendIdentity {
  id: string          // internal, stable, uuid
  displayName: string
  externalIds: ExternalId[]
  tenantMemberships: string[]  // AAD tenant IDs
  createdAt: string   // ISO date
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
// The per-request bundle resolved by the ContextResolver.
// Phase 1: identity + channel only.
// Phase 2 adds authority, Phase 3 adds memory.
export interface ResolvedContext {
  readonly identity: FriendIdentity
  readonly channel: ChannelCapabilities
}
