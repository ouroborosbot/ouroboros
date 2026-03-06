import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../coding", () => ({
  getCodingSessionManager: vi.fn(),
}))

import { getCodingSessionManager } from "../../coding"

describe("coding tool contracts", () => {
  const manager = {
    spawnSession: vi.fn(),
    getSession: vi.fn(),
    listSessions: vi.fn(),
    sendInput: vi.fn(),
    killSession: vi.fn(),
  }

  let execTool: (name: string, args: Record<string, string>) => Promise<string>
  let summarizeArgs: (name: string, args: Record<string, string>) => string

  beforeEach(async () => {
    vi.resetModules()
    vi.mocked(getCodingSessionManager).mockReturnValue(manager as unknown as ReturnType<typeof getCodingSessionManager>)
    manager.spawnSession.mockReset()
    manager.getSession.mockReset()
    manager.listSessions.mockReset()
    manager.sendInput.mockReset()
    manager.killSession.mockReset()

    const tools = await import("../../repertoire/tools")
    execTool = tools.execTool
    summarizeArgs = tools.summarizeArgs
  })

  it("coding_spawn validates runner and subagent args", async () => {
    const invalidRunner = await execTool("coding_spawn", {
      runner: "bad-runner",
      subagent: "doer",
      workdir: "/Users/test/AgentWorkspaces/ouroboros",
      prompt: "do work",
    })
    expect(invalidRunner).toContain("invalid runner")

    const invalidSubagent = await execTool("coding_spawn", {
      runner: "claude",
      subagent: "bad-subagent",
      workdir: "/Users/test/AgentWorkspaces/ouroboros",
      prompt: "do work",
    })
    expect(invalidSubagent).toContain("invalid subagent")
  })

  it("coding_spawn validates required fields", async () => {
    expect(
      await execTool("coding_spawn", {
        subagent: "doer",
        workdir: "/Users/test/AgentWorkspaces/ouroboros",
        prompt: "go",
      }),
    ).toContain("runner is required")

    expect(
      await execTool("coding_spawn", {
        runner: "claude",
        workdir: "/Users/test/AgentWorkspaces/ouroboros",
        prompt: "go",
      }),
    ).toContain("subagent is required")

    expect(
      await execTool("coding_spawn", {
        runner: "claude",
        subagent: "doer",
        prompt: "go",
      }),
    ).toContain("workdir is required")

    expect(
      await execTool("coding_spawn", {
        runner: "claude",
        subagent: "doer",
        workdir: "/Users/test/AgentWorkspaces/ouroboros",
      }),
    ).toContain("prompt is required")
  })

  it("coding_spawn delegates to manager and returns a JSON session payload", async () => {
    manager.spawnSession.mockResolvedValue({
      id: "coding-001",
      runner: "claude",
      subagent: "doer",
      workdir: "/Users/test/AgentWorkspaces/ouroboros",
      taskRef: "task-123",
      scopeFile: "/tmp/scope.md",
      stateFile: "/tmp/state.md",
      status: "running",
      pid: 4321,
      startedAt: "2026-03-05T23:50:00.000Z",
      lastActivityAt: "2026-03-05T23:50:00.000Z",
      endedAt: null,
      restartCount: 0,
      lastExitCode: null,
      lastSignal: null,
    })

    const result = await execTool("coding_spawn", {
      runner: "claude",
      subagent: "doer",
      workdir: "/Users/test/AgentWorkspaces/ouroboros",
      prompt: "execute",
      taskRef: "task-123",
      scopeFile: "/tmp/scope.md",
      stateFile: "/tmp/state.md",
    })

    expect(manager.spawnSession).toHaveBeenCalledWith({
      runner: "claude",
      subagent: "doer",
      workdir: "/Users/test/AgentWorkspaces/ouroboros",
      prompt: "execute",
      taskRef: "task-123",
      scopeFile: "/tmp/scope.md",
      stateFile: "/tmp/state.md",
    })
    expect(JSON.parse(result)).toMatchObject({
      id: "coding-001",
      runner: "claude",
      subagent: "doer",
      status: "running",
    })
  })

  it("coding_spawn omits blank optional args", async () => {
    manager.spawnSession.mockResolvedValue({
      id: "coding-009",
      runner: "codex",
      subagent: "planner",
      workdir: "/Users/test/AgentWorkspaces/slugger",
      status: "running",
      pid: null,
      startedAt: "2026-03-05T23:50:00.000Z",
      lastActivityAt: "2026-03-05T23:50:00.000Z",
      endedAt: null,
      restartCount: 0,
      lastExitCode: null,
      lastSignal: null,
    })

    await execTool("coding_spawn", {
      runner: "codex",
      subagent: "planner",
      workdir: "/Users/test/AgentWorkspaces/slugger",
      prompt: "plan",
      scopeFile: "   ",
      stateFile: "",
    })

    expect(manager.spawnSession).toHaveBeenCalledWith({
      runner: "codex",
      subagent: "planner",
      workdir: "/Users/test/AgentWorkspaces/slugger",
      prompt: "plan",
    })
  })

  it("coding_status returns single-session JSON when sessionId is provided", async () => {
    manager.getSession.mockReturnValue({
      id: "coding-001",
      runner: "claude",
      subagent: "planner",
      workdir: "/Users/test/AgentWorkspaces/slugger",
      status: "waiting_input",
      pid: 100,
      startedAt: "2026-03-05T23:50:00.000Z",
      lastActivityAt: "2026-03-05T23:51:00.000Z",
      endedAt: null,
      restartCount: 0,
      lastExitCode: null,
      lastSignal: null,
    })

    const result = await execTool("coding_status", { sessionId: "coding-001" })
    expect(manager.getSession).toHaveBeenCalledWith("coding-001")
    expect(JSON.parse(result)).toMatchObject({
      id: "coding-001",
      status: "waiting_input",
    })
  })

  it("coding_status returns not found message for unknown session", async () => {
    manager.getSession.mockReturnValue(null)
    const result = await execTool("coding_status", { sessionId: "coding-missing" })
    expect(result).toContain("session not found: coding-missing")
  })

  it("coding_status returns all sessions when sessionId is omitted", async () => {
    manager.listSessions.mockReturnValue([
      {
        id: "coding-001",
        runner: "claude",
        subagent: "planner",
        workdir: "/Users/test/AgentWorkspaces/slugger",
        status: "running",
        pid: 100,
        startedAt: "2026-03-05T23:50:00.000Z",
        lastActivityAt: "2026-03-05T23:51:00.000Z",
        endedAt: null,
        restartCount: 0,
        lastExitCode: null,
        lastSignal: null,
      },
      {
        id: "coding-002",
        runner: "codex",
        subagent: "doer",
        workdir: "/Users/test/AgentWorkspaces/ouroboros",
        status: "running",
        pid: null,
        startedAt: "2026-03-05T23:52:00.000Z",
        lastActivityAt: "2026-03-05T23:52:00.000Z",
        endedAt: null,
        restartCount: 0,
        lastExitCode: null,
        lastSignal: null,
      },
    ])

    const result = await execTool("coding_status", {})
    expect(manager.listSessions).toHaveBeenCalledTimes(1)
    expect(JSON.parse(result)).toHaveLength(2)
  })

  it("coding_send_input validates required args", async () => {
    const missingSessionId = await execTool("coding_send_input", { input: "continue" })
    expect(missingSessionId).toContain("sessionId is required")

    const missingInput = await execTool("coding_send_input", { sessionId: "coding-001" })
    expect(missingInput).toContain("input is required")
  })

  it("coding_send_input returns manager action payload as JSON", async () => {
    manager.sendInput.mockReturnValue({ ok: true, message: "input sent to coding-001" })

    const result = await execTool("coding_send_input", { sessionId: "coding-001", input: "continue" })
    expect(manager.sendInput).toHaveBeenCalledWith("coding-001", "continue")
    expect(JSON.parse(result)).toEqual({ ok: true, message: "input sent to coding-001" })
  })

  it("coding_kill validates sessionId and returns manager action payload as JSON", async () => {
    const missingSessionId = await execTool("coding_kill", {})
    expect(missingSessionId).toContain("sessionId is required")

    manager.killSession.mockReturnValue({ ok: true, message: "killed coding-001" })

    const result = await execTool("coding_kill", { sessionId: "coding-001" })
    expect(manager.killSession).toHaveBeenCalledWith("coding-001")
    expect(JSON.parse(result)).toEqual({ ok: true, message: "killed coding-001" })
  })

  it("execTool emits and rethrows Error values from coding handlers", async () => {
    manager.getSession.mockImplementation(() => {
      throw new Error("manager exploded")
    })
    await expect(execTool("coding_status", { sessionId: "coding-001" })).rejects.toThrow("manager exploded")
  })

  it("summarizeArgs includes coding tool summaries", () => {
    expect(
      summarizeArgs("coding_spawn", {
        runner: "claude",
        subagent: "doer",
        workdir: "/Users/test/AgentWorkspaces/ouroboros",
        taskRef: "task-9",
      }),
    ).toContain("runner=claude")
    expect(summarizeArgs("coding_status", { sessionId: "coding-001" })).toBe("sessionId=coding-001")
    expect(summarizeArgs("coding_send_input", { sessionId: "coding-001", input: "continue" })).toContain("input=continue")
    expect(summarizeArgs("coding_kill", { sessionId: "coding-001" })).toBe("sessionId=coding-001")
  })

  it("summarizeArgs handles unknown tools with empty args", () => {
    expect(summarizeArgs("totally_unknown", {})).toBe("")
  })
})
