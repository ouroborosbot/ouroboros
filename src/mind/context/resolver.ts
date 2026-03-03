// ContextResolver -- resolves identity + channel into a ResolvedContext.
// Created per-request (per-incoming-message), per-friend.
// Phase 1: identity + channel. Phase 2 adds authority. Phase 3 adds memory.

import type { ContextStore } from "./store"
import type { IdentityProvider, ResolvedContext } from "./types"
import { resolveIdentity } from "./identity"
import { getChannelCapabilities } from "./channel"

export interface ContextResolverParams {
  provider: IdentityProvider
  externalId: string
  tenantId?: string
  displayName: string
  channel: string
}

export class ContextResolver {
  private readonly store: ContextStore
  private readonly params: ContextResolverParams

  constructor(store: ContextStore, params: ContextResolverParams) {
    this.store = store
    this.params = params
  }

  async resolve(): Promise<ResolvedContext> {
    const identity = await resolveIdentity(this.store.identity, {
      provider: this.params.provider,
      externalId: this.params.externalId,
      tenantId: this.params.tenantId,
      displayName: this.params.displayName,
    })

    const channel = getChannelCapabilities(this.params.channel)

    return { identity, channel }
  }
}
