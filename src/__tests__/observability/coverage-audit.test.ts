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
  observability_coverage: {
    event_catalog: { status: "pass" | "fail" }
    schema_redaction: { status: "pass" | "fail" }
    logpoint_coverage: { status: "pass" | "fail" }
  }
}

async function runAudit(events: Array<Record<string, unknown>>, logpoints: Record<string, unknown>): Promise<AuditResult> {
  const runDir = mkdtempSync(join(tmpdir(), "ouro-observability-audit-"))
  const eventsPath = join(runDir, "vitest-events.ndjson")
  const logpointsPath = join(runDir, "vitest-logpoints.json")

  writeFileSync(eventsPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8")
  writeFileSync(logpointsPath, JSON.stringify(logpoints, null, 2), "utf8")

  const audit = await import("../../observability/coverage/audit")
  return audit.auditObservabilityCoverage({
    eventsPath,
    logpointsPath,
  })
}

describe("observability/coverage audit contract", () => {
  it("fails event-catalog coverage when required events are missing", async () => {
    const report = await runAudit(
      [
        {
          ts: "2026-03-02T18:00:00.000Z",
          level: "info",
          event: "engine.turn_start",
          trace_id: "trace-1",
          component: "engine",
          message: "turn start",
          meta: {},
        },
      ],
      { declared: ["engine.turn_start"], observed: ["engine.turn_start"] },
    )

    expect(report.overall_status).toBe("fail")
    expect(report.observability_coverage.event_catalog.status).toBe("fail")
    expect(report.required_actions).toContainEqual(expect.objectContaining({
      type: "logging",
      target: "event-catalog",
    }))
  })

  it("fails schema/redaction checks when captured events break envelope policy", async () => {
    const report = await runAudit(
      [
        {
          ts: "2026-03-02T18:00:00.000Z",
          level: "info",
          event: "channel.message_sent",
          trace_id: "",
          component: "channels",
          message: "token=super-secret-value",
          meta: { prompt: "raw prompt dump" },
        },
      ],
      { declared: ["channel.message_sent"], observed: ["channel.message_sent"] },
    )

    expect(report.overall_status).toBe("fail")
    expect(report.observability_coverage.schema_redaction.status).toBe("fail")
    expect(report.required_actions).toContainEqual(expect.objectContaining({
      type: "logging",
      target: "schema-redaction",
    }))
  })

  it("fails logpoint coverage when declared logpoints are not observed", async () => {
    const report = await runAudit(
      [
        {
          ts: "2026-03-02T18:00:00.000Z",
          level: "info",
          event: "tool.start",
          trace_id: "trace-1",
          component: "tools",
          message: "tool start",
          meta: {},
        },
      ],
      {
        declared: ["src/engine/core.ts:engine.turn_start", "src/engine/tools.ts:tool.start"],
        observed: ["src/engine/tools.ts:tool.start"],
      },
    )

    expect(report.overall_status).toBe("fail")
    expect(report.observability_coverage.logpoint_coverage.status).toBe("fail")
    expect(report.required_actions).toContainEqual(expect.objectContaining({
      type: "logging",
      target: "logpoint-coverage",
    }))
  })
})
