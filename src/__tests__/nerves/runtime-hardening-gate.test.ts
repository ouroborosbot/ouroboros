import { describe, expect, it } from "vitest"

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
})
