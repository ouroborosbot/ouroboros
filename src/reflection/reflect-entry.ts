/* eslint-disable no-console -- terminal UX: CLI entry point for reflection */

// Entry point for `npm run reflect` — runs a single reflection cycle.
// Usage: node dist/reflection/reflect-entry.js --agent ouroboros [--dry-run]

if (!process.argv.includes("--agent")) {
  console.error("Missing required --agent <name> argument.\nUsage: node dist/reflection/reflect-entry.js --agent ouroboros [--dry-run]")
  process.exit(1)
}

import OpenAI from "openai"
import { loadReflectionContext, buildReflectionPrompt, parseReflectionOutput, writeProposalTask } from "./trigger"
import { runAgent } from "../heart/core"
import type { ChannelCallbacks } from "../heart/core"
import { emitNervesEvent } from "../nerves/runtime"
import { createTraceId } from "../nerves"

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const traceId = createTraceId()
  console.log(`[reflect] Starting reflection cycle (trace: ${traceId})`)

  // Load context
  const input = loadReflectionContext()
  if (!input.architecture) {
    console.warn("[reflect] WARNING: No ARCHITECTURE.md found. Reflection will note this as a gap.")
  }
  if (!input.constitution) {
    console.warn("[reflect] WARNING: No CONSTITUTION.md found.")
  }

  // Build prompt
  const reflectionPrompt = buildReflectionPrompt(input)

  // Run through agent
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: reflectionPrompt },
    { role: "user", content: "Begin reflection. Analyze your architecture and propose one improvement." },
  ]

  let fullOutput = ""

  const callbacks: ChannelCallbacks = {
    onModelStart() { console.log("[reflect] Model thinking...") },
    onModelStreamStart() { /* quiet */ },
    onTextChunk(text: string) { fullOutput += text },
    onReasoningChunk() { /* ignore reasoning */ },
    onToolStart(name: string) { console.log(`[reflect] Tool: ${name}`) },
    onToolEnd(name: string, summary: string, success: boolean) {
      console.log(`[reflect] Tool ${name}: ${success ? "ok" : "fail"} — ${summary}`)
    },
    onError(error: Error, severity: string) {
      console.error(`[reflect] Error (${severity}): ${error.message}`)
    },
  }

  try {
    await runAgent(messages, callbacks, undefined, undefined, {
      toolChoiceRequired: false,
      traceId,
    })
  } catch (err) {
    console.error("[reflect] Agent run failed:", err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  if (!fullOutput.trim()) {
    console.error("[reflect] No output from model.")
    process.exit(1)
  }

  // Parse output
  const proposal = parseReflectionOutput(fullOutput)
  console.log(`\n[reflect] Gap identified: ${proposal.gap}`)
  console.log(`[reflect] Effort: ${proposal.estimatedEffort}`)
  console.log(`[reflect] Constitution check: ${proposal.constitutionCheck}`)

  if (dryRun) {
    console.log("\n[reflect] DRY RUN — proposal not written:")
    console.log(proposal.rawOutput)
  } else {
    const taskPath = writeProposalTask(proposal)
    console.log(`\n[reflect] Proposal written to: ${taskPath}`)

    if (proposal.constitutionCheck === "requires-review") {
      console.log("[reflect] ⚠ This proposal requires human review before execution.")
    } else {
      console.log("[reflect] ✓ This proposal is within constitution bounds — eligible for auto-execution.")
    }
  }

  emitNervesEvent({
    event: "reflection.cycle_complete",
    trace_id: traceId,
    component: "reflection",
    message: "Reflection cycle complete",
    meta: {
      gap: proposal.gap,
      effort: proposal.estimatedEffort,
      constitutionCheck: proposal.constitutionCheck,
      dryRun,
    },
  })
}

main().catch(err => {
  console.error("[reflect] Fatal:", err)
  process.exit(1)
})
