#!/usr/bin/env node
const { spawnSync } = require("child_process")
const { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } = require("fs")
const path = require("path")
const os = require("os")

const REPO_SLUG = "ouroboros-agent-harness"
const ROOT = path.join(os.homedir(), ".agentconfigs", "test-runs", REPO_SLUG)

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

function runNpm(args) {
  return spawnSync(npmCmd(), args, { stdio: "inherit" })
}

function runNode(args) {
  return spawnSync(process.execPath, args, { stdio: "inherit" })
}

function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8")
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function main() {
  mkdirSync(ROOT, { recursive: true })
  const runId = createRunId()
  const runDir = path.join(ROOT, runId)
  mkdirSync(runDir, { recursive: true })

  const info = {
    repo_slug: REPO_SLUG,
    run_id: runId,
    run_dir: runDir,
    created_at: new Date().toISOString(),
  }

  const activePath = path.join(ROOT, ".active-run.json")
  const latestPath = path.join(ROOT, "latest-run.json")
  const nervesCoveragePath = path.join(runDir, "nerves-coverage.json")
  const runtimeLoadValidationPath = path.join(runDir, "runtime-hardening-load-validation.json")
  const runtimeSummaryPath = path.join(runDir, "runtime-hardening-summary.json")
  const summaryPath = path.join(runDir, "coverage-gate-summary.json")

  writeJson(activePath, info)
  writeJson(latestPath, info)

  const vitestExit = runNpm(["run", "test:coverage:vitest"]).status ?? 1

  if (existsSync(activePath)) {
    unlinkSync(activePath)
  }

  const loadValidationExit = runNode([
    path.join("scripts", "run-runtime-hardening-load-validation.cjs"),
    "--run-dir",
    runDir,
    "--output",
    runtimeLoadValidationPath,
  ]).status ?? 1

  const auditExit = runNpm([
    "run",
    "audit:nerves",
    "--",
    "--run-dir",
    runDir,
    "--output",
    nervesCoveragePath,
  ]).status ?? 1

  const runtimeAuditExit = runNpm([
    "run",
    "audit:runtime-hardening",
    "--",
    "--run-dir",
    runDir,
    "--input",
    runtimeLoadValidationPath,
    "--output",
    runtimeSummaryPath,
  ]).status ?? 1

  let nervesReport = null
  if (existsSync(nervesCoveragePath)) {
    nervesReport = readJson(nervesCoveragePath)
  }
  let runtimeReport = null
  if (existsSync(runtimeSummaryPath)) {
    runtimeReport = readJson(runtimeSummaryPath)
  }

  const requiredActions = []
  const codeCoverageStatus = vitestExit === 0 ? "pass" : "fail"
  if (codeCoverageStatus === "fail") {
    requiredActions.push({
      type: "coverage",
      target: "code-coverage",
      reason: "vitest coverage gate failed",
    })
  }

  const nervesStatus = nervesReport?.overall_status === "pass" && auditExit === 0
    ? "pass"
    : "fail"

  if (Array.isArray(nervesReport?.required_actions)) {
    requiredActions.push(...nervesReport.required_actions)
  } else if (nervesStatus === "fail") {
    requiredActions.push({
      type: "logging",
      target: "nerves-audit",
      reason: "nerves audit did not produce a valid report",
    })
  }

  const runtimeStatus = runtimeReport?.overall_status === "pass"
    && runtimeAuditExit === 0
    && loadValidationExit === 0
    ? "pass"
    : "fail"

  if (Array.isArray(runtimeReport?.required_actions)) {
    requiredActions.push(...runtimeReport.required_actions)
  } else if (runtimeStatus === "fail") {
    requiredActions.push({
      type: "artifact",
      target: "runtime-hardening-audit",
      reason: "runtime hardening audit did not produce a valid report",
    })
  }

  const overallStatus =
    codeCoverageStatus === "pass" && nervesStatus === "pass" && runtimeStatus === "pass" ? "pass" : "fail"

  const summary = {
    overall_status: overallStatus,
    code_coverage: {
      status: codeCoverageStatus,
    },
    nerves_coverage: nervesReport?.nerves_coverage ?? {
      status: nervesStatus,
    },
    runtime_hardening: runtimeReport?.runtime_hardening ?? {
      status: runtimeStatus,
    },
    required_actions: requiredActions,
  }

  writeJson(summaryPath, summary)
  console.log(`coverage gate: ${overallStatus} (${summaryPath})`)
  process.exit(overallStatus === "pass" ? 0 : 1)
}

main()
