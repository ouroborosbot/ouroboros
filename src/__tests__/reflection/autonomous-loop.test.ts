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
    fs.writeFileSync(path.join(tmpDir, "subagents", "autonomous-planner.md"), "You are an autonomous planner.")
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

  it("skips writing task in dry-run mode even for requires-review", async () => {
    mockReflectionOutput(
      "GAP: Restructure heart module\nCONSTITUTION_CHECK: requires-review\nEFFORT: large\n\nPROPOSAL:\nRewrite the provider runtime."
    )

    const result = await runAutonomousLoop(makeConfig({ dryRun: true }))

    expect(result.stagesCompleted).toEqual(["reflect"])
    expect(result.exitCode).toBe(0)

    // Should NOT have written a task file in dry-run
    const tasks = fs.readdirSync(path.join(agentRoot, "tasks"))
    expect(tasks.some(f => f.includes("planning-reflection"))).toBe(false)
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

  it("respects maxStages=1 (stops after reflect only)", async () => {
    mockReflectionOutput(
      "GAP: Add logging\nCONSTITUTION_CHECK: within-bounds\nEFFORT: small\n\nPROPOSAL:\nAdd logging."
    )

    const result = await runAutonomousLoop(makeConfig({ maxStages: 1 }))

    expect(result.stagesCompleted).toEqual(["reflect"])
    expect(result.exitCode).toBe(0)
    expect(mockRunAgent).toHaveBeenCalledTimes(1)
  })

  it("skips writing doing doc when planner already created it", async () => {
    mockReflectionOutput(
      "GAP: Add logging\nCONSTITUTION_CHECK: within-bounds\nEFFORT: small\n\nPROPOSAL:\nAdd logging."
    )

    mockRunAgent.mockImplementationOnce(async (_msgs, callbacks) => {
      const taskFiles = fs.readdirSync(path.join(agentRoot, "tasks"))
      const planningFile = taskFiles.find(f => f.includes("planning-"))
      if (planningFile) {
        const doingFile = planningFile.replace(/planning-/, "doing-")
        fs.writeFileSync(path.join(agentRoot, "tasks", doingFile), "# Pre-existing doing doc", "utf-8")
      }
      callbacks.onTextChunk("Plan output text")
      return { usage: undefined }
    })
    mockStageOutput("Implemented. All tests pass.")
    mockStageOutput("PR merged.")

    const result = await runAutonomousLoop(makeConfig())

    expect(result.stagesCompleted).toEqual(["reflect", "plan", "do", "merge"])
    expect(result.exitCode).toBe(42)
  })

  it("respects maxStages=3 (stops before merge)", async () => {
    mockReflectionOutput(
      "GAP: Add logging\nCONSTITUTION_CHECK: within-bounds\nEFFORT: small\n\nPROPOSAL:\nAdd logging."
    )
    mockStageOutput("# Doing doc")
    mockStageOutput("Implemented. All tests pass.")

    const result = await runAutonomousLoop(makeConfig({ maxStages: 3 }))

    expect(result.stagesCompleted).toEqual(["reflect", "plan", "do"])
    expect(result.exitCode).toBe(0)
    expect(mockRunAgent).toHaveBeenCalledTimes(3)
  })

  it("invokes all channel callbacks including no-ops", async () => {
    mockRunAgent.mockImplementationOnce(async (_msgs, callbacks) => {
      callbacks.onModelStart()
      callbacks.onModelStreamStart()
      callbacks.onReasoningChunk("thinking...")
      callbacks.onToolStart("read_file")
      callbacks.onToolEnd("read_file", "read 100 lines", true)
      callbacks.onToolEnd("write_file", "write failed", false)
      callbacks.onError(new Error("something broke"), "warning")
      callbacks.onTextChunk(
        "GAP: Test callbacks\nCONSTITUTION_CHECK: within-bounds\nEFFORT: small\n\nPROPOSAL:\nTest."
      )
      return { usage: undefined }
    })

    const result = await runAutonomousLoop(makeConfig({ dryRun: true }))

    expect(result.stagesCompleted).toEqual(["reflect"])
    expect(result.exitCode).toBe(0)
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
    // Remove autonomous-planner prompt (used by the loop for planning stage)
    fs.unlinkSync(path.join(tmpDir, "subagents", "autonomous-planner.md"))

    mockReflectionOutput(
      "GAP: Add tests\nCONSTITUTION_CHECK: within-bounds\nEFFORT: small\n\nPROPOSAL:\nAdd tests."
    )

    await expect(runAutonomousLoop(makeConfig())).rejects.toThrow("Subagent prompt not found")
  })
})
