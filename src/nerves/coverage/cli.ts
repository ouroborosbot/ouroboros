import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"

import { auditObservabilityCoverage } from "./audit"
import { readLatestRun } from "./run-artifacts"

interface CliArgs {
  runDir?: string
  eventsPath?: string
  logpointsPath?: string
  output?: string
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    const next = argv[i + 1]
    if (!next) continue
    if (token === "--run-dir") args.runDir = next
    if (token === "--events-path") args.eventsPath = next
    if (token === "--logpoints-path") args.logpointsPath = next
    if (token === "--output") args.output = next
  }
  return args
}

export function runAuditCli(argv: string[]): number {
  const args = parseArgs(argv)
  const latestRun = readLatestRun()
  const runDir = args.runDir ?? latestRun?.run_dir

  if (!runDir) {
    console.error("nerves audit: no run directory found; provide --run-dir")
    return 2
  }

  const eventsPath = args.eventsPath ?? join(runDir, "vitest-events.ndjson")
  const logpointsPath = args.logpointsPath ?? join(runDir, "vitest-logpoints.json")
  const outputPath = args.output ?? join(runDir, "nerves-coverage.json")

  const report = auditObservabilityCoverage({
    eventsPath,
    logpointsPath,
  })

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8")
  console.log(`nerves audit: ${report.overall_status} (${outputPath})`)

  return report.overall_status === "pass" ? 0 : 1
}
