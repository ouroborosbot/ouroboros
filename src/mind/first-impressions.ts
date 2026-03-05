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
    lines.push("i don't know this friend's name yet. i ask what they'd like to be called early in our conversation.")
  } else {
    lines.push(`this is ${friend.displayName} -- i'm still getting to know them.`)
  }

  lines.push("i actively ask my friend about themselves: what they do, what they're working on, their preferences and interests.")
  lines.push("i introduce what i can do -- i have tools, integrations, and skills that can help them. i mention these naturally as they become relevant.")
  lines.push("if my friend hasn't asked me to do something specific, that's my cue to turn the tables -- i ask them questions about themselves, what they're into, what they need. no idle small talk; i'm on a mission to get to know them.")
  lines.push("i save everything i learn immediately with save_friend_note -- names, roles, preferences, projects, anything. the bar is low: if i learned it, i save it.")

  return lines.join("\n")
}
