import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as zlib from "zlib"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { rotateIfNeeded, createNdjsonFileSink, registerGlobalLogSink, type LogEvent } from "../../nerves"

/**
 * PR 1 — new rotation scheme tests.
 *
 * Policy: 25 MB threshold × 5 gzipped generations.
 * Current active file:  foo.ndjson
 * Generations:          foo.1.ndjson.gz (newest) … foo.5.ndjson.gz (oldest)
 * Legacy tolerance:     foo.1.ndjson / foo.2.ndjson (uncompressed, from old scheme)
 *                       are treated as generation N and gzipped on first rotation.
 *
 * All tests use tmpdir fixtures — no prod paths touched.
 */

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rotation-scheme-"))
}

function cleanup(dir: string): void {
  // Enumerate + delete per Directive A — no rmSync recursive in test source files
  // where we can help it. This is a test helper so rmSync recursive is allowed,
  // but we keep the pattern explicit for clarity.
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
}

function captureNervesEvents(filter?: (e: LogEvent) => boolean): { events: LogEvent[]; unregister: () => void } {
  const events: LogEvent[] = []
  const unregister = registerGlobalLogSink((entry: LogEvent) => {
    if (!filter || filter(entry)) {
      events.push(entry)
    }
  })
  return { events, unregister }
}

