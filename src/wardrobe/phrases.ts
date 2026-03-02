// Shared phrase pools for fun loading messages.
// Phrases have NO trailing "..." -- adapters add that.
// Pools are loaded from agent.json via loadAgentConfig().
// If agent.json has no phrases, loadAgentConfig() auto-fills placeholders.

import { loadAgentConfig } from "../identity"

export interface PhrasePools {
  thinking: string[]
  tool: string[]
  followup: string[]
}

// Returns phrase pools from agent.json (always present — loadAgentConfig auto-fills).
export function getPhrases(): PhrasePools {
  return loadAgentConfig().phrases
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
