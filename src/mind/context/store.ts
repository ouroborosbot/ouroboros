// Context store abstraction.
// All context persistence goes through ContextStore -- no context module imports `fs` directly.
// Phase 1: identity collection only. Phase 3 adds memory.

import type { FriendIdentity, FriendMemory } from "./types"

// Generic CRUD + find for a collection of items keyed by string ID.
export interface CollectionStore<T> {
  get(id: string): Promise<T | null>
  put(id: string, value: T): Promise<void>
  delete(id: string): Promise<void>
  find(predicate: (value: T) => boolean): Promise<T | null>
}

// Top-level store with typed collection properties.
// Adding a new persisted type = add one readonly property.
export interface ContextStore {
  readonly identity: CollectionStore<FriendIdentity>
  readonly memory: CollectionStore<FriendMemory>
}