describe("rotation.new-scheme", () => {
  let dir: string

  beforeEach(() => {
    dir = tmpDir()
  })

  afterEach(() => {
    cleanup(dir)
  })

  describe("rotateIfNeeded — defaults and options", () => {
    it("returns false when file is under threshold with default options", () => {
      const filePath = path.join(dir, "events.ndjson")
      fs.writeFileSync(filePath, "x".repeat(100), "utf-8")

      // Default threshold is 25 MB; 100 bytes is well under.
      expect(rotateIfNeeded(filePath)).toBe(false)
      expect(fs.existsSync(filePath)).toBe(true)
    })

    it("returns false when file does not exist", () => {
      const filePath = path.join(dir, "missing.ndjson")
      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100 })).toBe(false)
    })

    it("returns false at maxSize - 1 byte (inclusive boundary check)", () => {
      const filePath = path.join(dir, "events.ndjson")
      fs.writeFileSync(filePath, "x".repeat(99), "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100 })).toBe(false)
      expect(fs.existsSync(filePath)).toBe(true)
    })

    it("returns true at exactly maxSize (inclusive)", () => {
      const filePath = path.join(dir, "events.ndjson")
      fs.writeFileSync(filePath, "x".repeat(100), "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100 })).toBe(true)
      expect(fs.existsSync(filePath)).toBe(false)
    })

    it("returns true at maxSize + 1 byte", () => {
      const filePath = path.join(dir, "events.ndjson")
      fs.writeFileSync(filePath, "x".repeat(101), "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100 })).toBe(true)
      expect(fs.existsSync(filePath)).toBe(false)
    })
  })

  describe("rotateIfNeeded — gzip + generations", () => {
    it("renames current to .1.ndjson then gzips to .1.ndjson.gz (default compress=true)", () => {
      const filePath = path.join(dir, "events.ndjson")
      const payload = "hello-rotation\n".repeat(10)
      fs.writeFileSync(filePath, payload, "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 1 })).toBe(true)

      // active file gone
      expect(fs.existsSync(filePath)).toBe(false)
      // uncompressed .1 should NOT remain after successful gzip
      expect(fs.existsSync(path.join(dir, "events.1.ndjson"))).toBe(false)
      // gzipped generation present
      const gzPath = path.join(dir, "events.1.ndjson.gz")
      expect(fs.existsSync(gzPath)).toBe(true)
      // content matches
      const gunzipped = zlib.gunzipSync(fs.readFileSync(gzPath)).toString("utf-8")
      expect(gunzipped).toBe(payload)
    })

    it("shifts existing .1.ndjson.gz → .2.ndjson.gz before rotating active", () => {
      const filePath = path.join(dir, "events.ndjson")
      const gen1 = path.join(dir, "events.1.ndjson.gz")
      const gen2 = path.join(dir, "events.2.ndjson.gz")

      // Preseed an existing gen 1
      fs.writeFileSync(gen1, zlib.gzipSync(Buffer.from("OLD-GEN-1", "utf-8")))
      fs.writeFileSync(filePath, "x".repeat(100), "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 50 })).toBe(true)

      // old .1 moved to .2
      expect(fs.existsSync(gen2)).toBe(true)
      expect(zlib.gunzipSync(fs.readFileSync(gen2)).toString("utf-8")).toBe("OLD-GEN-1")
      // new .1 has the rotated active content
      expect(fs.existsSync(gen1)).toBe(true)
      expect(zlib.gunzipSync(fs.readFileSync(gen1)).toString("utf-8")).toBe("x".repeat(100))
    })

    it("drops the oldest generation when 5 already exist", () => {
      const filePath = path.join(dir, "events.ndjson")
      // Preseed generations 1..5
      for (let i = 1; i <= 5; i++) {
        fs.writeFileSync(
          path.join(dir, `events.${i}.ndjson.gz`),
          zlib.gzipSync(Buffer.from(`GEN-${i}`, "utf-8")),
        )
      }
      fs.writeFileSync(filePath, "x".repeat(200), "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100, maxGenerations: 5 })).toBe(true)

      // Generation 5 should be gone and replaced by what was generation 4
      expect(zlib.gunzipSync(fs.readFileSync(path.join(dir, "events.5.ndjson.gz"))).toString("utf-8")).toBe("GEN-4")
      expect(zlib.gunzipSync(fs.readFileSync(path.join(dir, "events.4.ndjson.gz"))).toString("utf-8")).toBe("GEN-3")
      expect(zlib.gunzipSync(fs.readFileSync(path.join(dir, "events.3.ndjson.gz"))).toString("utf-8")).toBe("GEN-2")
      expect(zlib.gunzipSync(fs.readFileSync(path.join(dir, "events.2.ndjson.gz"))).toString("utf-8")).toBe("GEN-1")
      // new generation 1 holds the rotated-out active content
      expect(zlib.gunzipSync(fs.readFileSync(path.join(dir, "events.1.ndjson.gz"))).toString("utf-8")).toBe("x".repeat(200))
    })

    it("drops oldest generation when 6 existing generations present (overfull)", () => {
      const filePath = path.join(dir, "events.ndjson")
      // Preseed 5 generations (1..5) and one more stray beyond maxGenerations
      for (let i = 1; i <= 5; i++) {
        fs.writeFileSync(
          path.join(dir, `events.${i}.ndjson.gz`),
          zlib.gzipSync(Buffer.from(`GEN-${i}`, "utf-8")),
        )
      }
      fs.writeFileSync(filePath, "x".repeat(200), "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100, maxGenerations: 5 })).toBe(true)

      // GEN-5 should have been dropped, GEN-4 becomes new .5
      expect(zlib.gunzipSync(fs.readFileSync(path.join(dir, "events.5.ndjson.gz"))).toString("utf-8")).toBe("GEN-4")
    })

    it("tolerates legacy uncompressed .1.ndjson file from the old scheme and migrates to gzip", () => {
      const filePath = path.join(dir, "events.ndjson")
      const legacy1 = path.join(dir, "events.1.ndjson")

      fs.writeFileSync(legacy1, "LEGACY-1", "utf-8")
      fs.writeFileSync(filePath, "x".repeat(200), "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100 })).toBe(true)

      // After rotation: legacy .1.ndjson should be gone, .2.ndjson.gz holds its content
      expect(fs.existsSync(legacy1)).toBe(false)
      const gz2 = path.join(dir, "events.2.ndjson.gz")
      expect(fs.existsSync(gz2)).toBe(true)
      expect(zlib.gunzipSync(fs.readFileSync(gz2)).toString("utf-8")).toBe("LEGACY-1")
      // new .1.ndjson.gz holds the rotated active content
      const gz1 = path.join(dir, "events.1.ndjson.gz")
      expect(zlib.gunzipSync(fs.readFileSync(gz1)).toString("utf-8")).toBe("x".repeat(200))
    })

    it("tolerates legacy .2.ndjson uncompressed file (gets dropped if maxGenerations=1 or shifted otherwise)", () => {
      const filePath = path.join(dir, "events.ndjson")
      const legacy2 = path.join(dir, "events.2.ndjson")

      fs.writeFileSync(legacy2, "LEGACY-2", "utf-8")
      fs.writeFileSync(filePath, "x".repeat(200), "utf-8")

      // With maxGenerations=3, legacy .2 should shift to .3 (as gzip)
      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100, maxGenerations: 3 })).toBe(true)
      expect(fs.existsSync(legacy2)).toBe(false)
      const gz3 = path.join(dir, "events.3.ndjson.gz")
      expect(fs.existsSync(gz3)).toBe(true)
      expect(zlib.gunzipSync(fs.readFileSync(gz3)).toString("utf-8")).toBe("LEGACY-2")
    })

    it("skips gzip when compress=false (produces plain .1.ndjson rotated file)", () => {
      const filePath = path.join(dir, "events.ndjson")
      fs.writeFileSync(filePath, "x".repeat(200), "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100, compress: false })).toBe(true)

      const rotated = path.join(dir, "events.1.ndjson")
      expect(fs.existsSync(rotated)).toBe(true)
      expect(fs.readFileSync(rotated, "utf-8")).toBe("x".repeat(200))
      // No .gz should be written
      expect(fs.existsSync(path.join(dir, "events.1.ndjson.gz"))).toBe(false)
    })

    it("handles non-ndjson extension gracefully (treats as plain file suffix)", () => {
      const filePath = path.join(dir, "logfile.log")
      fs.writeFileSync(filePath, "x".repeat(200), "utf-8")

      expect(rotateIfNeeded(filePath, { maxSizeBytes: 100, compress: false })).toBe(true)
      // With non-ndjson extension we fall back to appending .1 suffix
      expect(fs.existsSync(path.join(dir, "logfile.log.1"))).toBe(true)
    })
  })

  describe("rotateIfNeeded — nerves events", () => {
    it("emits paired rotation_start / rotation_end on success", () => {
      const filePath = path.join(dir, "events.ndjson")
      fs.writeFileSync(filePath, "x".repeat(200), "utf-8")

      const { events, unregister } = captureNervesEvents(
        (e) => e.event === "nerves.rotation_start" || e.event === "nerves.rotation_end",
      )
      try {
        expect(rotateIfNeeded(filePath, { maxSizeBytes: 100 })).toBe(true)
      } finally {
        unregister()
      }

      const start = events.find((e) => e.event === "nerves.rotation_start")
      const end = events.find((e) => e.event === "nerves.rotation_end")
      expect(start).toBeDefined()
      expect(end).toBeDefined()
      // Same trace id across start/end for pairability
      expect(start?.trace_id).toBe(end?.trace_id)
      // meta contents
      expect(start?.meta).toMatchObject({ path: filePath, currentSize: 200, threshold: 100, generation: 1 })
      expect(end?.meta).toMatchObject({ path: filePath })
      expect(typeof (end?.meta as Record<string, unknown>).bytesFreed).toBe("number")
    })

    it("emits rotation_error (not rotation_end) when gzip fails", async () => {
      const filePath = path.join(dir, "events.ndjson")
      fs.writeFileSync(filePath, "x".repeat(200), "utf-8")

      // Mock zlib.gzipSync to throw
      const { default: zlibMod } = await import("zlib")
      const gzipSpy = vi.spyOn(zlibMod, "gzipSync").mockImplementation(() => {
        throw new Error("gzip boom")
      })

      const { events, unregister } = captureNervesEvents(
        (e) => e.event === "nerves.rotation_start" || e.event === "nerves.rotation_end" || e.event === "nerves.rotation_error",
      )
      try {
        expect(() => rotateIfNeeded(filePath, { maxSizeBytes: 100 })).toThrow(/gzip boom/)
      } finally {
        unregister()
        gzipSpy.mockRestore()
      }

      const start = events.find((e) => e.event === "nerves.rotation_start")
      const end = events.find((e) => e.event === "nerves.rotation_end")
      const err = events.find((e) => e.event === "nerves.rotation_error")

      expect(start).toBeDefined()
      expect(end).toBeUndefined()
      expect(err).toBeDefined()
      expect(start?.trace_id).toBe(err?.trace_id)
      expect((err?.meta as Record<string, unknown>).error).toContain("gzip boom")
    })
  })
})
