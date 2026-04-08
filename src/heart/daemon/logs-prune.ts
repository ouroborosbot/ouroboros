import { existsSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"

import {
  DEFAULT_MAX_GENERATIONS,
  DEFAULT_MAX_LOG_SIZE_BYTES,
  rotateIfNeeded,
} from "../../nerves"
import { emitNervesEvent } from "../../nerves/runtime"
import { getAgentDaemonLogsDir } from "../identity"

/**
 * Apply the current rotation policy to every `.ndjson` file in the daemon
 * logs directory, compacting any file that's over the threshold.
 *
 * Concurrent-writer safety
 * ------------------------
 * This helper drives `rotateIfNeeded`, which uses a rename-then-gzip pattern:
 * the active file is renamed first (the inode stays alive for any open writer
 * fd), and the rename target is then gzipped. An active writer keeps writing
 * to its original fd until its next stat check, at which point it sees the
 * path is gone and creates a fresh file. No additional locking is needed.
 *
 * This makes `ouro logs prune` safe to run while the daemon is up: worst
 * case, the last few events before the stat-check cycle end up in an
 * orphaned inode that the writer will release on its next file cycle.
 */
export interface PruneDaemonLogsOptions {
  /** Defaults to the canonical agent daemon logs dir for the active agent. */
  logsDir?: string
  /** Override the rotation threshold. Default: 25 MB. */
  maxSizeBytes?: number
  /** Override the generation cap. Default: 5. */
  maxGenerations?: number
  /** Override the agent name used to resolve the default logs dir. */
  agentName?: string
}

export interface PruneDaemonLogsResult {
  filesCompacted: number
  bytesFreed: number
}

export function pruneDaemonLogs(options: PruneDaemonLogsOptions = {}): PruneDaemonLogsResult {
  const logsDir = options.logsDir ?? getAgentDaemonLogsDir(options.agentName)
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_LOG_SIZE_BYTES
  const maxGenerations = options.maxGenerations ?? DEFAULT_MAX_GENERATIONS
  const traceId = randomUUID()

  emitNervesEvent({
    component: "nerves",
    event: "nerves.logs_prune_start",
    trace_id: traceId,
    message: "pruning daemon logs",
    meta: { logsDir, maxSizeBytes, maxGenerations },
  })

  let completed = false
  try {
    if (!existsSync(logsDir)) {
      completed = true
      emitNervesEvent({
        component: "nerves",
        event: "nerves.logs_prune_end",
        trace_id: traceId,
        message: "daemon logs dir does not exist",
        meta: { logsDir, filesCompacted: 0, bytesFreed: 0 },
      })
      return { filesCompacted: 0, bytesFreed: 0 }
    }

    let filesCompacted = 0
    let bytesFreed = 0

    // Enumerate and rotate each active .ndjson stream. We explicitly skip
    // .gz and other files — only the active stream can be a rotation
    // candidate. Legacy .N.ndjson uncompressed files are handled inside
    // rotateIfNeeded's generation-shift step, so we skip them here to
    // avoid double-rotating.
    for (const name of readdirSync(logsDir)) {
      if (!name.endsWith(".ndjson")) continue
      // Skip legacy generation files like daemon.1.ndjson; rotateIfNeeded
      // will migrate them on the next rotation of their parent stream.
      if (/\.\d+\.ndjson$/.test(name)) continue

      const filePath = join(logsDir, name)
      let sizeBefore: number
      try {
        sizeBefore = statSync(filePath).size
      } catch {
        continue
      }

      if (sizeBefore < maxSizeBytes) continue

      const rotated = rotateIfNeeded(filePath, {
        maxSizeBytes,
        maxGenerations,
        compress: true,
      })
      if (rotated) {
        filesCompacted += 1
        bytesFreed += sizeBefore
      }
    }

    completed = true
    emitNervesEvent({
      component: "nerves",
      event: "nerves.logs_prune_end",
      trace_id: traceId,
      message: "daemon logs pruned",
      meta: { logsDir, filesCompacted, bytesFreed },
    })
    return { filesCompacted, bytesFreed }
  } catch (err) {
    if (!completed) {
      const reason = err instanceof Error ? err.message : String(err)
      emitNervesEvent({
        component: "nerves",
        event: "nerves.logs_prune_error",
        trace_id: traceId,
        level: "error",
        message: "daemon logs prune failed",
        meta: { logsDir, error: reason },
      })
    }
    throw err
  }
}
