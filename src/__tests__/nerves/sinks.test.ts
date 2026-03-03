import { mkdtempSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { describe, expect, it } from "vitest"

import { createNdjsonFileSink } from "../../nerves"

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
