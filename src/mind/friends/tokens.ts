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
  if (!usage?.output_tokens) return

  const record = await store.get(friendId)
  if (!record) return

  // Only count output tokens (what the model generated for this friend).
  // Input tokens are mostly system prompt re-sent every turn -- counting them
  // would inflate the total and make the onboarding threshold meaningless.
  record.totalTokens = (record.totalTokens ?? 0) + usage.output_tokens
  record.updatedAt = new Date().toISOString()
  await store.put(record.id, record)
}
