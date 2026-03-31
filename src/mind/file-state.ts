import { createHash } from "crypto"

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
   * Clear all cached entries.
   */
  clear(): void {
    this.entries.clear()
  }
}
