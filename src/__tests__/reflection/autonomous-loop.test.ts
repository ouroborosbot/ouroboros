import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

// Mock dependencies before import
vi.mock("../../heart/core", () => ({
  runAgent: vi.fn(),
}))
vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))
vi.mock("../../nerves", () => ({
  createTraceId: vi.fn(() => "test-trace-123"),
}))
vi.mock("../../identity", () => ({
  getAgentRoot: vi.fn(() => "/mock/agent"),
  loadAgentConfig: vi.fn(() => ({})),
}))

import { runAutonomousLoop, type LoopConfig } from "../../reflection/autonomous-loop"
import { runAgent } from "../../heart/core"

const mockRunAgent = vi.mocked(runAgent)

describe("autonomous-loop", () => {
  let tmpDir: string
  let agentRoot: string
  let projectRoot: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loop-test-"))
    projectRoot = tmpDir
    agentRoot = path.join(tmpDir, "ouroboros")
    fs.mkdirSync(agentRoot, { recursive: true })
    fs.mkdirSync(path.join(agentRoot, "tasks"), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, "subagents"), { recursive: true })

    // Write required files
    fs.writeFileSync(path.join(agentRoot, "ARCHITECTURE.md"), "# Architecture\n## Gaps\n- No logging")
    fs.writeFileSync(path.join(agentRoot, "CONSTITUTION.md"), "# Constitution\nNo force push.")
    fs.mkdirSync(path.join(agentRoot, "psyche"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "psyche", "SELF-KNOWLEDGE.md"), "# Self-Knowledge")

    // Write subagent prompts
    fs.writeFileSync(path.join(tmpDir, "subagents", "work-planner.md"), "You are a planner.")
    fs.writeFileSync(path.join(tmpDir, "subagents", "work-doer.md"), "You are a doer.")
    fs.writeFileSync(path.join(tmpDir, "subagents", "work-merger.md"), "You are a merger.")

    mockRunAgent.mockReset()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function makeConfig(overrides?: Partial<LoopConfig>): LoopConfig {
    return {
      agentRoot,
      projectRoot,
      dryRun: false,
      maxStages: 4,
      ...overrides,
    }
  }

  function mockReflectionOutput(text: string) {
    mockRunAgent.mockImplementationOnce(async (_msgs, callbacks) => {
      callbacks.onTextChunk(text)
      return { usage: undefined }
    })
  }

  function mockStageOutput(text: string) {
    mockRunAgent.mockImplementationOnce(async (_msgs, callbacks) => {
      callbacks.onTextChunk(text)
      return { usage: undefined }
    })
  }

  it("stops after reflection if proposal requires review", async () => {
    mockReflectionOutput(
      "GAP: Restructure heart module\nCONSTITUTION_CHECK: requires-review\nEFFORT: large\n\nPROPOSAL:\nRewrite the provider runtime."
    )

    const result = await runAutonomousLoop(makeConfig())

    expect(result.stagesCompleted).toEqual(["reflect"])
    expect(result.exitCode).toBe(0)
    expect(result.proposal?.constitutionCheck).toBe("requires-review")
    expect(mockRunAgent).toHaveBeenCalledTimes(1)

    // Should have written a task file
    const tasks = fs.readdirSync(path.join(agentRoot, "tasks"))
    expect(tasks.some(f => f.includes("planning-reflection"))).toBe(true)
  })

  it("stops after reflection in dry-run mode", async () => {
    mockReflectionOutput(
      "GAP: Add logging\nCONSTITUTION_CHECK: within-bounds\nEFFORT: small\n\nPROPOSAL:\nAdd structured logging."
    )

    const result = await runAutonomousLoop(makeConfig({ dryRun: true }))

    expect(result.stagesCompleted).toEqual(["reflect"])
    expect(result.exitCode).toBe(0)
    expect(mockRunAgent).toHaveBeenCalledTimes(1)
  })

  it("runs full pipeline for within-bounds proposals", async () => {
    mockReflectionOutput(
      "GAP: Add logging\nCONSTITUTION_CHECK: within-bounds\nEFFORT: small\n\nPROPOSAL:\nAdd structured logging to all modules."
    )
    mockStageOutput("# Doing Doc\n## Unit 1: Add logger\n- Create src/logger.ts")
    mockStageOutput("Implemented logger. All tests pass.")
    mockStageOutput("PR #42 created and merged.")

    const result = await runAutonomousLoop(makeConfig())

    expect(result.stagesCompleted).toEqual(["reflect", "plan", "do", "merge"])
    expect(result.exitCode).toBe(42) // restart requested
    expect(mockRunAgent).toHaveBeenCalledTimes(4)
  })

  it("respects maxStages limit", async () => {
    mockReflectionOutput(
      "GAP: Add logging\nCONSTITUTION_CHECK: within-bounds\nEFFORT: small\n\nPROPOSAL:\nAdd logging."
    )
    mockStageOutput("# Doing doc")

    const result = await runAutonomousLoop(makeConfig({ maxStages: 2 }))

    expect(result.stagesCompleted).toEqual(["reflect", "plan"])
    expect(result.exitCode).toBe(0) // didn't reach merge, no restart
    expect(mockRunAgent).toHaveBeenCalledTimes(2)
  })

  it("handles reflection producing no output", async () => {
    mockRunAgent.mockImplementationOnce(async (_msgs, _callbacks) => {
      return { usage: undefined }
    })

    await expect(runAutonomousLoop(makeConfig())).rejects.toThrow("no output")
  })

  it("handles missing subagent prompt gracefully", async () => {
    // Remove work-planner prompt
    fs.unlinkSync(path.join(tmpDir, "subagents", "work-planner.md"))

    mockReflectionOutput(
      "GAP: Add tests\nCONSTITUTION_CHECK: within-bounds\nEFFORT: small\n\nPROPOSAL:\nAdd tests."
    )

    await expect(runAutonomousLoop(makeConfig())).rejects.toThrow("Subagent prompt not found")
  })
})
