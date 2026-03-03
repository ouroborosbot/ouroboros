import { describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

describe("nerves/runtime-hardening gate contract", () => {
  it("fails with typed artifact action when load-validation artifact is missing", async () => {
    const gate = await import("../../nerves/runtime-hardening/gate")
    const report = gate.evaluateRuntimeHardening({
      artifactPath: "/tmp/does-not-exist-runtime-hardening.json",
    })

    expect(report.overall_status).toBe("fail")
    expect(report.required_actions).toContainEqual(
      expect.objectContaining({
        type: "artifact",
        target: "load-validation-artifact",
      }),
    )
  })

  it("reports split SLO failures with typed required actions", async () => {
    const gate = await import("../../nerves/runtime-hardening/gate")
    const report = gate.evaluateRuntimeHardening({
      artifactPath: "/tmp/runtime-hardening-fixture.json",
      payload: {
        schema_version: "1.0.0",
        target_concurrency: 4,
        metrics: {
          first_feedback_p95_ms: 2500,
          simple_turn_final_p95_ms: 12000,
          tool_turn_final_p95_ms: 45000,
          error_rate: 0.05,
        },
      },
    })

    expect(report.overall_status).toBe("fail")
    expect(report.required_actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "capacity", target: "target-concurrency" }),
        expect.objectContaining({ type: "latency", target: "first-feedback-p95" }),
        expect.objectContaining({ type: "latency", target: "simple-turn-final-p95" }),
        expect.objectContaining({ type: "latency", target: "tool-turn-final-p95" }),
        expect.objectContaining({ type: "reliability", target: "error-rate" }),
      ]),
    )
  })

  it("passes when split SLO metrics satisfy preview thresholds", async () => {
    const gate = await import("../../nerves/runtime-hardening/gate")
    const report = gate.evaluateRuntimeHardening({
      artifactPath: "/tmp/runtime-hardening-pass-fixture.json",
      payload: {
        schema_version: "1.0.0",
        target_concurrency: 10,
        metrics: {
          first_feedback_p95_ms: 1400,
          simple_turn_final_p95_ms: 4800,
          tool_turn_final_p95_ms: 12000,
          error_rate: 0.001,
        },
      },
    })

    expect(report.overall_status).toBe("pass")
    expect(report.required_actions).toEqual([])
    expect(report.runtime_hardening.status).toBe("pass")
  })

  it("loads and validates artifact payload from file path", async () => {
    const gate = await import("../../nerves/runtime-hardening/gate")
    const runDir = mkdtempSync(join(tmpdir(), "ouro-runtime-hardening-"))
    const artifactPath = join(runDir, "runtime-hardening-load-validation.json")
    writeFileSync(artifactPath, JSON.stringify({
      schema_version: "1.0.0",
      target_concurrency: 10,
      metrics: {
        first_feedback_p95_ms: 2000,
        simple_turn_final_p95_ms: 9000,
        tool_turn_final_p95_ms: 30000,
        error_rate: 0,
      },
    }, null, 2), "utf8")

    const report = gate.evaluateRuntimeHardening({ artifactPath })
    expect(report.overall_status).toBe("pass")
  })
})
