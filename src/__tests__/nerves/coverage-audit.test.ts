import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { describe, expect, it } from "vitest"
import { REQUIRED_EVENTS, getRequiredEventKeys } from "../../nerves/coverage/contract"

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
  const runDir = mkdtempSync(join(tmpdir(), "ouro-nerves-audit-"))
  const eventsPath = join(runDir, "vitest-events.ndjson")
  const logpointsPath = join(runDir, "vitest-logpoints.json")

  writeFileSync(eventsPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8")
  writeFileSync(logpointsPath, JSON.stringify(logpoints, null, 2), "utf8")

  const audit = await import("../../nerves/coverage/audit")
  return audit.auditObservabilityCoverage({
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
  return audit.auditObservabilityCoverage({
    eventsPath,
    logpointsPath,
  })
}

async function runAuditWithoutLogpoints(events: Array<Record<string, unknown>>): Promise<AuditResult> {
  const runDir = mkdtempSync(join(tmpdir(), "ouro-nerves-audit-"))
  const eventsPath = join(runDir, "vitest-events.ndjson")

  writeFileSync(eventsPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8")

  const audit = await import("../../nerves/coverage/audit")
  return audit.auditObservabilityCoverage({
    eventsPath,
    logpointsPath: join(runDir, "missing-logpoints.json"),
  })
}

async function runAuditMissingEventsFile(logpoints: Record<string, unknown>): Promise<AuditResult> {
  const runDir = mkdtempSync(join(tmpdir(), "ouro-nerves-audit-"))
  const eventsPath = join(runDir, "missing-events.ndjson")
  const logpointsPath = join(runDir, "vitest-logpoints.json")

  writeFileSync(logpointsPath, JSON.stringify(logpoints, null, 2), "utf8")

  const audit = await import("../../nerves/coverage/audit")
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

  it("flags invalid meta fields during schema checks", async () => {
    const report = await runAudit(
      [
        {
          ts: "2026-03-02T18:00:00.000Z",
          level: "info",
          event: "engine.turn_start",
          trace_id: "trace-1",
          component: "engine",
          message: "turn start",
          meta: [],
        },
      ],
      { declared: ["engine:engine.turn_start"], observed: ["engine:engine.turn_start"] },
    )

    expect(report.overall_status).toBe("fail")
    expect(report.observability_coverage.schema_redaction.status).toBe("fail")
    expect(report.required_actions).toContainEqual(expect.objectContaining({
      type: "logging",
      target: "schema-redaction",
    }))
  })

  it("falls back to declared required logpoints when logpoint capture file is malformed", async () => {
    const report = await runAuditWithFiles(
      [
        JSON.stringify({
          ts: "2026-03-02T18:00:00.000Z",
          level: "info",
          event: "engine.turn_start",
          trace_id: "trace-1",
          component: "engine",
          message: "turn start",
          meta: {},
        }),
      ].join("\n"),
      "{not-json",
    )

    expect(report.overall_status).toBe("fail")
    expect(report.observability_coverage.logpoint_coverage.declared).toBeGreaterThan(1)
    expect(report.required_actions).toContainEqual(expect.objectContaining({
      type: "logging",
      target: "logpoint-coverage",
    }))
  })

  it("treats malformed ndjson lines as schema violations", async () => {
    const report = await runAuditWithFiles(
      "{not-json\n",
      JSON.stringify({ declared: [], observed: [] }),
    )

    expect(report.overall_status).toBe("fail")
    expect(report.observability_coverage.schema_redaction.status).toBe("fail")
    expect(report.required_actions).toContainEqual(expect.objectContaining({
      type: "logging",
      target: "schema-redaction",
    }))
  })

  it("passes when all required events and logpoints are observed", async () => {
    const requiredKeys = getRequiredEventKeys()
    const events = REQUIRED_EVENTS.map((item, idx) => ({
      ts: `2026-03-02T18:00:${String(idx).padStart(2, "0")}.000Z`,
      level: "info",
      event: item.event,
      trace_id: `trace-${idx}`,
      component: item.component,
      message: `event ${idx}`,
      meta: { idx },
    }))
    const report = await runAudit(events, {
      declared: requiredKeys,
      observed: requiredKeys,
    })

    expect(report.overall_status).toBe("pass")
    expect(report.required_actions).toEqual([])
    expect(report.observability_coverage.event_catalog.status).toBe("pass")
    expect(report.observability_coverage.schema_redaction.status).toBe("pass")
    expect(report.observability_coverage.logpoint_coverage.status).toBe("pass")
  })

  it("uses observed events when logpoints file is absent", async () => {
    const report = await runAuditWithoutLogpoints(
      REQUIRED_EVENTS.map((item, idx) => ({
        ts: `2026-03-02T19:00:${String(idx).padStart(2, "0")}.000Z`,
        level: "info",
        event: item.event,
        trace_id: `trace-missing-${idx}`,
        component: item.component,
        message: `event ${idx}`,
        meta: { idx },
      })),
    )

    expect(report.overall_status).toBe("pass")
    expect(report.observability_coverage.logpoint_coverage.status).toBe("pass")
  })

  it("fails cleanly when events capture file is missing", async () => {
    const report = await runAuditMissingEventsFile({
      declared: [],
      observed: [],
    })

    expect(report.overall_status).toBe("fail")
    expect(report.observability_coverage.event_catalog.status).toBe("fail")
    expect(report.observability_coverage.schema_redaction.status).toBe("pass")
    expect(report.required_actions).toContainEqual(expect.objectContaining({
      type: "logging",
      target: "event-catalog",
    }))
  })

  it("handles empty events files without parse failures", async () => {
    const report = await runAuditWithFiles(
      "\n \n",
      JSON.stringify({ declared: [], observed: [] }),
    )

    expect(report.overall_status).toBe("fail")
    expect(report.observability_coverage.schema_redaction.status).toBe("pass")
    expect(report.observability_coverage.event_catalog.status).toBe("fail")
  })

  it("ignores non-array logpoint payload fields", async () => {
    const report = await runAuditWithFiles(
      JSON.stringify({
        ts: "2026-03-02T20:00:00.000Z",
        level: "info",
        event: "engine.turn_start",
        trace_id: "trace-non-array",
        component: "engine",
        message: "turn start",
        meta: {},
      }) + "\n",
      JSON.stringify({ declared: {}, observed: 42 }),
    )

    expect(report.overall_status).toBe("fail")
    expect(report.observability_coverage.logpoint_coverage.declared).toBeGreaterThan(1)
    expect(report.required_actions).toContainEqual(expect.objectContaining({
      type: "logging",
      target: "logpoint-coverage",
    }))
  })
})
