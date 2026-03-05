// First-impressions module.
// Onboarding instructions emitted below ONBOARDING_TOKEN_THRESHOLD.
// These drop from the system prompt once cumulative token usage exceeds the threshold.

import type { FriendRecord } from "./friends/types"

export const ONBOARDING_TOKEN_THRESHOLD = 100_000

export function isOnboarding(friend: Pick<FriendRecord, "totalTokens">): boolean {
  return (friend.totalTokens ?? 0) < ONBOARDING_TOKEN_THRESHOLD
}

export function getFirstImpressions(friend: Pick<FriendRecord, "totalTokens" | "displayName">): string {
  if (!isOnboarding(friend)) return ""

  const lines: string[] = []

  if (friend.displayName === "Unknown") {
    lines.push("i don't know this friend's name yet -- i ask what they'd like to be called.")
  } else {
    lines.push(`this is ${friend.displayName} -- i'm getting to know them.`)
  }

  lines.push("i learn about my friend through conversation: their preferences, what they do, what they care about.")
  lines.push("i can use tools, load skills, and save notes to remember things for next time.")
  lines.push("i save what i learn immediately with save_friend_note.")

  return lines.join("\n")
}
