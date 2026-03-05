/**
 * Unit 6: Autonomous Loop — wires reflection into the sub-agent pipeline.
 *
 * Flow: reflect → plan → do → merge → restart
 *
 * The loop reads a reflection proposal (planning doc) and orchestrates
 * the work-planner → work-doer → work-merger pipeline via sequential
 * agent runs, then exits with code 42 to trigger self-restart.
 *
 * Each stage uses the corresponding subagent prompt as system context
 * and runs through the same agent engine (heart/core.ts runAgent).
 */

import * as fs from "fs"
import * as path from "path"
import OpenAI from "openai"
import { runAgent } from "../heart/core"
import type { ChannelCallbacks } from "../heart/core"
import { emitNervesEvent } from "../nerves/runtime"
import { createTraceId } from "../nerves"
import {
  loadReflectionContext,
  buildReflectionPrompt,
  parseReflectionOutput,
  writeProposalTask,
  type ReflectionProposal,
} from "./trigger"

export interface LoopConfig {
  agentRoot: string
  projectRoot: string
  dryRun: boolean
  maxStages: number // safety: max pipeline stages to execute
}

export interface LoopResult {
  proposal: ReflectionProposal | null
  stagesCompleted: string[]
  exitCode: number // 0 = done, 42 = restart requested
  error?: string
}

function loadSubagentPrompt(projectRoot: string, name: string): string {
  const promptPath = path.join(projectRoot, "subagents", `${name}.md`)
  try {
    return fs.readFileSync(promptPath, "utf-8")
  } catch {
    throw new Error(`Subagent prompt not found: ${promptPath}`)
  }
}

function collectOutput(callbacks: Partial<ChannelCallbacks>): { getOutput: () => string; cbs: ChannelCallbacks } {
  let output = ""
  const cbs: ChannelCallbacks = {
    onModelStart() {},
    onModelStreamStart() {},
    onTextChunk(text: string) { output += text },
    onReasoningChunk() {},
    onToolStart(name: string) { console.log(`  [tool] ${name}`) },
    onToolEnd(name: string, _summary: string, success: boolean) {
      console.log(`  [tool] ${name}: ${success ? "ok" : "fail"}`)
    },
    onError(error: Error, severity: string) {
      console.error(`  [error] (${severity}): ${error.message}`)
    },
    ...callbacks,
  }
  return { getOutput: () => output, cbs }
}

async function runStage(
  stageName: string,
  systemPrompt: string,
  userMessage: string,
  traceId: string,
): Promise<string> {
  console.log(`\n[loop] === Stage: ${stageName} ===`)
  const { getOutput, cbs } = collectOutput({})

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]

  await runAgent(messages, cbs, undefined, undefined, {
    toolChoiceRequired: false,
    traceId,
  })

  const result = getOutput()
  if (!result.trim()) {
    throw new Error(`Stage ${stageName} produced no output`)
  }
  return result
}

/**
 * Run the full autonomous loop: reflect → plan → do → merge.
 * Returns a LoopResult with exit code 42 if restart is needed.
 */
export async function runAutonomousLoop(config: LoopConfig): Promise<LoopResult> {
  const traceId = createTraceId()
  const stagesCompleted: string[] = []

  emitNervesEvent({
    event: "loop.start",
    trace_id: traceId,
    component: "reflection",
    message: "Autonomous loop started",
    meta: { dryRun: config.dryRun },
  })

  // Stage 1: Reflect
  console.log("[loop] Stage 1: Reflection")
  const input = loadReflectionContext(config.agentRoot)
  const reflectionPrompt = buildReflectionPrompt(input)

  const reflectionOutput = await runStage(
    "reflect",
    reflectionPrompt,
    "Begin reflection. Analyze your architecture and propose one improvement.",
    traceId,
  )

  const proposal = parseReflectionOutput(reflectionOutput)
  stagesCompleted.push("reflect")

  console.log(`[loop] Gap: ${proposal.gap}`)
  console.log(`[loop] Constitution: ${proposal.constitutionCheck}`)
  console.log(`[loop] Effort: ${proposal.estimatedEffort}`)

  // Gate: constitution check
  if (proposal.constitutionCheck === "requires-review") {
    console.log("[loop] ⚠ Proposal requires human review. Writing task and stopping.")
    if (!config.dryRun) {
      writeProposalTask(proposal, config.agentRoot)
    }
    emitNervesEvent({
      event: "loop.gated",
      trace_id: traceId,
      component: "reflection",
      message: "Proposal requires human review — loop paused",
      meta: { gap: proposal.gap },
    })
    return { proposal, stagesCompleted, exitCode: 0 }
  }

  if (config.dryRun) {
    console.log("[loop] DRY RUN — stopping after reflection.")
    return { proposal, stagesCompleted, exitCode: 0 }
  }

  // Write the proposal as a planning doc
  const proposalPath = writeProposalTask(proposal, config.agentRoot)
  const proposalContent = fs.readFileSync(proposalPath, "utf-8")

  // Stage 2: Plan (work-planner converts proposal → doing doc)
  if (stagesCompleted.length >= config.maxStages) {
    return { proposal, stagesCompleted, exitCode: 0 }
  }

  const plannerPrompt = loadSubagentPrompt(config.projectRoot, "work-planner")
  const planOutput = await runStage(
    "plan",
    plannerPrompt,
    `Convert this reflection proposal into an actionable doing document. Use your tools to write the doing doc to disk in the tasks directory.\n\n${proposalContent}`,
    traceId,
  )
  stagesCompleted.push("plan")

  // Write the plan output as a doing doc if the planner didn't already write one
  const doingDocName = proposalPath.replace(/planning-/, "doing-")
  if (!fs.existsSync(doingDocName)) {
    fs.writeFileSync(doingDocName, planOutput, "utf-8")
    console.log(`[loop] Wrote doing doc: ${doingDocName}`)
  }


  // Stage 3: Do (work-doer executes the doing doc via TDD)
  if (stagesCompleted.length >= config.maxStages) {
    return { proposal, stagesCompleted, exitCode: 0 }
  }

  const doerPrompt = loadSubagentPrompt(config.projectRoot, "work-doer")
  const doOutput = await runStage(
    "do",
    doerPrompt,
    `Execute the doing document at: ${doingDocName}\n\nRead it with read_file, then execute all work units using TDD. Use shell to run tests, write_file to create code, and commit after each unit.`,
    traceId,
  )
  stagesCompleted.push("do")

  // Stage 4: Merge (work-merger creates PR and merges)
  if (stagesCompleted.length >= config.maxStages) {
    return { proposal, stagesCompleted, exitCode: 0 }
  }

  const mergerPrompt = loadSubagentPrompt(config.projectRoot, "work-merger")
  await runStage(
    "merge",
    mergerPrompt,
    `Merge the completed work. Use shell to check git status/log for recent commits, run tests, then create a PR and merge.\n\nProject root: ${config.projectRoot}\nWork summary:\n${doOutput}`,
    traceId,
  )
  stagesCompleted.push("merge")

  emitNervesEvent({
    event: "loop.complete",
    trace_id: traceId,
    component: "reflection",
    message: "Autonomous loop complete — requesting restart",
    meta: { gap: proposal.gap, stages: stagesCompleted },
  })

  // Request restart (exit code 42 handled by self-restart.sh)
  return { proposal, stagesCompleted, exitCode: 42 }
}
