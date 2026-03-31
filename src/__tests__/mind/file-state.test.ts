import { describe, it, expect, beforeEach } from "vitest"
import { FileStateCache } from "../../mind/file-state"

describe("FileStateCache", () => {
  let cache: FileStateCache

  beforeEach(() => {
    cache = new FileStateCache()
  })

  describe("record and get", () => {
    it("stores entry and retrieves it by path", () => {
      cache.record("/tmp/foo.ts", "hello world", 1234567890)
      const entry = cache.get("/tmp/foo.ts")
      expect(entry).toBeDefined()
      expect(entry!.hash).toBeTypeOf("string")
      expect(entry!.hash.length).toBe(64) // sha256 hex
      expect(entry!.mtime).toBe(1234567890)
      expect(entry!.fullRead).toBe(true)
    })

    it("returns undefined for nonexistent path", () => {
      expect(cache.get("/tmp/nonexistent.ts")).toBeUndefined()
    })

    it("stores content hash, not full content", () => {
      cache.record("/tmp/foo.ts", "hello world", 1234567890)
      const entry = cache.get("/tmp/foo.ts")
      // entry should not contain the original content
      expect(entry).not.toHaveProperty("content")
      expect(entry!.hash).toBeDefined()
    })

    it("tracks partial reads with offset and limit", () => {
      cache.record("/tmp/foo.ts", "partial content", 1234567890, 10, 50)
      const entry = cache.get("/tmp/foo.ts")
      expect(entry).toBeDefined()
      expect(entry!.offset).toBe(10)
      expect(entry!.limit).toBe(50)
      expect(entry!.fullRead).toBe(false)
    })

    it("marks full read when no offset/limit provided", () => {
      cache.record("/tmp/foo.ts", "full content", 1234567890)
      const entry = cache.get("/tmp/foo.ts")
      expect(entry!.fullRead).toBe(true)
      expect(entry!.offset).toBeUndefined()
      expect(entry!.limit).toBeUndefined()
    })

    it("records timestamp of when entry was cached", () => {
      const before = Date.now()
      cache.record("/tmp/foo.ts", "content", 1234567890)
      const after = Date.now()
      const entry = cache.get("/tmp/foo.ts")
      expect(entry!.recordedAt).toBeGreaterThanOrEqual(before)
      expect(entry!.recordedAt).toBeLessThanOrEqual(after)
    })

    it("updates existing entry on re-record", () => {
      cache.record("/tmp/foo.ts", "old content", 1000)
      cache.record("/tmp/foo.ts", "new content", 2000)
      const entry = cache.get("/tmp/foo.ts")
      expect(entry!.mtime).toBe(2000)
    })
  })

  describe("LRU eviction", () => {
    it("evicts least recently used entry when exceeding max size", () => {
      const smallCache = new FileStateCache(3)
      smallCache.record("/a", "a", 1)
      smallCache.record("/b", "b", 2)
      smallCache.record("/c", "c", 3)
      // All three present
      expect(smallCache.get("/a")).toBeDefined()
      expect(smallCache.get("/b")).toBeDefined()
      expect(smallCache.get("/c")).toBeDefined()

      // Adding a 4th should evict the LRU
      // /a was accessed most recently (via get above), /b next, /c next
      // Actually after the gets: access order is /a, /b, /c
      // So /a is LRU after recording, but we accessed all three
      // Let's be explicit: access /b and /c so /a is LRU
      smallCache.get("/b")
      smallCache.get("/c")
      smallCache.record("/d", "d", 4)

      expect(smallCache.get("/a")).toBeUndefined()
      expect(smallCache.get("/b")).toBeDefined()
      expect(smallCache.get("/c")).toBeDefined()
      expect(smallCache.get("/d")).toBeDefined()
    })

    it("defaults to 50 entries max", () => {
      const defaultCache = new FileStateCache()
      for (let i = 0; i < 51; i++) {
        defaultCache.record(`/file-${i}`, `content-${i}`, i)
      }
      // First entry should be evicted
      expect(defaultCache.get("/file-0")).toBeUndefined()
      // Last entry should be present
      expect(defaultCache.get("/file-50")).toBeDefined()
    })
  })

  describe("clear", () => {
    it("removes all entries", () => {
      cache.record("/a", "a", 1)
      cache.record("/b", "b", 2)
      cache.clear()
      expect(cache.get("/a")).toBeUndefined()
      expect(cache.get("/b")).toBeUndefined()
    })
  })

  describe("hash consistency", () => {
    it("produces same hash for same content", () => {
      cache.record("/a", "hello", 1)
      cache.record("/b", "hello", 2)
      expect(cache.get("/a")!.hash).toBe(cache.get("/b")!.hash)
    })

    it("produces different hash for different content", () => {
      cache.record("/a", "hello", 1)
      cache.record("/b", "world", 2)
      expect(cache.get("/a")!.hash).not.toBe(cache.get("/b")!.hash)
    })
  })
})
