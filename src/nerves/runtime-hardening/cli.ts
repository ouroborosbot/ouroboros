import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"

import { readLatestRun } from "../coverage/run-artifacts"
import { evaluateRuntimeHardening } from "./gate"

interface CliArgs {
  runDir?: string
  input?: string
  output?: string
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    const next = argv[i + 1]
    if (!next) continue
    if (token === "--run-dir") args.runDir = next
    if (token === "--input") args.input = next
    if (token === "--output") args.output = next
  }
  return args
}

export function runRuntimeHardeningCli(argv: string[]): number {
  const args = parseArgs(argv)
  const runDir = args.runDir ?? readLatestRun()?.run_dir
  const inputPath = args.input ?? (runDir ? join(runDir, "runtime-hardening-load-validation.json") : undefined)
  const outputPath = args.output ?? (runDir ? join(runDir, "runtime-hardening-summary.json") : undefined)

  if (!inputPath || !outputPath) {
    console.error("runtime hardening audit: no run directory found; provide --run-dir")
    return 2
  }

  const report = evaluateRuntimeHardening({
    artifactPath: inputPath,
  })

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8")
  console.log(`runtime hardening audit: ${report.overall_status} (${outputPath})`)
  return report.overall_status === "pass" ? 0 : 1
}
