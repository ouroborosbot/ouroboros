import { describe, expect, it, vi } from "vitest"

describe("workspaces default origin lookup", () => {
  it("uses git remote origin when getOriginUrl is not provided", async () => {
    vi.resetModules()

    const execSync = vi.fn((command: string) => {
      if (command.includes("remote get-url origin")) {
        return "https://github.com/ouroborosbot/ouroboros\n"
      }
      return ""
    })

    vi.doMock("child_process", () => ({ execSync }))
    vi.doMock("../../identity", () => ({ getRepoRoot: () => "/mock/repo" }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    const { ensureAgentWorkspace } = await import("../../daemon/workspaces")

    const mkdirSync = vi.fn()
    const existsSync = vi.fn(() => false)

    ensureAgentWorkspace("slugger", {
      homeDir: "/Users/test",
      deps: {
        mkdirSync,
        existsSync,
      },
    })

    expect(execSync).toHaveBeenCalledWith(
      "git -C /mock/repo remote get-url origin",
      expect.objectContaining({ encoding: "utf-8" }),
    )
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining(
        "git clone --branch main https://github.com/ouroborosbot/ouroboros /Users/test/AgentWorkspaces/slugger",
      ),
      expect.objectContaining({ encoding: "utf-8" }),
    )
  })

  it("falls back to os/fs defaults when options are omitted", async () => {
    vi.resetModules()

    const execSync = vi.fn((command: string) => {
      if (command.includes("remote get-url origin")) {
        return "https://github.com/ouroborosbot/ouroboros\n"
      }
      return ""
    })
    const mkdirSync = vi.fn()
    const existsSync = vi.fn(() => true)

    vi.doMock("child_process", () => ({ execSync }))
    vi.doMock("fs", () => ({ existsSync, mkdirSync }))
    vi.doMock("os", () => ({ homedir: () => "/Users/default" }))
    vi.doMock("../../identity", () => ({ getRepoRoot: () => "/mock/repo" }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    const { ensureAgentWorkspace } = await import("../../daemon/workspaces")
    const result = ensureAgentWorkspace("ouroboros")

    expect(result).toEqual({
      workspacePath: "/Users/default/AgentWorkspaces/ouroboros",
      created: false,
      updated: true,
    })
    expect(mkdirSync).toHaveBeenCalledWith("/Users/default/AgentWorkspaces", { recursive: true })
    expect(execSync).toHaveBeenCalledWith(
      "git -C /Users/default/AgentWorkspaces/ouroboros fetch origin main",
      expect.objectContaining({ encoding: "utf-8" }),
    )
    expect(execSync).toHaveBeenCalledWith(
      "git -C /Users/default/AgentWorkspaces/ouroboros pull --ff-only origin main",
      expect.objectContaining({ encoding: "utf-8" }),
    )
  })
})
