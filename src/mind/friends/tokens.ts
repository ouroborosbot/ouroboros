// Token accumulation helper.
// Tracks cumulative token usage per friend across turns.
// Called from both CLI and Teams adapters after each agent turn.

import type { FriendStore } from "./store"
import type { UsageData } from "../context"

export async function accumulateFriendTokens(
  store: FriendStore,
  friendId: string,
  usage?: UsageData,
): Promise<void> {
  if (!usage?.total_tokens) return

  const record = await store.get(friendId)
  if (!record) return

  record.totalTokens = (record.totalTokens ?? 0) + usage.total_tokens
  record.updatedAt = new Date().toISOString()
  await store.put(record.id, record)
}
