/* eslint-disable no-console -- terminal UX: CLI entry point for autonomous loop */

// Entry point for `npm run reflect:loop` — runs a full autonomous cycle.
// Usage: node dist/reflection/loop-entry.js --agent ouroboros [--dry-run] [--max-stages N]

if (!process.argv.includes("--agent")) {
  console.error("Usage: node dist/reflection/loop-entry.js --agent ouroboros [--dry-run] [--max-stages N]")
  process.exit(1)
}

import { runAutonomousLoop } from "./autonomous-loop"
import { getAgentRoot } from "../identity"
import * as path from "path"

const dryRun = process.argv.includes("--dry-run")
const maxStagesIdx = process.argv.indexOf("--max-stages")
const maxStages = maxStagesIdx >= 0 ? parseInt(process.argv[maxStagesIdx + 1], 10) : 4

async function main() {
  const agentRoot = getAgentRoot()
  const projectRoot = path.resolve(agentRoot, "..")

  console.log(`[loop] Agent root: ${agentRoot}`)
  console.log(`[loop] Project root: ${projectRoot}`)
  console.log(`[loop] Dry run: ${dryRun}`)
  console.log(`[loop] Max stages: ${maxStages}`)

  const result = await runAutonomousLoop({
    agentRoot,
    projectRoot,
    dryRun,
    maxStages,
  })

  console.log(`\n[loop] Stages completed: ${result.stagesCompleted.join(" → ")}`)

  if (result.error) {
    console.error(`[loop] Error: ${result.error}`)
  }

  if (result.exitCode === 42) {
    console.log("[loop] Requesting self-restart (exit 42)...")
  }

  process.exit(result.exitCode)
}

main().catch(err => {
  console.error("[loop] Fatal:", err)
  process.exit(1)
})
