// ContextResolver -- resolves identity + channel into a ResolvedContext.
// Created per-request (per-incoming-message), per-friend.
// Phase 1: identity + channel. Phase 2 adds authority. Phase 3 adds memory.

import type { ContextStore } from "./store"
import type { IdentityProvider, ResolvedContext } from "./types"
import { resolveIdentity } from "./identity"
import { getChannelCapabilities } from "./channel"
import { createAuthorityChecker } from "./authority"
import type { ProbeFunction } from "./authority"

export interface ContextResolverParams {
  provider: IdentityProvider
  externalId: string
  tenantId?: string
  displayName: string
  channel: string
}

// Default probe function: always returns true (optimistic).
// Unit 2B will wire this to the actual Security Namespaces API.
const defaultProbe: ProbeFunction = async () => true

export class ContextResolver {
  private readonly store: ContextStore
  private readonly params: ContextResolverParams
  private readonly probe: ProbeFunction

  constructor(store: ContextStore, params: ContextResolverParams, probe?: ProbeFunction) {
    this.store = store
    this.params = params
    this.probe = probe ?? defaultProbe
  }

  async resolve(): Promise<ResolvedContext> {
    const identity = await resolveIdentity(this.store.identity, {
      provider: this.params.provider,
      externalId: this.params.externalId,
      tenantId: this.params.tenantId,
      displayName: this.params.displayName,
    })

    const channel = getChannelCapabilities(this.params.channel)

    // Create authority checker only when integrations are available (Teams).
    // CLI pays zero cost -- no checker created.
    const checker = channel.availableIntegrations.length > 0
      ? createAuthorityChecker(this.probe)
      : undefined

    return { identity, channel, checker }
  }
}
