import { mkdtempSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { describe, expect, it } from "vitest"

import type { NervesCoverageReport } from "../../nerves/coverage/audit"
import { auditNervesCoverage } from "../../nerves/coverage/audit"

/**
 * Integration tests for the rewritten auditNervesCoverage() report.
 *
 * The new report must contain:
 * - schema_redaction (preserved)
 * - every_test_emits (Rule 1)
 * - start_end_pairing (Rule 2)
 * - error_context (Rule 3)
 * - source_coverage (Rule 4)
 * - file_completeness (Rule 5)
 *
 * Old sections (event_catalog, logpoint_coverage) must NOT exist.
 */

function createAuditFixture() {
  const runDir = mkdtempSync(join(tmpdir(), "ouro-audit-int-"))
  const eventsPath = join(runDir, "vitest-events.ndjson")
  const perTestPath = join(runDir, "vitest-events-per-test.json")
  const sourceRoot = join(runDir, "src")
  mkdirSync(sourceRoot, { recursive: true })
  return { runDir, eventsPath, perTestPath, sourceRoot }
}

describe("audit integration - new 5-rule report shape", () => {
  it("report contains all 5 rule sections plus schema_redaction", () => {
    const { eventsPath, perTestPath, sourceRoot } = createAuditFixture()

    // Minimal valid data
    writeFileSync(eventsPath, JSON.stringify({
      ts: "2026-03-05T00:00:00.000Z",
      level: "info",
      event: "test.event",
      trace_id: "t1",
      component: "test",
      message: "msg",
      meta: {},
    }) + "\n", "utf8")
    writeFileSync(perTestPath, JSON.stringify({
      "some test": [{ component: "test", event: "test.event" }],
    }), "utf8")

    const report = auditNervesCoverage({ eventsPath, perTestPath, sourceRoot })
    const nc = report.nerves_coverage

    expect(nc).toHaveProperty("schema_redaction")
    expect(nc).toHaveProperty("every_test_emits")
    expect(nc).toHaveProperty("start_end_pairing")
    expect(nc).toHaveProperty("error_context")
    expect(nc).toHaveProperty("source_coverage")
    expect(nc).toHaveProperty("file_completeness")

    // Old sections must be gone
    const ncAny = nc as Record<string, unknown>
    expect(ncAny["event_catalog"]).toBeUndefined()
    expect(ncAny["logpoint_coverage"]).toBeUndefined()
  })

  it("overall_status is pass when all rules pass", () => {
    const { eventsPath, perTestPath, sourceRoot } = createAuditFixture()

    writeFileSync(eventsPath, JSON.stringify({
      ts: "2026-03-05T00:00:00.000Z",
      level: "info",
      event: "test_start",
      trace_id: "t1",
      component: "test",
      message: "msg",
      meta: {},
    }) + "\n" + JSON.stringify({
      ts: "2026-03-05T00:00:01.000Z",
      level: "info",
      event: "test_end",
      trace_id: "t1",
      component: "test",
      message: "msg",
      meta: {},
    }) + "\n", "utf8")

    writeFileSync(perTestPath, JSON.stringify({
      "some test": [
        { component: "test", event: "test_start" },
        { component: "test", event: "test_end" },
      ],
    }), "utf8")

    // Create a source file with emitNervesEvent
    writeFileSync(join(sourceRoot, "mod.ts"), `
import { emitNervesEvent } from "../nerves/runtime"
emitNervesEvent({ component: "test", event: "test_start", message: "s" })
emitNervesEvent({ component: "test", event: "test_end", message: "e" })
`, "utf8")

    const report = auditNervesCoverage({ eventsPath, perTestPath, sourceRoot })
    expect(report.overall_status).toBe("pass")
    expect(report.required_actions).toEqual([])
  })

  it("overall_status is fail when any rule fails", () => {
    const { eventsPath, perTestPath, sourceRoot } = createAuditFixture()

    writeFileSync(eventsPath, JSON.stringify({
      ts: "2026-03-05T00:00:00.000Z",
      level: "info",
      event: "test.event",
      trace_id: "t1",
      component: "test",
      message: "msg",
      meta: {},
    }) + "\n", "utf8")

    // A test with zero events - Rule 1 will fail
    writeFileSync(perTestPath, JSON.stringify({
      "test with events": [{ component: "test", event: "test.event" }],
      "silent test": [],
    }), "utf8")

    const report = auditNervesCoverage({ eventsPath, perTestPath, sourceRoot })
    expect(report.overall_status).toBe("fail")
    expect(report.required_actions.length).toBeGreaterThan(0)
  })

  it("handles missing perTestPath gracefully", () => {
    const { eventsPath, sourceRoot } = createAuditFixture()

    writeFileSync(eventsPath, JSON.stringify({
      ts: "2026-03-05T00:00:00.000Z",
      level: "info",
      event: "test.event",
      trace_id: "t1",
      component: "test",
      message: "msg",
      meta: {},
    }) + "\n", "utf8")

    const report = auditNervesCoverage({
      eventsPath,
      perTestPath: "/nonexistent/path.json",
      sourceRoot,
    })

    // Rules that depend on per-test data should fail gracefully
    expect(report.nerves_coverage.every_test_emits.status).toBe("fail")
  })
})
