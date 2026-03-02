// Shared phrase pools for fun loading messages.
// Phrases have NO trailing "..." -- adapters add that.

import { loadAgentConfig } from "../identity"

export const THINKING_PHRASES = [
  "chewing on that",
  "consulting the chaos gods",
  "untangling neurons",
  "snake eating its own thoughts",
  "brewing something dangerous",
  "calculating optimal chaos",
  "loading personality module",
  "summoning the answer demons",
]

export const TOOL_PHRASES = [
  "rummaging through files",
  "poking around in there",
  "doing science",
  "hold my semicolons",
  "the snake is in the codebase",
  "performing surgery",
]

export const FOLLOWUP_PHRASES = [
  "digesting results",
  "processing the chaos",
  "connecting the dots",
  "almost done being clever",
]

export interface PhrasePools {
  thinking: string[]
  tool: string[]
  followup: string[]
}

// Returns phrase pools from agent.json, falling back to hardcoded defaults.
export function getPhrases(): PhrasePools {
  const config = loadAgentConfig()
  return {
    thinking: config.phrases?.thinking ?? THINKING_PHRASES,
    tool: config.phrases?.tool ?? TOOL_PHRASES,
    followup: config.phrases?.followup ?? FOLLOWUP_PHRASES,
  }
}

// Pick a random phrase from a pool, avoiding immediate repeats.
export function pickPhrase(pool: readonly string[], lastUsed?: string): string {
  if (pool.length === 0) return ""
  if (pool.length === 1) return pool[0]
  let pick: string
  do {
    pick = pool[Math.floor(Math.random() * pool.length)]
  } while (pick === lastUsed)
  return pick
}
