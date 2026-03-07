import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}))

vi.mock("../../repertoire/skills", () => ({
  listSkills: vi.fn(),
  loadSkill: vi.fn(),
}))

vi.mock("../../repertoire/tasks", () => ({
  getTaskModule: () => ({
    getBoard: vi.fn(),
    createTask: vi.fn(),
    updateStatus: vi.fn(),
    boardStatus: vi.fn(),
    boardAction: vi.fn(),
    boardDeps: vi.fn(),
    boardSessions: vi.fn(),
  }),
}))

vi.mock("../../heart/identity", () => ({
  getAgentRoot: vi.fn(() => "/mock/agent-root"),
  getAgentName: vi.fn(() => "testagent"),
  loadAgentConfig: vi.fn(() => ({
    provider: "anthropic",
    context: { maxTokens: 80000, contextMargin: 20 },
    phrases: { thinking: [], tool: [], followup: [] },
  })),
  DEFAULT_AGENT_CONTEXT: { maxTokens: 80000, contextMargin: 20 },
}))

import * as fs from "fs"

beforeEach(() => {
  vi.mocked(fs.existsSync).mockReset()
  vi.mocked(fs.readFileSync).mockReset()
})

describe("query_session tool", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("is registered in baseToolDefinitions", async () => {
    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const tool = baseToolDefinitions.find(d => d.tool.function.name === "query_session")
    expect(tool).toBeDefined()
    expect(tool!.tool.function.parameters).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["friendId", "channel"]),
    })
  })

  it("loads session messages and returns formatted summary", async () => {
    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const tool = baseToolDefinitions.find(d => d.tool.function.name === "query_session")!

    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        version: 1,
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "how is the billing fix?" },
          { role: "assistant", content: "I finished it an hour ago." },
          { role: "user", content: "great, any issues?" },
          { role: "assistant", content: "No, all tests pass." },
        ],
      }),
    )

    const result = await tool.handler({
      friendId: "friend-uuid-1",
      channel: "teams",
      key: "thread1",
    })

    expect(result).toContain("how is the billing fix?")
    expect(result).toContain("I finished it an hour ago.")
    expect(result).toContain("No, all tests pass.")
  })

  it("limits messages to messageCount parameter", async () => {
    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const tool = baseToolDefinitions.find(d => d.tool.function.name === "query_session")!

    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        version: 1,
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "first message" },
          { role: "assistant", content: "first reply" },
          { role: "user", content: "second message" },
          { role: "assistant", content: "second reply" },
          { role: "user", content: "third message" },
          { role: "assistant", content: "third reply" },
        ],
      }),
    )

    const result = await tool.handler({
      friendId: "friend-uuid-1",
      channel: "cli",
      key: "session",
      messageCount: "2",
    })

    expect(result).toContain("third message")
    expect(result).toContain("third reply")
    expect(result).not.toContain("first message")
  })

  it("returns error message when session file does not exist", async () => {
    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const tool = baseToolDefinitions.find(d => d.tool.function.name === "query_session")!

    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT")
    })

    const result = await tool.handler({
      friendId: "nonexistent",
      channel: "cli",
      key: "session",
    })

    expect(result).toContain("no session found")
  })

  it("defaults key to 'session' when not provided", async () => {
    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const tool = baseToolDefinitions.find(d => d.tool.function.name === "query_session")!

    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        version: 1,
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi there" },
        ],
      }),
    )

    const result = await tool.handler({
      friendId: "friend-1",
      channel: "cli",
    })

    expect(result).toContain("hello")
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining("session.json"),
      "utf-8",
    )
  })
})
