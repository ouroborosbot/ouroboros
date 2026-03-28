import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { describe, expect, it, vi } from "vitest"

import { createNdjsonFileSink, rotateIfNeeded } from "../../nerves"

function makeEntry(event: string) {
  return {
    ts: "2026-03-02T17:00:00.000Z",
    level: "info" as const,
    event,
    trace_id: "trace-1",
    component: "entrypoints",
    message: event,
    meta: {},
  }
}

describe("observability/sinks", () => {
  it("appends ndjson events without truncating", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ouro-observability-"))
    const filePath = join(dir, "events.ndjson")

    const sink = createNdjsonFileSink(filePath)
    sink({
      ts: "2026-03-02T17:00:00.000Z",
      level: "info",
      event: "turn.start",
      trace_id: "trace-1",
      component: "entrypoints",
      message: "start",
      meta: { turn: 1 },
    })
    sink({
      ts: "2026-03-02T17:00:01.000Z",
      level: "info",
      event: "turn.end",
      trace_id: "trace-1",
      component: "entrypoints",
      message: "end",
      meta: { turn: 1 },
    })

    let lines: string[] = []
    for (let i = 0; i < 20; i++) {
      try {
        lines = readFileSync(filePath, "utf8").trim().split("\n")
        if (lines.length === 2) break
      } catch {
        // File write is asynchronous; retry briefly.
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0] as string).event).toBe("turn.start")
    expect(JSON.parse(lines[1] as string).event).toBe("turn.end")
  })
})

describe("rotateIfNeeded", () => {
  it("rotates file when it exceeds maxSize", () => {
    const dir = mkdtempSync(join(tmpdir(), "ouro-rotate-"))
    const filePath = join(dir, "daemon.ndjson")
    // Write content that exceeds the threshold
    writeFileSync(filePath, "x".repeat(200), "utf-8")

    rotateIfNeeded(filePath, 100)

    const rotatedPath = filePath.replace(/\.ndjson$/, ".1.ndjson")
    expect(existsSync(rotatedPath)).toBe(true)
    expect(readFileSync(rotatedPath, "utf-8")).toBe("x".repeat(200))
    // Original file should no longer exist (it was renamed)
    expect(existsSync(filePath)).toBe(false)
  })

  it("deletes existing .2.ndjson before rotating", () => {
    const dir = mkdtempSync(join(tmpdir(), "ouro-rotate-"))
    const filePath = join(dir, "daemon.ndjson")
    const rotated1 = filePath.replace(/\.ndjson$/, ".1.ndjson")
    const rotated2 = filePath.replace(/\.ndjson$/, ".2.ndjson")

    writeFileSync(filePath, "x".repeat(200), "utf-8")
    writeFileSync(rotated1, "old-rotated-1", "utf-8")
    writeFileSync(rotated2, "old-rotated-2", "utf-8")

    rotateIfNeeded(filePath, 100)

    // .2 deleted, old .1 renamed to .2, current renamed to .1
    expect(existsSync(rotated2)).toBe(true)
    expect(readFileSync(rotated2, "utf-8")).toBe("old-rotated-1")
    expect(existsSync(rotated1)).toBe(true)
    expect(readFileSync(rotated1, "utf-8")).toBe("x".repeat(200))
    expect(existsSync(filePath)).toBe(false)
  })

  it("does not rotate when file is under maxSize", () => {
    const dir = mkdtempSync(join(tmpdir(), "ouro-rotate-"))
    const filePath = join(dir, "daemon.ndjson")
    writeFileSync(filePath, "small", "utf-8")

    rotateIfNeeded(filePath, 100)

    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, "utf-8")).toBe("small")
  })

  it("does not throw when file does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "ouro-rotate-"))
    const filePath = join(dir, "nonexistent.ndjson")

    expect(() => rotateIfNeeded(filePath, 100)).not.toThrow()
  })
})

describe("createNdjsonFileSink with rotation", () => {
  it("triggers rotation after exceeding byte threshold", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ouro-rotate-sink-"))
    const filePath = join(dir, "events.ndjson")

    // Use a very small maxSizeBytes to trigger rotation quickly
    const sink = createNdjsonFileSink(filePath, { maxSizeBytes: 100, checkIntervalBytes: 50 })

    // Write enough data to exceed the threshold
    for (let i = 0; i < 10; i++) {
      sink(makeEntry(`event-${i}`))
    }

    // Wait for async writes to complete
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Either the file was rotated (original small, .1 exists) or rotation happened
    const rotatedPath = filePath.replace(/\.ndjson$/, ".1.ndjson")
    expect(existsSync(rotatedPath)).toBe(true)
  })
})
