/**
 * Reflection trigger — the heartbeat that makes Ouroboros self-perpetuating.
 *
 * Loads the self-model (ARCHITECTURE.md) and constitution (CONSTITUTION.md),
 * then runs a reflection prompt through the agent to identify gaps and propose
 * improvements. Output is written to ouroboros/tasks/ as a planning doc.
 *
 * Usage: node dist/reflection/trigger.js --agent ouroboros [--dry-run] [--output <path>]
 */

import * as fs from "fs"
import * as path from "path"
import { getAgentRoot } from "../identity"
import { emitNervesEvent } from "../nerves/runtime"

export interface ReflectionInput {
  architecture: string
  constitution: string
  selfKnowledge: string
  recentTasks: string[]
}

export interface ReflectionProposal {
  timestamp: string
  gap: string
  proposal: string
  estimatedEffort: "small" | "medium" | "large"
  constitutionCheck: "within-bounds" | "requires-review"
  rawOutput: string
}

/**
 * Load all reflection context from the agent root directory.
 */
export function loadReflectionContext(agentRoot?: string): ReflectionInput {
  const root = agentRoot ?? getAgentRoot()

  const readFile = (rel: string): string => {
    try {
      return fs.readFileSync(path.join(root, rel), "utf-8").trim()
    } catch {
      return ""
    }
  }

  const architecture = readFile("ARCHITECTURE.md")
  const constitution = readFile("CONSTITUTION.md")
  const selfKnowledge = readFile("psyche/SELF-KNOWLEDGE.md")

  // Gather recent task filenames (last 10 by name, which is date-sorted)
  const tasksDir = path.join(root, "tasks")
  let recentTasks: string[] = []
  try {
    const files = fs.readdirSync(tasksDir)
      .filter(f => f.endsWith(".md"))
      .sort()
      .slice(-10)
    recentTasks = files
  } catch {
    // no tasks dir is fine
  }

  return { architecture, constitution, selfKnowledge, recentTasks }
}

/**
 * Build the reflection system prompt.
 */
export function buildReflectionPrompt(input: ReflectionInput): string {
  const sections: string[] = []

  sections.push(`# Reflection Cycle

You are Ouroboros performing a self-reflection cycle. Your job is to analyze your own architecture, identify the most impactful gap or improvement, and propose a concrete task to address it.

## Your Architecture (Self-Model)
${input.architecture || "(No architecture document found — this is itself a critical gap.)"}

## Constitution (Human-Owned Guardrails — DO NOT MODIFY)
${input.constitution || "(No constitution document found.)"}

## Self-Knowledge (Lessons Learned)
${input.selfKnowledge || "(No self-knowledge yet — you are starting fresh.)"}

## Recent Tasks
${input.recentTasks.length > 0 ? input.recentTasks.map(t => `- ${t}`).join("\n") : "(No recent tasks found.)"}

## Instructions

1. Review your architecture and capability matrix. What is the biggest gap?
2. Check against the constitution — is this something you can address autonomously, or does it require human review?
3. Propose ONE specific, concrete improvement task. Include:
   - **Gap**: What's missing or broken
   - **Proposal**: What to build/change (be specific about files and modules)
   - **Estimated effort**: small / medium / large
   - **Constitution check**: within-bounds / requires-review
   - **Implementation steps**: Ordered list of concrete steps

Respond in this exact format:

GAP: <one-line description>
CONSTITUTION_CHECK: <within-bounds|requires-review>
EFFORT: <small|medium|large>

PROPOSAL:
<detailed proposal with implementation steps>
`)

  return sections.join("\n")
}

/**
 * Parse the model's reflection output into a structured proposal.
 */
export function parseReflectionOutput(raw: string): ReflectionProposal {
  const gapMatch = raw.match(/^GAP:\s*(.+)$/m)
  const checkMatch = raw.match(/^CONSTITUTION_CHECK:\s*(within-bounds|requires-review)$/m)
  const effortMatch = raw.match(/^EFFORT:\s*(small|medium|large)$/m)
  const proposalMatch = raw.match(/^PROPOSAL:\s*\n([\s\S]+)$/m)

  return {
    timestamp: new Date().toISOString(),
    gap: gapMatch?.[1]?.trim() ?? "unknown",
    proposal: proposalMatch?.[1]?.trim() ?? raw,
    estimatedEffort: (effortMatch?.[1] as ReflectionProposal["estimatedEffort"]) ?? "medium",
    constitutionCheck: (checkMatch?.[1] as ReflectionProposal["constitutionCheck"]) ?? "requires-review",
    rawOutput: raw,
  }
}

/**
 * Write a reflection proposal as a planning task document.
 */
export function writeProposalTask(proposal: ReflectionProposal, agentRoot?: string): string {
  const root = agentRoot ?? getAgentRoot()
  const tasksDir = path.join(root, "tasks")
  fs.mkdirSync(tasksDir, { recursive: true })

  const now = new Date()
  const dateStr = now.toISOString().replace(/T/, "-").replace(/:/g, "").slice(0, 15)
  const slug = proposal.gap
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)

  const filename = `${dateStr}-planning-reflection-${slug}.md`
  const filepath = path.join(tasksDir, filename)

  const content = `# Reflection Proposal: ${proposal.gap}

**Generated:** ${proposal.timestamp}
**Effort:** ${proposal.estimatedEffort}
**Constitution check:** ${proposal.constitutionCheck}
**Source:** Autonomous reflection cycle

## Gap
${proposal.gap}

## Proposal
${proposal.proposal}

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
`

  fs.writeFileSync(filepath, content, "utf-8")

  emitNervesEvent({
    event: "reflection.proposal_written",
    component: "reflection",
    message: `Wrote reflection proposal: ${filename}`,
    meta: {
      gap: proposal.gap,
      effort: proposal.estimatedEffort,
      constitutionCheck: proposal.constitutionCheck,
      path: filepath,
    },
  })

  return filepath
}
