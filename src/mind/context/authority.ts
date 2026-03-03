// AuthorityChecker -- per-turn authority checker.
// Hybrid model: optimistic reads (attempt and learn from 403),
// pre-flight writes (probe Security Namespaces API before proposing).
// Created at resolve time, discarded after the turn completes.
// No cross-turn caching -- conversation carries authority knowledge.

import type { AuthorityChecker } from "./types"

/** Probe function signature: resolves to true if write is allowed. */
export type ProbeFunction = (integration: string, scope: string, action: string) => Promise<boolean>

/**
 * Create an AuthorityChecker for a single turn.
 * @param probe - function that probes the Security Namespaces API for write permissions
 */
export function createAuthorityChecker(probe: ProbeFunction): AuthorityChecker {
  // Track 403s observed during this turn: key = "integration:scope"
  const denied = new Set<string>()

  // Memoize write probe results: key = "integration:scope:action"
  const writeCache = new Map<string, Promise<boolean>>()

  function scopeKey(integration: string, scope: string): string {
    return `${integration}:${scope}`
  }

  function writeKey(integration: string, scope: string, action: string): string {
    return `${integration}:${scope}:${action}`
  }

  return {
    canRead(integration: string, scope: string): boolean {
      return !denied.has(scopeKey(integration, scope))
    },

    canWrite(integration: string, scope: string, action: string): Promise<boolean> {
      const key = writeKey(integration, scope, action)
      const cached = writeCache.get(key)
      if (cached) return cached

      // Fire probe; on error, assume optimistic (D16 error handling)
      const result = probe(integration, scope, action).catch(() => true)
      writeCache.set(key, result)
      return result
    },

    record403(integration: string, scope: string, _action: string): void {
      denied.add(scopeKey(integration, scope))
    },
  }
}
