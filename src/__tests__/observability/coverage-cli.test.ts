import { existsSync, mkdtempSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { afterEach, describe, expect, it, vi } from "vitest"

describe("observability/coverage cli", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("returns code 2 when no run directory is available", async () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    vi.doMock("../../observability/coverage/run-artifacts", () => ({
      readLatestRun: () => null,
    }))
    vi.doMock("../../observability/coverage/audit", () => ({
      auditObservabilityCoverage: vi.fn(),
    }))

    const { runAuditCli } = await import("../../observability/coverage/cli")
    expect(runAuditCli([])).toBe(2)
    expect(stderrSpy).toHaveBeenCalledWith(
      "observability audit: no run directory found; provide --run-dir",
    )
  })

  it("writes report output and returns success/failure codes from audit results", async () => {
    const runDir = mkdtempSync(join(tmpdir(), "ouro-observability-cli-"))
    const outputPath = join(runDir, "custom-observability-coverage.json")
    const eventsPath = join(runDir, "custom-events.ndjson")
    const logpointsPath = join(runDir, "custom-logpoints.json")
    const auditSpy = vi.fn()
    const stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    vi.doMock("../../observability/coverage/run-artifacts", () => ({
      readLatestRun: () => ({
        repo_slug: "ouroboros-agent-harness",
        run_id: "run-id",
        run_dir: runDir,
        created_at: "2026-03-02T18:00:00.000Z",
      }),
    }))
    vi.doMock("../../observability/coverage/audit", () => ({
      auditObservabilityCoverage: auditSpy,
    }))

    const { runAuditCli } = await import("../../observability/coverage/cli")

    auditSpy.mockReturnValueOnce({
      overall_status: "pass",
      required_actions: [],
      observability_coverage: {
        event_catalog: { status: "pass", required: 1, observed: 1, missing: [] },
        schema_redaction: { status: "pass", checked_events: 1, violations: [] },
        logpoint_coverage: { status: "pass", declared: 1, observed: 1, missing: [] },
      },
    })
    const defaultOutputCode = runAuditCli([
      "--run-dir",
      runDir,
      "--events-path",
      eventsPath,
      "--logpoints-path",
      logpointsPath,
    ])
    expect(defaultOutputCode).toBe(0)
    expect(auditSpy).toHaveBeenCalledWith({
      eventsPath,
      logpointsPath,
    })
    expect(existsSync(join(runDir, "observability-coverage.json"))).toBe(true)

    auditSpy.mockReturnValueOnce({
      overall_status: "pass",
      required_actions: [],
      observability_coverage: {
        event_catalog: { status: "pass", required: 1, observed: 1, missing: [] },
        schema_redaction: { status: "pass", checked_events: 1, violations: [] },
        logpoint_coverage: { status: "pass", declared: 1, observed: 1, missing: [] },
      },
    })
    const passCode = runAuditCli(["--output", outputPath])
    expect(passCode).toBe(0)
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual(
      expect.objectContaining({ overall_status: "pass" }),
    )

    auditSpy.mockReturnValueOnce({
      overall_status: "fail",
      required_actions: [{ type: "logging", target: "event-catalog", reason: "missing" }],
      observability_coverage: {
        event_catalog: { status: "fail", required: 2, observed: 1, missing: ["engine:engine.error"] },
        schema_redaction: { status: "pass", checked_events: 1, violations: [] },
        logpoint_coverage: { status: "pass", declared: 1, observed: 1, missing: [] },
      },
    })
    const failCode = runAuditCli(["--run-dir", runDir, "--output", outputPath])
    expect(failCode).toBe(1)
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual(
      expect.objectContaining({ overall_status: "fail" }),
    )
    expect(stdoutSpy).toHaveBeenCalled()
  })
})
