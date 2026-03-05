// FriendResolver -- resolves external identity into a FriendRecord + channel capabilities.
// Created per-request (per-incoming-message), per-friend.
// Replaces the old ContextResolver: no authority checker, no separate memory resolution.

import { randomUUID } from "crypto"
import type { FriendStore } from "./store"
import type { IdentityProvider, FriendRecord, ResolvedContext, ExternalId } from "./types"
import { getChannelCapabilities } from "./channel"

export interface FriendResolverParams {
  provider: IdentityProvider
  externalId: string
  tenantId?: string
  displayName: string
  channel: string
}

const CURRENT_SCHEMA_VERSION = 1

export class FriendResolver {
  private readonly store: FriendStore
  private readonly params: FriendResolverParams

  constructor(store: FriendStore, params: FriendResolverParams) {
    this.store = store
    this.params = params
  }

  async resolve(): Promise<ResolvedContext> {
    const friend = await this.resolveOrCreate()
    const channel = getChannelCapabilities(this.params.channel)
    return { friend, channel }
  }

  private async resolveOrCreate(): Promise<FriendRecord> {
    // Try to find existing friend by external ID
    let existing: FriendRecord | null = null
    try {
      existing = await this.store.findByExternalId(
        this.params.provider,
        this.params.externalId,
        this.params.tenantId,
      )
    } catch {
      // Store search failure -- fall through to create new (D16)
    }

    if (existing) return existing

    // First encounter -- create new FriendRecord
    const now = new Date().toISOString()
    const externalId: ExternalId = {
      provider: this.params.provider,
      externalId: this.params.externalId,
      linkedAt: now,
      ...(this.params.tenantId !== undefined ? { tenantId: this.params.tenantId } : {}),
    }

    const tenantMemberships: string[] =
      this.params.tenantId ? [this.params.tenantId] : []

    const friend: FriendRecord = {
      id: randomUUID(),
      name: this.params.displayName,
      externalIds: [externalId],
      tenantMemberships,
      toolPreferences: {},
      notes: this.params.displayName !== "Unknown" ? { name: { value: this.params.displayName, savedAt: now } } : {},
      totalTokens: 0,
      createdAt: now,
      updatedAt: now,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    }

    // Persist -- log and continue on failure (D16)
    try {
      await this.store.put(friend.id, friend)
    } catch (err) {
      console.error("failed to persist friend record:", err)
    }

    return friend
  }
}
