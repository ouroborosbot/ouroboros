import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}))

vi.mock("../../repertoire/skills", () => ({
  listSkills: vi.fn(),
  loadSkill: vi.fn(),
}))

import * as fs from "fs"
import { execSync, spawnSync } from "child_process"
import { listSkills, loadSkill } from "../../repertoire/skills"

describe("execTool", () => {
  let execTool: (name: string, args: any) => Promise<string>

  beforeEach(async () => {
    vi.resetModules()
    const tools = await import("../../engine/tools")
    execTool = tools.execTool
  })

  it("git_commit stages explicit paths and commits", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(execSync)
      .mockReturnValueOnce("") // git add path
      .mockReturnValueOnce(" file | 2 +-") // git diff --cached --stat
      .mockReturnValueOnce("") // git commit

    const result = await execTool("git_commit", {
      message: "test commit",
      paths: ["docs/psyche/SOUL.md"],
    })

    expect(execSync).toHaveBeenCalledWith("git add docs/psyche/SOUL.md", expect.any(Object))
    expect(execSync).toHaveBeenCalledWith("git diff --cached --stat", expect.any(Object))
    expect(execSync).toHaveBeenCalledWith(
      'git commit -m "test commit"',
      expect.any(Object),
    )
    expect(result).toContain("committed")
  })

  it("git_commit returns post-it if nothing staged", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(execSync)
      .mockReturnValueOnce("") // git add
      .mockReturnValueOnce("") // empty diff

    const result = await execTool("git_commit", {
      message: "empty",
      paths: ["file.ts"],
    })

    expect(result).toContain("post-it from past you")
  })

  it("git_commit returns post-it if file does not exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = await execTool("git_commit", {
      message: "bad path",
      paths: ["missing.ts"],
    })

    expect(result).toContain("post-it from past you")
    expect(result).toContain("does not exist")
  })

  it("git_commit requires paths", async () => {
    const result = await execTool("git_commit", {
      message: "no paths",
    })

    expect(result).toContain("post-it from past you")
    expect(result).toContain("paths are required")
  })
})

describe("summarizeArgs", () => {
  let summarizeArgs: (name: string, args: Record<string, any>) => string

  beforeEach(async () => {
    vi.resetModules()
    const tools = await import("../../engine/tools")
    summarizeArgs = tools.summarizeArgs
  })

  it("returns truncated message for git_commit", () => {
    const msg = "a".repeat(50)
    expect(summarizeArgs("git_commit", { message: msg })).toBe("a".repeat(40))
  })
} )
