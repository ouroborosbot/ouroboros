// AuthorityChecker -- per-turn authority checker.
// Hybrid model: optimistic reads (attempt and learn from 403),
// pre-flight writes (probe Security Namespaces API before proposing).
// Created at resolve time, discarded after the turn completes.
// No cross-turn caching -- conversation carries authority knowledge.

import type { AuthorityChecker } from "./types"

/** Probe function signature: resolves to true if write is allowed. */
export type ProbeFunction = (integration: string, scope: string, action: string) => Promise<boolean>

// -- ADO Security Namespaces permission mapping --
// Maps agent-level action names to ADO Security Namespace + permission bit.
// Permission bits are from the WorkItemTracking security namespace.
// See: https://learn.microsoft.com/en-us/azure/devops/organizations/security/namespace-reference
export interface PermissionMapping {
  namespace: string
  bit: number
}

export const ADO_ACTION_MAP: Record<string, PermissionMapping> = {
  createWorkItem:  { namespace: "WorkItemTracking", bit: 2 },   // CREATE_WORK_ITEMS
  updateWorkItem:  { namespace: "WorkItemTracking", bit: 4 },   // EDIT_WORK_ITEMS
  deleteWorkItem:  { namespace: "WorkItemTracking", bit: 8 },   // DELETE_WORK_ITEMS
  reparentItems:   { namespace: "WorkItemTracking", bit: 4 },   // EDIT_WORK_ITEMS (reparent is edit)
}

const ADO_BASE = "https://dev.azure.com"
const ADO_API_VERSION = "api-version=7.1"

// Work Item Tracking security namespace ID (well-known constant in ADO).
const WIT_NAMESPACE_ID = "73e71c45-d483-40d5-bdba-62fd076f7f87"

interface AclEntry {
  acesDictionary?: Record<string, { allow?: number }>
}

interface AclResponse {
  value?: AclEntry[]
}

/**
 * Create a concrete ADO probe function that calls the Security Namespaces API.
 * Returns a ProbeFunction that can be passed to createAuthorityChecker.
 */
export function createAdoProbe(token: string): ProbeFunction {
  return async (integration: string, scope: string, action: string): Promise<boolean> => {
    // Only probe ADO integration
    if (integration !== "ado") return true

    // Look up the action mapping
    const mapping = ADO_ACTION_MAP[action]
    if (!mapping) return true // Unknown action: optimistic

    try {
      // Query the Access Control Lists API for the WorkItemTracking namespace
      const url = `${ADO_BASE}/${scope}/_apis/security/accesscontrollists/${WIT_NAMESPACE_ID}?${ADO_API_VERSION}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      // On any error status, return optimistic (D16 error handling)
      if (!res.ok) return true

      const data: AclResponse = await res.json()

      // If no ACLs returned, return optimistic
      if (!data.value || data.value.length === 0) return true

      // Check if any ACE grants the required permission bit
      const acl = data.value[0]
      if (!acl.acesDictionary) return true

      const entries = Object.values(acl.acesDictionary)
      if (entries.length === 0) return true

      // Check if the permission bit is set in any ACE's allow mask
      return entries.some((ace) => ((ace.allow ?? 0) & mapping.bit) !== 0)
    } catch {
      // Network error, timeout, etc. -- optimistic
      return true
    }
  }
}

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
