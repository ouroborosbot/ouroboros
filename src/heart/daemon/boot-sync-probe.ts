/**
 * Boot sync probe — Layer 2 orchestrator for `ouro up`.
 *
 * For each sync-enabled bundle, runs `preTurnPullAsync` wrapped in
 * `runWithTimeouts`, classifies failures via `classifySyncFailure`, and
 * returns aggregated findings. Findings flow into the daemon rollup
 * (`computeDaemonRollup`) and into the boot TUI rendering.
 *
 * The probe NEVER:
 *   - Writes to `state/` (verified by Unit 7's grep gate).
 *   - Throws — every failure becomes a finding.
 *   - Hangs — `AbortSignal` from `runWithTimeouts` cuts hung remotes
 *     within `hardMs`.
 *
 * Advisory vs blocking classifications:
 *
 *   | classification         | advisory? | rationale                                   |
 *   | ---------------------- | --------- | ------------------------------------------- |
 *   | auth-failed            | no        | agent can't sync; needs human intervention  |
 *   | not-found-404          | no        | remote is gone; needs human intervention    |
 *   | network-down           | no        | agent can't reach the remote at all         |
 *   | timeout-hard           | no        | abort cut the op; remote is hung            |
 *   | dirty-working-tree     | yes       | local edits prevent merge; agent still runs |
 *   | non-fast-forward       | yes       | local commits ahead; agent still runs       |
 *   | merge-conflict         | yes       | rebase failed; needs cleanup                |
 *   | timeout-soft           | yes       | warning surfaced, op completed              |
 *   | unknown                | yes       | unrecognised; surface for diagnosis         |
 *
 * "advisory: yes" => downgrade rollup `healthy` -> `partial`.
 * "advisory: no"  => agent counts as not-serving in the rollup.
 */

import * as path from "path"
import { preTurnPullAsync } from "../sync"
import type { SyncConfig } from "../config"
import type { BundleSyncRow } from "./agent-discovery"
import { classifySyncFailure, type SyncClassification } from "../sync-classification"
import { runWithTimeouts } from "../timeouts"
import { emitNervesEvent } from "../../nerves/runtime"

/** Default soft / hard timeout windows for the boot git op. Matches Layer 2 O1 lock. */
const DEFAULT_SOFT_MS = 8000
const DEFAULT_HARD_MS = 15000

const BLOCKING_CLASSIFICATIONS: ReadonlySet<SyncClassification> = new Set<SyncClassification>([
  "auth-failed",
  "not-found-404",
  "network-down",
  "timeout-hard",
])

export interface BootSyncProbeFinding {
  agent: string
  classification: SyncClassification
  /** Original error text (or synthesised text for advisory findings). */
  error: string
  conflictFiles: string[]
  warnings: string[]
  /**
   * `true` => downgrade healthy -> partial. `false` => the agent should be
   * counted as not-serving in the rollup. See module-level table for the
   * mapping.
   */
  advisory: boolean
}

export interface BootSyncProbeResult {
  findings: BootSyncProbeFinding[]
  durationMs: number
}

export interface RunBootSyncProbeOptions {
  /** Bundles directory (the `<name>.ouro` parent). */
  bundlesRoot: string
  /** Soft-timeout override (defaults to 8s; env knob `OURO_BOOT_TIMEOUT_GIT_SOFT`). */
  softMs?: number
  /** Hard-timeout override (defaults to 15s; env knob `OURO_BOOT_TIMEOUT_GIT_HARD`). */
  hardMs?: number
}

function isAdvisory(classification: SyncClassification): boolean {
  return !BLOCKING_CLASSIFICATIONS.has(classification)
}

/**
 * Probe sync state for every enabled, git-initialised bundle. Returns
 * findings for every non-clean result. Probes run sequentially (not in
 * parallel) so the boot path's progress reporter has a stable per-agent
 * narrative; the per-probe hard cap means worst-case total wait is
 * `bundles.length * hardMs`, which is acceptable for typical 1-3 agent
 * deployments.
 */
