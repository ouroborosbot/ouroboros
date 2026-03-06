import { describe, expect, it, vi } from "vitest"

import { spawnCodingProcess } from "../../coding/spawner"

vi.mock("../../identity", () => ({
  getRepoRoot: vi.fn(() => "/mock/repo"),
}))

class FakeProcess {
  readonly pid: number | undefined
  readonly stdin = {
    write: vi.fn(),
  }
  readonly stdout = {
    on: vi.fn(),
  }
  readonly stderr = {
    on: vi.fn(),
  }
  readonly on = vi.fn()
  readonly kill = vi.fn(() => true)

  constructor(pid?: number) {
    this.pid = pid
  }
}

describe("coding spawner", () => {
  it("builds claude command and prompt with subagent + state content", () => {
    const spawnFn = vi.fn(() => new FakeProcess(777))
    const existsSync = vi.fn((target: string) => target.includes("work-doer.md") || target.endsWith("/state.md"))
    const readFileSync = vi.fn((target: string) => {
      if (target.includes("work-doer.md")) return "DOER INSTRUCTIONS"
      if (target.endsWith("/state.md")) return "STATE PAYLOAD"
      return ""
    })

    const result = spawnCodingProcess(
      {
        runner: "claude",
        subagent: "doer",
        workdir: "/Users/test/AgentWorkspaces/ouroboros",
        prompt: "execute",
        stateFile: "/tmp/state.md",
      },
      { spawnFn, existsSync, readFileSync },
    )

    expect(result.command).toBe("claude")
    expect(result.args).toEqual(["-p", "--dangerously-skip-permissions", "--add-dir", "/Users/test/AgentWorkspaces/ouroboros"])
    expect(result.prompt).toContain("DOER INSTRUCTIONS")
    expect(result.prompt).toContain("State file (/tmp/state.md):")
    expect(result.prompt).toContain("STATE PAYLOAD")
    expect(result.prompt).toContain("execute")
    expect(spawnFn).toHaveBeenCalledWith(
      "claude",
      ["-p", "--dangerously-skip-permissions", "--add-dir", "/Users/test/AgentWorkspaces/ouroboros"],
      { cwd: "/Users/test/AgentWorkspaces/ouroboros", stdio: ["pipe", "pipe", "pipe"] },
    )
    expect((result.process as any).stdin.write).toHaveBeenCalledWith(`${result.prompt}\n`)
  })

  it("builds codex command and prompt fallback when files are missing", () => {
    const spawnFn = vi.fn(() => new FakeProcess())
    const existsSync = vi.fn(() => false)
    const readFileSync = vi.fn(() => "unused")

    const result = spawnCodingProcess(
      {
        runner: "codex",
        subagent: "planner",
        workdir: "/Users/test/AgentWorkspaces/slugger",
        prompt: "plan",
      },
      { spawnFn, existsSync, readFileSync },
    )

    expect(result.command).toBe("codex")
    expect(result.args).toEqual(["exec", "--skip-git-repo-check", "--cwd", "/Users/test/AgentWorkspaces/slugger"])
    expect(result.prompt).toBe("plan")
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it("drops empty instruction/state content from prompt sections", () => {
    const spawnFn = vi.fn(() => new FakeProcess(99))
    const existsSync = vi.fn(() => true)
    const readFileSync = vi.fn(() => "   ")

    const result = spawnCodingProcess(
      {
        runner: "claude",
        subagent: "merger",
        workdir: "/Users/test/AgentWorkspaces/ouroboros",
        prompt: "merge now",
        stateFile: "/tmp/blank.md",
      },
      { spawnFn, existsSync, readFileSync },
    )

    expect(result.prompt).toBe("merge now")
  })
})
