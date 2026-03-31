import { createHash } from "crypto"
import { statSync, readFileSync } from "fs"

/** Compute sha256 hex hash of content */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

export interface FileStateCacheEntry {
  hash: string
  mtime: number
  offset?: number
  limit?: number
  fullRead: boolean
  recordedAt: number
}

/**
 * Session-scoped LRU cache tracking file reads.
 * Stores content hashes (not full content) to limit memory.
 * Keyed by absolute file path.
 */
export class FileStateCache {
  private entries: Map<string, FileStateCacheEntry>
  private maxSize: number

  constructor(maxSize: number = 50) {
    this.entries = new Map()
    this.maxSize = maxSize
  }

  /**
   * Record a file read. Computes content hash and stores metadata.
   */
  record(
    filePath: string,
    content: string,
    mtime: number,
    offset?: number,
    limit?: number,
  ): void {
    // If key already exists, delete it so re-insertion moves it to end (most recent)
    if (this.entries.has(filePath)) {
      this.entries.delete(filePath)
    }

    const hash = createHash("sha256").update(content).digest("hex")
    const fullRead = offset === undefined && limit === undefined

    this.entries.set(filePath, {
      hash,
      mtime,
      offset: fullRead ? undefined : offset,
      limit: fullRead ? undefined : limit,
      fullRead,
      recordedAt: Date.now(),
    })

    // Evict LRU (first entry in Map iteration order) if over capacity
    if (this.entries.size > this.maxSize) {
      const firstKey = this.entries.keys().next().value as string
      this.entries.delete(firstKey)
    }
  }

  /**
   * Get the cached state for a file path. Also promotes it in LRU order.
   */
  get(filePath: string): FileStateCacheEntry | undefined {
    const entry = this.entries.get(filePath)
    if (entry === undefined) return undefined

    // Promote to most-recently-used by re-inserting
    this.entries.delete(filePath)
    this.entries.set(filePath, entry)
    return entry
  }

  /**
   * Check if a file has been modified since the last recorded read.
   * Uses mtime as primary signal, content hash as fallback for cloud sync / touch scenarios.
   * Returns { stale: false } if the path is not in cache or the file cannot be stat'd.
   */
  isStale(filePath: string): { stale: boolean; reason?: string } {
    const entry = this.entries.get(filePath)
    if (entry === undefined) return { stale: false }

    let currentMtime: number
    try {
      currentMtime = statSync(filePath).mtimeMs
    } catch {
      // File doesn't exist or can't be stat'd -- no basis for staleness
      return { stale: false }
    }

    // Fast path: mtime unchanged means not stale
    if (currentMtime === entry.mtime) return { stale: false }

    // mtime differs -- check content hash as fallback (handles touch / cloud sync)
    try {
      const currentContent = readFileSync(filePath, "utf-8")
      const currentHash = createHash("sha256").update(currentContent).digest("hex")
      if (currentHash === entry.hash) return { stale: false }
      return { stale: true, reason: `file modified since last read (mtime and content differ)` }
    } catch {
      // Can't read file -- treat as not stale (file may have been deleted)
      return { stale: false }
    }
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.entries.clear()
  }
}

/** Session-scoped singleton instance used by tool handlers */
export const fileStateCache = new FileStateCache()
