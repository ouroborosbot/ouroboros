import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { describe, expect, it } from "vitest"

type AuditResult = {
  overall_status: "pass" | "fail"
  required_actions: Array<{
    type: "coverage" | "logging"
    target: string
    reason: string
  }>
  nerves_coverage: {
    schema_redaction: { status: "pass" | "fail" }
  }
}

async function runAudit(events: Array<Record<string, unknown>>): Promise<AuditResult> {
  const runDir = mkdtempSync(join(tmpdir(), "ouro-nerves-audit-"))
  const eventsPath = join(runDir, "vitest-events.ndjson")
  const logpointsPath = join(runDir, "vitest-logpoints.json")

  writeFileSync(eventsPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8")
  writeFileSync(logpointsPath, JSON.stringify({ declared: [], observed: [] }, null, 2), "utf8")

  const audit = await import("../../nerves/coverage/audit")
  return audit.auditNervesCoverage({
    eventsPath,
    logpointsPath,
  })
}

async function runAuditWithFiles(eventsContent: string, logpointsContent: string): Promise<AuditResult> {
  const runDir = mkdtempSync(join(tmpdir(), "ouro-nerves-audit-"))
  const eventsPath = join(runDir, "vitest-events.ndjson")
  const logpointsPath = join(runDir, "vitest-logpoints.json")

  writeFileSync(eventsPath, eventsContent, "utf8")
  writeFileSync(logpointsPath, logpointsContent, "utf8")

  const audit = await import("../../nerves/coverage/audit")
  return audit.auditNervesCoverage({
    eventsPath,
    logpointsPath,
  })
}

async function runAuditMissingEventsFile(): Promise<AuditResult> {
  const runDir = mkdtempSync(join(tmpdir(), "ouro-nerves-audit-"))
  const eventsPath = join(runDir, "missing-events.ndjson")
  const logpointsPath = join(runDir, "vitest-logpoints.json")

  writeFileSync(logpointsPath, JSON.stringify({ declared: [], observed: [] }, null, 2), "utf8")

  const audit = await import("../../nerves/coverage/audit")
  return audit.auditNervesCoverage({
    eventsPath,
    logpointsPath,
  })
}

describe("observability/coverage audit - schema_redaction", () => {
  it("fails schema/redaction checks when captured events break envelope policy", async () => {
    const report = await runAudit([
      {
        ts: "2026-03-02T18:00:00.000Z",
        level: "info",
        event: "channel.message_sent",
        trace_id: "",
        component: "channels",
        message: "token=super-secret-value",
        meta: { prompt: "raw prompt dump" },
      },
    ])

    expect(report.overall_status).toBe("fail")
    expect(report.nerves_coverage.schema_redaction.status).toBe("fail")
    expect(report.required_actions).toContainEqual(expect.objectContaining({
      type: "logging",
      target: "schema-redaction",
    }))
  })

  it("flags invalid meta fields during schema checks", async () => {
    const report = await runAudit([
      {
        ts: "2026-03-02T18:00:00.000Z",
        level: "info",
        event: "engine.turn_start",
        trace_id: "trace-1",
        component: "engine",
        message: "turn start",
        meta: [],
      },
    ])

    expect(report.overall_status).toBe("fail")
    expect(report.nerves_coverage.schema_redaction.status).toBe("fail")
  })

  it("treats malformed ndjson lines as schema violations", async () => {
    const report = await runAuditWithFiles(
      "{not-json\n",
      JSON.stringify({ declared: [], observed: [] }),
    )

    expect(report.overall_status).toBe("fail")
    expect(report.nerves_coverage.schema_redaction.status).toBe("fail")
  })

  it("passes schema check with valid events", async () => {
    const report = await runAudit([
      {
        ts: "2026-03-02T18:00:00.000Z",
        level: "info",
        event: "engine.turn_start",
        trace_id: "trace-1",
        component: "engine",
        message: "turn start",
        meta: { idx: 0 },
      },
    ])

    expect(report.overall_status).toBe("pass")
    expect(report.nerves_coverage.schema_redaction.status).toBe("pass")
    expect(report.required_actions).toEqual([])
  })

  it("passes when events file is missing (no events to check)", async () => {
    const report = await runAuditMissingEventsFile()

    expect(report.overall_status).toBe("pass")
    expect(report.nerves_coverage.schema_redaction.status).toBe("pass")
  })

  it("handles empty events files without parse failures", async () => {
    const report = await runAuditWithFiles(
      "\n \n",
      JSON.stringify({ declared: [], observed: [] }),
    )

    expect(report.overall_status).toBe("pass")
    expect(report.nerves_coverage.schema_redaction.status).toBe("pass")
  })
})
