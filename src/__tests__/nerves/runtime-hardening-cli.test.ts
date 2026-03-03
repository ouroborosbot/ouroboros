import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { afterEach, describe, expect, it, vi } from "vitest"

const dirsToCleanup = new Set<string>()

afterEach(() => {
  for (const dir of dirsToCleanup) {
    rmSync(dir, { recursive: true, force: true })
  }
  dirsToCleanup.clear()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("nerves/runtime-hardening cli", () => {
  it("returns 2 when no run-dir/input can be resolved", async () => {
    vi.doMock("../../nerves/coverage/run-artifacts", () => ({
      readLatestRun: vi.fn().mockReturnValue(null),
    }))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { runRuntimeHardeningCli } = await import("../../nerves/runtime-hardening/cli")
    const code = runRuntimeHardeningCli([])

    expect(code).toBe(2)
    expect(errorSpy).toHaveBeenCalled()
  })

  it("writes report and returns 0 for valid artifact", async () => {
    const runDir = mkdtempSync(join(tmpdir(), "ouro-runtime-hardening-cli-"))
    dirsToCleanup.add(runDir)
    const inputPath = join(runDir, "runtime-hardening-load-validation.json")
    const outputPath = join(runDir, "runtime-hardening-summary.json")
    writeFileSync(inputPath, JSON.stringify({
      schema_version: "1.0.0",
      target_concurrency: 10,
      metrics: {
        first_feedback_p95_ms: 1000,
        simple_turn_final_p95_ms: 3000,
        tool_turn_final_p95_ms: 10000,
        error_rate: 0,
      },
    }, null, 2), "utf8")

    const { runRuntimeHardeningCli } = await import("../../nerves/runtime-hardening/cli")
    const code = runRuntimeHardeningCli([
      "--run-dir", runDir,
      "--input", inputPath,
      "--output", outputPath,
    ])

    expect(code).toBe(0)
    const summary = JSON.parse(readFileSync(outputPath, "utf8")) as { overall_status: string }
    expect(summary.overall_status).toBe("pass")
  })

  it("resolves default input/output from readLatestRun when run-dir args are omitted", async () => {
    const runDir = mkdtempSync(join(tmpdir(), "ouro-runtime-hardening-cli-default-"))
    dirsToCleanup.add(runDir)
    const inputPath = join(runDir, "runtime-hardening-load-validation.json")
    const outputPath = join(runDir, "runtime-hardening-summary.json")
    writeFileSync(inputPath, JSON.stringify({
      schema_version: "1.0.0",
      target_concurrency: 10,
      metrics: {
        first_feedback_p95_ms: 1000,
        simple_turn_final_p95_ms: 3000,
        tool_turn_final_p95_ms: 10000,
        error_rate: 0,
      },
    }, null, 2), "utf8")

    vi.doMock("../../nerves/coverage/run-artifacts", () => ({
      readLatestRun: vi.fn().mockReturnValue({ run_dir: runDir }),
    }))

    const { runRuntimeHardeningCli } = await import("../../nerves/runtime-hardening/cli")
    const code = runRuntimeHardeningCli([])

    expect(code).toBe(0)
    const summary = JSON.parse(readFileSync(outputPath, "utf8")) as { overall_status: string }
    expect(summary.overall_status).toBe("pass")
  })

  it("returns 1 when runtime hardening report fails", async () => {
    const runDir = mkdtempSync(join(tmpdir(), "ouro-runtime-hardening-cli-fail-"))
    dirsToCleanup.add(runDir)
    const inputPath = join(runDir, "runtime-hardening-load-validation.json")
    const outputPath = join(runDir, "runtime-hardening-summary.json")
    writeFileSync(inputPath, JSON.stringify({
      schema_version: "1.0.0",
      target_concurrency: 1,
      metrics: {
        first_feedback_p95_ms: 5000,
        simple_turn_final_p95_ms: 11000,
        tool_turn_final_p95_ms: 60000,
        error_rate: 0.02,
      },
    }, null, 2), "utf8")

    const { runRuntimeHardeningCli } = await import("../../nerves/runtime-hardening/cli")
    const code = runRuntimeHardeningCli([
      "--input", inputPath,
      "--output", outputPath,
    ])

    expect(code).toBe(1)
    const summary = JSON.parse(readFileSync(outputPath, "utf8")) as { overall_status: string }
    expect(summary.overall_status).toBe("fail")
  })
})
