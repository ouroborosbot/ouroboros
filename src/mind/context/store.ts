// Friend store abstraction.
// All friend persistence goes through FriendStore -- no friend module imports `fs` directly.
// Domain-specific methods replace the old generic CollectionStore approach.

import type { FriendRecord } from "./types"

// Domain-specific store for friend records.
// Implementations handle the PII split internally.
export interface FriendStore {
  get(id: string): Promise<FriendRecord | null>
  put(id: string, record: FriendRecord): Promise<void>
  delete(id: string): Promise<void>
  findByExternalId(provider: string, externalId: string, tenantId?: string): Promise<FriendRecord | null>
}

// ============================================================
// DEPRECATED: Legacy interfaces kept for backward compat during migration.
// These will be removed as consumers are updated (Units 2-11).
// ============================================================

import type { FriendIdentity, FriendMemory } from "./types"

/** @deprecated Use FriendStore instead */
export interface CollectionStore<T> {
  get(id: string): Promise<T | null>
  put(id: string, value: T): Promise<void>
  delete(id: string): Promise<void>
  find(predicate: (value: T) => boolean): Promise<T | null>
}

/** @deprecated Use FriendStore instead */
export interface ContextStore {
  readonly identity: CollectionStore<FriendIdentity>
  readonly memory: CollectionStore<FriendMemory>
}
