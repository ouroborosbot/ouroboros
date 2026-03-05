import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import {
  loadReflectionContext,
  buildReflectionPrompt,
  parseReflectionOutput,
  writeProposalTask,
} from "../../reflection/trigger"
import type { ReflectionInput, ReflectionProposal } from "../../reflection/trigger"

describe("reflection/trigger", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reflect-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("loadReflectionContext", () => {
    it("loads architecture and constitution files", () => {
      fs.writeFileSync(path.join(tmpDir, "ARCHITECTURE.md"), "# Arch\nmodules here")
      fs.writeFileSync(path.join(tmpDir, "CONSTITUTION.md"), "# Rules\nno force push")
      fs.mkdirSync(path.join(tmpDir, "psyche"), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, "psyche", "SELF-KNOWLEDGE.md"), "I learned stuff")

      const ctx = loadReflectionContext(tmpDir)
      expect(ctx.architecture).toBe("# Arch\nmodules here")
      expect(ctx.constitution).toBe("# Rules\nno force push")
      expect(ctx.selfKnowledge).toBe("I learned stuff")
    })

    it("returns empty strings for missing files", () => {
      const ctx = loadReflectionContext(tmpDir)
      expect(ctx.architecture).toBe("")
      expect(ctx.constitution).toBe("")
      expect(ctx.selfKnowledge).toBe("")
      expect(ctx.recentTasks).toEqual([])
    })

    it("loads recent task filenames sorted", () => {
      const tasksDir = path.join(tmpDir, "tasks")
      fs.mkdirSync(tasksDir, { recursive: true })
      fs.writeFileSync(path.join(tasksDir, "2026-03-01-planning-a.md"), "")
      fs.writeFileSync(path.join(tasksDir, "2026-03-02-planning-b.md"), "")
      fs.writeFileSync(path.join(tasksDir, "not-a-task.txt"), "")

      const ctx = loadReflectionContext(tmpDir)
      expect(ctx.recentTasks).toEqual([
        "2026-03-01-planning-a.md",
        "2026-03-02-planning-b.md",
      ])
    })

    it("extracts prior reflection gaps from existing proposals", () => {
      const tasksDir = path.join(tmpDir, "tasks")
      fs.mkdirSync(tasksDir, { recursive: true })
      fs.writeFileSync(
        path.join(tasksDir, "2026-03-01-planning-reflection-add-logging.md"),
        "# Reflection Proposal\n\n## Gap\nAdd structured logging\n\n## Proposal\nAdd nerves.",
      )
      fs.writeFileSync(
        path.join(tasksDir, "2026-03-02-planning-reflection-add-tests.md"),
        "# Reflection Proposal\n\n## Gap\nAdd more tests\n\n## Proposal\nAdd coverage.",
      )

      const ctx = loadReflectionContext(tmpDir)
      expect(ctx.priorReflectionGaps).toContain("Add structured logging")
      expect(ctx.priorReflectionGaps).toContain("Add more tests")
    })

    it("skips reflection files with no Gap heading", () => {
      const tasksDir = path.join(tmpDir, "tasks")
      fs.mkdirSync(tasksDir, { recursive: true })
      fs.writeFileSync(
        path.join(tasksDir, "2026-03-01-planning-reflection-no-gap.md"),
        "# No gap heading here\nJust some text.",
      )

      const ctx = loadReflectionContext(tmpDir)
      expect(ctx.priorReflectionGaps).toEqual([])
    })

    it("limits to last 10 tasks", () => {
      const tasksDir = path.join(tmpDir, "tasks")
      fs.mkdirSync(tasksDir, { recursive: true })
      for (let i = 0; i < 15; i++) {
        const name = `2026-03-${String(i + 1).padStart(2, "0")}-planning-task.md`
        fs.writeFileSync(path.join(tasksDir, name), "")
      }

      const ctx = loadReflectionContext(tmpDir)
      expect(ctx.recentTasks).toHaveLength(10)
      expect(ctx.recentTasks[0]).toContain("2026-03-06")
    })
  })

  describe("buildReflectionPrompt", () => {
    it("includes architecture in the prompt", () => {
      const input: ReflectionInput = {
        architecture: "# My Arch",
        constitution: "# My Rules",
        selfKnowledge: "I know things",
        recentTasks: ["task-a.md", "task-b.md"],
        priorReflectionGaps: ["Add logging", "Add tests"],
      }
      const prompt = buildReflectionPrompt(input)
      expect(prompt).toContain("# My Arch")
      expect(prompt).toContain("# My Rules")
      expect(prompt).toContain("I know things")
      expect(prompt).toContain("- task-a.md")
      expect(prompt).toContain("- task-b.md")
      expect(prompt).toContain("- Add logging")
      expect(prompt).toContain("- Add tests")
      expect(prompt).toContain("GAP:")
      expect(prompt).toContain("CONSTITUTION_CHECK:")
    })

    it("handles empty input gracefully", () => {
      const input: ReflectionInput = {
        architecture: "",
        constitution: "",
        selfKnowledge: "",
        recentTasks: [],
        priorReflectionGaps: [],
      }
      const prompt = buildReflectionPrompt(input)
      expect(prompt).toContain("critical gap")
      expect(prompt).toContain("No recent tasks")
      expect(prompt).toContain("None yet")
    })
  })

  describe("parseReflectionOutput", () => {
    it("parses well-formatted output", () => {
      const raw = `GAP: No self-deploy mechanism
CONSTITUTION_CHECK: within-bounds
EFFORT: small

PROPOSAL:
Add a restart wrapper script that exits with code 42.
The outer loop script detects this and restarts.

Steps:
1. Create scripts/self-restart.sh
2. Add exit code 42 handling to work-merger`

      const result = parseReflectionOutput(raw)
      expect(result.gap).toBe("No self-deploy mechanism")
      expect(result.constitutionCheck).toBe("within-bounds")
      expect(result.estimatedEffort).toBe("small")
      expect(result.proposal).toContain("restart wrapper")
      expect(result.rawOutput).toBe(raw)
    })

    it("handles malformed output with defaults", () => {
      const raw = "I think we should add more tests."
      const result = parseReflectionOutput(raw)
      expect(result.gap).toBe("unknown")
      expect(result.constitutionCheck).toBe("requires-review")
      expect(result.estimatedEffort).toBe("medium")
      expect(result.proposal).toBe(raw)
    })
  })

  describe("writeProposalTask", () => {
    it("writes a task file to the tasks directory", () => {
      const proposal: ReflectionProposal = {
        timestamp: "2026-03-05T01:00:00.000Z",
        gap: "No self-deploy mechanism",
        proposal: "Add restart wrapper",
        estimatedEffort: "small",
        constitutionCheck: "within-bounds",
        rawOutput: "raw",
      }

      const filepath = writeProposalTask(proposal, tmpDir)
      expect(fs.existsSync(filepath)).toBe(true)

      const content = fs.readFileSync(filepath, "utf-8")
      expect(content).toContain("No self-deploy mechanism")
      expect(content).toContain("Add restart wrapper")
      expect(content).toContain("within-bounds")
      expect(path.basename(filepath)).toMatch(/planning-reflection-no-self-deploy/)
    })

    it("creates tasks directory if missing", () => {
      const newRoot = path.join(tmpDir, "newagent")
      const proposal: ReflectionProposal = {
        timestamp: "2026-03-05T01:00:00.000Z",
        gap: "test gap",
        proposal: "test proposal",
        estimatedEffort: "medium",
        constitutionCheck: "requires-review",
        rawOutput: "raw",
      }

      const filepath = writeProposalTask(proposal, newRoot)
      expect(fs.existsSync(filepath)).toBe(true)
    })
  })
})
