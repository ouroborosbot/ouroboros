// Identity resolution -- get-or-create logic mapping external IDs to internal FriendIdentity.
// This is the only layer that truly needs persistence (UUID <-> external ID can't be re-derived).

import { randomUUID } from "crypto"
import type { CollectionStore } from "./store"
import type { FriendIdentity, IdentityProvider, ExternalId } from "./types"

export interface ResolveIdentityParams {
  provider: IdentityProvider
  externalId: string
  tenantId?: string
  displayName: string
}

const CURRENT_SCHEMA_VERSION = 1

export async function resolveIdentity(
  store: CollectionStore<FriendIdentity>,
  params: ResolveIdentityParams
): Promise<FriendIdentity> {
  // Try to find existing identity by external ID
  let existing: FriendIdentity | null = null
  try {
    existing = await store.find((identity) =>
      identity.externalIds.some(
        (ext) =>
          ext.provider === params.provider &&
          ext.externalId === params.externalId &&
          (params.tenantId === undefined || ext.tenantId === params.tenantId)
      )
    )
  } catch {
    // Store read failure -- fall through to create new identity (D16)
  }

  if (existing) return existing

  // Create new identity
  const now = new Date().toISOString()
  const externalId: ExternalId = {
    provider: params.provider,
    externalId: params.externalId,
    linkedAt: now,
    ...(params.tenantId !== undefined ? { tenantId: params.tenantId } : {}),
  }

  const tenantMemberships: string[] =
    params.provider === "aad" && params.tenantId ? [params.tenantId] : []

  const identity: FriendIdentity = {
    id: randomUUID(),
    displayName: params.displayName,
    externalIds: [externalId],
    tenantMemberships,
    createdAt: now,
    updatedAt: now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  }

  // Persist -- log and continue on failure (D16)
  try {
    await store.put(identity.id, identity)
  } catch (err) {
    console.error("failed to persist friend identity:", err)
  }

  return identity
}
