// Friend memory resolution.
// Loads FriendMemory from the context store for a given identity.
// On failure or missing: returns null (D16 graceful handling).

import type { CollectionStore } from "./store"
import type { FriendIdentity, FriendMemory } from "./types"

/**
 * Resolve friend memory for a given identity.
 * Returns null if no memory exists or on any read error.
 */
export async function resolveMemory(
  store: CollectionStore<FriendMemory>,
  identity: FriendIdentity,
): Promise<FriendMemory | null> {
  try {
    return await store.get(identity.id)
  } catch {
    return null
  }
}