export async function runBootSyncProbe(
  bundles: BundleSyncRow[],
  options: RunBootSyncProbeOptions,
): Promise<BootSyncProbeResult> {
  const startedAt = Date.now()
  const softMs = options.softMs ?? DEFAULT_SOFT_MS
  const hardMs = options.hardMs ?? DEFAULT_HARD_MS

  emitNervesEvent({
    component: "daemon",
    event: "daemon.boot_sync_probe_start",
    message: "boot sync probe starting",
    meta: { bundleCount: bundles.length, softMs, hardMs },
  })

  const findings: BootSyncProbeFinding[] = []

  for (const bundle of bundles) {
    if (!bundle.enabled) continue

    const agentRoot = path.join(options.bundlesRoot, `${bundle.agent}.ouro`)

    // gitInitialized=false: bundle is enabled for sync but never had `git init`.
    // Surface as advisory finding without invoking git.
    if (bundle.gitInitialized === false) {
      findings.push({
        agent: bundle.agent,
        classification: "unknown",
        error: `bundle is not a git repo; run \`git init\` inside ${agentRoot} to enable sync (or disable sync in agent.json)`,
        conflictFiles: [],
        warnings: [],
        advisory: true,
      })
      continue
    }

    const syncConfig: SyncConfig = { enabled: bundle.enabled, remote: bundle.remote }

    const outcome = await runWithTimeouts(
      (signal) => preTurnPullAsync(agentRoot, syncConfig, { signal }),
      { softMs, hardMs, label: `boot-sync-probe ${bundle.agent}`, envKey: "GIT" },
    )

    // Hard timeout — the probe was aborted. Synthesise a finding from the
    // outcome's classification (the underlying `preTurnPullAsync` may also
    // have rejected with an AbortError, but the wrapper already swallowed
    // it).
    if (outcome.classification === "timeout-hard") {
      findings.push({
        agent: bundle.agent,
        classification: "timeout-hard",
        error: `boot sync probe for ${bundle.agent} aborted after ${hardMs}ms hard timeout`,
        conflictFiles: [],
        warnings: outcome.warnings,
        advisory: isAdvisory("timeout-hard"),
      })
      continue
    }

    const result = outcome.result
    /* v8 ignore start -- defensive: exclusive state from runWithTimeouts contract — either result or classification, never both undefined @preserve */
    if (!result) {
      findings.push({
        agent: bundle.agent,
        classification: "unknown",
        error: "boot sync probe returned without result or classification",
        conflictFiles: [],
        warnings: outcome.warnings,
        advisory: true,
      })
      continue
    }
    /* v8 ignore stop */

    if (!result.ok) {
      const classification = classifySyncFailure(
        new Error(result.error ?? "unknown sync error"),
        { agentRoot },
      )
      findings.push({
        agent: bundle.agent,
        classification: classification.classification,
        error: classification.error,
        conflictFiles: classification.conflictFiles,
        warnings: outcome.warnings,
        advisory: isAdvisory(classification.classification),
      })
      continue
    }

    // Probe succeeded. If the soft warning fired, surface it as an advisory
    // finding so the operator sees the slow-pull warning even on success.
    if (outcome.warnings.length > 0) {
      findings.push({
        agent: bundle.agent,
        classification: "timeout-soft",
        error: outcome.warnings.join("; "),
        conflictFiles: [],
        warnings: outcome.warnings,
        advisory: true,
      })
    }
  }

  // Stable order — sort by agent name so renderers and tests see the same
  // sequence.
  findings.sort((a, b) => a.agent.localeCompare(b.agent))

  const durationMs = Date.now() - startedAt

  emitNervesEvent({
    component: "daemon",
    event: "daemon.boot_sync_probe_end",
    message: "boot sync probe complete",
    meta: { findingCount: findings.length, durationMs },
  })

  return { findings, durationMs }
}
