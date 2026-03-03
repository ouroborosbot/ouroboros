import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

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

vi.mock("../../repertoire/graph-client", () => ({
  getProfile: vi.fn(),
  graphRequest: vi.fn(),
}))

vi.mock("../../repertoire/ado-client", () => ({
  queryWorkItems: vi.fn(),
  adoRequest: vi.fn(),
}))

vi.mock("../../identity", () => ({
  loadAgentConfig: vi.fn(() => ({
    name: "testagent",
    configPath: "~/.agentconfigs/testagent/config.json",
  })),
  getAgentName: vi.fn(() => "testagent"),
  getAgentRoot: vi.fn(() => "/mock/repo/testagent"),
  getRepoRoot: vi.fn(() => "/mock/repo"),
  resetIdentity: vi.fn(),
}))

import * as fs from "fs"
import { execSync, spawnSync } from "child_process"
import { listSkills, loadSkill } from "../../repertoire/skills"

describe("execTool", () => {
  let execTool: (name: string, args: any) => Promise<string>
  let setTestConfig: (partial: any) => void

  beforeEach(async () => {
    vi.resetModules()
    vi.mocked(fs.existsSync).mockReset()
    vi.mocked(fs.readFileSync).mockReset()
    vi.mocked(fs.writeFileSync).mockReset()
    vi.mocked(fs.readdirSync).mockReset()
    vi.mocked(execSync).mockReset()
    vi.mocked(spawnSync).mockReset()
    vi.mocked(listSkills).mockReset()
    vi.mocked(loadSkill).mockReset()
    const config = await import("../../config")
    config.resetConfigCache()
    setTestConfig = config.setTestConfig
    const tools = await import("../../repertoire/tools")
    execTool = tools.execTool
  })

  // ── read_file ──
  it("read_file reads file contents", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("file content here")
    const result = await execTool("read_file", { path: "/tmp/test.txt" })
    expect(result).toBe("file content here")
    expect(fs.readFileSync).toHaveBeenCalledWith("/tmp/test.txt", "utf-8")
  })

  // ── write_file ──
  it("write_file writes content and returns ok", async () => {
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    const result = await execTool("write_file", { path: "/tmp/out.txt", content: "hello" })
    expect(result).toBe("ok")
    expect(fs.writeFileSync).toHaveBeenCalledWith("/tmp/out.txt", "hello", "utf-8")
  })

  // ── shell ──
  it("shell runs command and returns output", async () => {
    vi.mocked(execSync).mockReturnValue("shell output")
    const result = await execTool("shell", { command: "echo hello" })
    expect(result).toBe("shell output")
    expect(execSync).toHaveBeenCalledWith("echo hello", { encoding: "utf-8", timeout: 30000 })
  })

  // ── gh_cli ──
  it("gh_cli runs gh command and returns output", async () => {
    vi.mocked(execSync).mockReturnValue("pr list output")
    const result = await execTool("gh_cli", { command: "pr list" })
    expect(result).toBe("pr list output")
    expect(execSync).toHaveBeenCalledWith("gh pr list", { encoding: "utf-8", timeout: 60000 })
  })

  it("gh_cli returns error on exception", async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("gh not found") })
    const result = await execTool("gh_cli", { command: "pr list" })
    expect(result).toContain("error:")
    expect(result).toContain("gh not found")
  })

  // ── list_directory ──
  it("list_directory lists entries with d/- prefix", async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: "src", isDirectory: () => true, isFile: () => false } as any,
      { name: "readme.md", isDirectory: () => false, isFile: () => true } as any,
    ])
    const result = await execTool("list_directory", { path: "/tmp" })
    expect(result).toBe("d  src\n-  readme.md")
    expect(fs.readdirSync).toHaveBeenCalledWith("/tmp", { withFileTypes: true })
  })

  // ── git_commit ──
  it("git_commit stages explicit paths and commits", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(execSync)
      .mockReturnValueOnce("") // git add path
      .mockReturnValueOnce(" file | 2 +-") // git diff --cached --stat
      .mockReturnValueOnce("") // git commit

    const result = await execTool("git_commit", {
      message: "test commit",
      paths: ["psyche/SOUL.md"],
    })

    expect(execSync).toHaveBeenCalledWith("git add psyche/SOUL.md", expect.any(Object))
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
    expect(result).toContain("nothing was staged")
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

  it("git_commit returns post-it for empty paths array", async () => {
    const result = await execTool("git_commit", {
      message: "no paths",
      paths: [],
    })

    expect(result).toContain("post-it from past you")
    expect(result).toContain("paths are required")
  })

  it("git_commit returns post-it for non-array paths", async () => {
    const result = await execTool("git_commit", {
      message: "bad paths",
      paths: "not-an-array",
    })

    expect(result).toContain("post-it from past you")
    expect(result).toContain("paths are required")
  })

  it("git_commit catches exceptions and returns failure", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(execSync).mockImplementation(() => { throw new Error("git error") })

    const result = await execTool("git_commit", {
      message: "fail",
      paths: ["file.ts"],
    })

    expect(result).toContain("failed:")
    expect(result).toContain("git error")
  })

  it("git_commit handles whitespace-only diff as nothing staged", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(execSync)
      .mockReturnValueOnce("") // git add
      .mockReturnValueOnce("   \n  ") // whitespace-only diff

    const result = await execTool("git_commit", {
      message: "whitespace",
      paths: ["file.ts"],
    })

    expect(result).toContain("nothing was staged")
  })

  // ── list_skills ──
  it("list_skills returns JSON of skills", async () => {
    vi.mocked(listSkills).mockReturnValue(["skill1", "skill2"] as any)
    const result = await execTool("list_skills", {})
    expect(result).toBe('["skill1","skill2"]')
  })

  // ── load_skill ──
  it("load_skill returns skill content", async () => {
    vi.mocked(loadSkill).mockReturnValue("skill content here")
    const result = await execTool("load_skill", { name: "my-skill" })
    expect(result).toBe("skill content here")
    expect(loadSkill).toHaveBeenCalledWith("my-skill")
  })

  it("load_skill returns error on exception", async () => {
    vi.mocked(loadSkill).mockImplementation(() => { throw new Error("not found") })
    const result = await execTool("load_skill", { name: "missing" })
    expect(result).toContain("error:")
    expect(result).toContain("not found")
  })

  // ── get_current_time ──
  it("get_current_time returns formatted date string", async () => {
    const result = await execTool("get_current_time", {})
    // Should be a non-empty string with date-like content
    expect(result.length).toBeGreaterThan(0)
    // Should contain numbers (date/time components)
    expect(result).toMatch(/\d/)
  })

  // ── claude ──
  it("claude spawns claude process and returns stdout", async () => {
    vi.mocked(spawnSync).mockReturnValue({
      stdout: "claude says hello",
      stderr: "",
      status: 0,
      error: undefined,
      signal: null,
      pid: 123,
      output: [],
    } as any)

    const result = await execTool("claude", { prompt: "hello" })
    expect(result).toBe("claude says hello")
    expect(spawnSync).toHaveBeenCalledWith(
      "claude",
      ["-p", "--dangerously-skip-permissions", "--add-dir", "."],
      { input: "hello", encoding: "utf-8", timeout: 60000 },
    )
  })

  it("claude returns error when spawnSync has error property", async () => {
    vi.mocked(spawnSync).mockReturnValue({
      stdout: "",
      stderr: "",
      status: null,
      error: new Error("ENOENT"),
      signal: null,
      pid: 0,
      output: [],
    } as any)

    const result = await execTool("claude", { prompt: "test" })
    expect(result).toContain("error:")
    expect(result).toContain("ENOENT")
  })

  it("claude returns error when exit code is non-zero", async () => {
    vi.mocked(spawnSync).mockReturnValue({
      stdout: "",
      stderr: "something went wrong",
      status: 1,
      error: undefined,
      signal: null,
      pid: 123,
      output: [],
    } as any)

    const result = await execTool("claude", { prompt: "test" })
    expect(result).toContain("claude exited with code 1")
    expect(result).toContain("something went wrong")
  })

  it("claude returns '(no output)' when stdout is empty", async () => {
    vi.mocked(spawnSync).mockReturnValue({
      stdout: "",
      stderr: "",
      status: 0,
      error: undefined,
      signal: null,
      pid: 123,
      output: [],
    } as any)

    const result = await execTool("claude", { prompt: "test" })
    expect(result).toBe("(no output)")
  })

  it("claude catches thrown exceptions", async () => {
    vi.mocked(spawnSync).mockImplementation(() => { throw new Error("spawn failed") })

    const result = await execTool("claude", { prompt: "test" })
    expect(result).toContain("error:")
    expect(result).toContain("spawn failed")
  })

  // ── web_search ──
  it("web_search returns error when perplexityApiKey not configured", async () => {
    setTestConfig({ integrations: { perplexityApiKey: "" } })

    const result = await execTool("web_search", { query: "test" })
    expect(result).toBe("error: perplexityApiKey not configured in config.json")
  })

  it("web_search returns results on success", async () => {
    setTestConfig({ integrations: { perplexityApiKey: "test-key" } })

    const mockResults = {
      results: [
        { title: "Result 1", url: "https://example.com/1", snippet: "First result" },
        { title: "Result 2", url: "https://example.com/2", snippet: "Second result" },
      ],
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await execTool("web_search", { query: "test query" })
    expect(result).toContain("Result 1")
    expect(result).toContain("https://example.com/1")
    expect(result).toContain("First result")
    expect(result).toContain("Result 2")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.perplexity.ai/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        }),
      }),
    )

    vi.unstubAllGlobals()
  })

  it("web_search returns error on non-ok response", async () => {
    setTestConfig({ integrations: { perplexityApiKey: "test-key" } })

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await execTool("web_search", { query: "test" })
    expect(result).toBe("error: 429 Too Many Requests")

    vi.unstubAllGlobals()
  })

  it("web_search returns 'no results found' when results array is empty", async () => {
    setTestConfig({ integrations: { perplexityApiKey: "test-key" } })

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await execTool("web_search", { query: "test" })
    expect(result).toBe("no results found")

    vi.unstubAllGlobals()
  })

  it("web_search returns 'no results found' when results is undefined", async () => {
    setTestConfig({ integrations: { perplexityApiKey: "test-key" } })

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await execTool("web_search", { query: "test" })
    expect(result).toBe("no results found")

    vi.unstubAllGlobals()
  })

  it("web_search catches fetch exceptions", async () => {
    setTestConfig({ integrations: { perplexityApiKey: "test-key" } })

    const mockFetch = vi.fn().mockRejectedValue(new Error("network error"))
    vi.stubGlobal("fetch", mockFetch)

    const result = await execTool("web_search", { query: "test" })
    expect(result).toContain("error:")
    expect(result).toContain("network error")

    vi.unstubAllGlobals()
  })

  // ── unknown tool ──
  it("returns 'unknown' for unrecognized tool name", async () => {
    const result = await execTool("nonexistent_tool", {})
    expect(result).toBe("unknown: nonexistent_tool")
  })
})

describe("summarizeArgs", () => {
  let summarizeArgs: (name: string, args: Record<string, any>) => string

  beforeEach(async () => {
    vi.resetModules()
    const tools = await import("../../repertoire/tools")
    summarizeArgs = tools.summarizeArgs
  })

  it("returns path for read_file", () => {
    expect(summarizeArgs("read_file", { path: "/tmp/test.txt" })).toBe("/tmp/test.txt")
  })

  it("returns empty string for read_file with no path", () => {
    expect(summarizeArgs("read_file", {})).toBe("")
  })

  it("returns path for write_file", () => {
    expect(summarizeArgs("write_file", { path: "/tmp/out.txt", content: "x" })).toBe("/tmp/out.txt")
  })

  it("returns short command for shell", () => {
    expect(summarizeArgs("shell", { command: "echo hi" })).toBe("echo hi")
  })

  it("returns truncated command for shell when > 50 chars", () => {
    const longCmd = "a".repeat(60)
    expect(summarizeArgs("shell", { command: longCmd })).toBe("a".repeat(50) + "...")
  })

  it("returns empty string for shell with no command", () => {
    expect(summarizeArgs("shell", {})).toBe("")
  })

  it("returns path for list_directory", () => {
    expect(summarizeArgs("list_directory", { path: "/tmp" })).toBe("/tmp")
  })

  it("returns empty string for list_directory with no path", () => {
    expect(summarizeArgs("list_directory", {})).toBe("")
  })

  it("returns truncated message for git_commit", () => {
    const msg = "a".repeat(50)
    expect(summarizeArgs("git_commit", { message: msg })).toBe("a".repeat(40))
  })

  it("returns empty string for git_commit with no message", () => {
    expect(summarizeArgs("git_commit", {})).toBe("")
  })

  it("returns truncated command for gh_cli", () => {
    const cmd = "a".repeat(50)
    expect(summarizeArgs("gh_cli", { command: cmd })).toBe("a".repeat(40))
  })

  it("returns empty string for gh_cli with no command", () => {
    expect(summarizeArgs("gh_cli", {})).toBe("")
  })

  it("returns name for load_skill", () => {
    expect(summarizeArgs("load_skill", { name: "my-skill" })).toBe("my-skill")
  })

  it("returns empty string for load_skill with no name", () => {
    expect(summarizeArgs("load_skill", {})).toBe("")
  })

  it("returns truncated prompt for claude", () => {
    const prompt = "a".repeat(50)
    expect(summarizeArgs("claude", { prompt })).toBe("a".repeat(40))
  })

  it("returns empty string for claude with no prompt", () => {
    expect(summarizeArgs("claude", {})).toBe("")
  })

  it("returns truncated query for web_search", () => {
    const query = "a".repeat(50)
    expect(summarizeArgs("web_search", { query })).toBe("a".repeat(40))
  })

  it("returns empty string for web_search with no query", () => {
    expect(summarizeArgs("web_search", {})).toBe("")
  })

  it("returns truncated JSON for unknown tool", () => {
    expect(summarizeArgs("unknown_tool", { key: "value" })).toBe('{"key":"value"}')
  })

  it("truncates long JSON for unknown tool to 30 chars", () => {
    const longVal = "a".repeat(40)
    const result = summarizeArgs("unknown_tool", { key: longVal })
    expect(result.length).toBe(30)
  })
})

describe("tools array export", () => {
  it("exports tools array with expected tool names", async () => {
    vi.resetModules()
    const { tools } = await import("../../repertoire/tools")
    const names = tools.map((t) => t.function.name)
    expect(names).toContain("read_file")
    expect(names).toContain("write_file")
    expect(names).toContain("shell")
    expect(names).toContain("list_directory")
    expect(names).toContain("git_commit")
    expect(names).toContain("list_skills")
    expect(names).toContain("load_skill")
    expect(names).toContain("get_current_time")
    expect(names).toContain("claude")
    expect(names).toContain("web_search")
  })
})

describe("finalAnswerTool", () => {
  it("has correct name, description, and schema", async () => {
    vi.resetModules()
    const { finalAnswerTool } = await import("../../repertoire/tools")
    expect(finalAnswerTool.type).toBe("function")
    expect(finalAnswerTool.function.name).toBe("final_answer")
    expect(finalAnswerTool.function.description).toBe(
      "give your final text response. use this when you want to reply with text instead of calling another tool."
    )
    expect(finalAnswerTool.function.parameters).toEqual({
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
    })
  })

  it("is NOT included in the default tools array", async () => {
    vi.resetModules()
    const { tools } = await import("../../repertoire/tools")
    const names = tools.map((t) => t.function.name)
    expect(names).not.toContain("final_answer")
  })
})

describe("getToolsForChannel", () => {
  it("returns only base tools for cli channel", async () => {
    vi.resetModules()
    const { getToolsForChannel, tools } = await import("../../repertoire/tools")
    const cliTools = getToolsForChannel("cli")
    const names = cliTools.map((t) => t.function.name)
    // Should have all base tools
    expect(names).toContain("read_file")
    expect(names).toContain("shell")
    // Should NOT have graph/ado tools
    expect(names).not.toContain("graph_profile")
    expect(names).not.toContain("ado_work_items")
    expect(names).not.toContain("graph_query")
    expect(names).not.toContain("graph_mutate")
    expect(names).not.toContain("ado_query")
    expect(names).not.toContain("ado_mutate")
    // Same length as base tools
    expect(cliTools.length).toBe(tools.length)
  })

  it("returns base tools plus all teams tools for teams channel", async () => {
    vi.resetModules()
    const { getToolsForChannel, tools } = await import("../../repertoire/tools")
    const teamsTools = getToolsForChannel("teams")
    const names = teamsTools.map((t) => t.function.name)
    // Should have all base tools
    expect(names).toContain("read_file")
    expect(names).toContain("shell")
    // Should have generic tools
    expect(names).toContain("graph_query")
    expect(names).toContain("graph_mutate")
    expect(names).toContain("ado_query")
    expect(names).toContain("ado_mutate")
    // Should have convenience aliases
    expect(names).toContain("graph_profile")
    expect(names).toContain("ado_work_items")
    // Should be longer than base tools (base + 8 teams tools: 4 generic + 2 aliases + 2 docs)
    expect(teamsTools.length).toBe(tools.length + 8)
  })

  it("returns base tools for undefined channel", async () => {
    vi.resetModules()
    const { getToolsForChannel, tools } = await import("../../repertoire/tools")
    const result = getToolsForChannel(undefined)
    expect(result.length).toBe(tools.length)
  })
})

describe("execTool with ToolContext", () => {
  it("passes ToolContext to graph_profile handler", async () => {
    vi.resetModules()
    const { getProfile } = await import("../../repertoire/graph-client")
    vi.mocked(getProfile).mockResolvedValue("Profile: Jane Doe")

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: "test-graph-token",
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("graph_profile", {}, ctx)
    expect(result).toBe("Profile: Jane Doe")
    expect(getProfile).toHaveBeenCalledWith("test-graph-token")
  })

  it("graph_profile returns AUTH_REQUIRED when graphToken missing", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("graph_profile", {}, ctx)
    expect(result).toBe("AUTH_REQUIRED:graph -- I need access to your Microsoft 365 profile. Please sign in when prompted.")
  })

  it("graph_profile returns AUTH_REQUIRED when no ToolContext provided", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("graph_profile", {})
    expect(result).toBe("AUTH_REQUIRED:graph -- I need access to your Microsoft 365 profile. Please sign in when prompted.")
  })

  it("passes ToolContext to ado_work_items handler", async () => {
    vi.resetModules()
    const { queryWorkItems } = await import("../../repertoire/ado-client")
    vi.mocked(queryWorkItems).mockResolvedValue("Work items: #123 Fix bug")

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-ado-token",
      signin: vi.fn(),
      adoOrganizations: ["myorg"],
    }

    const result = await execTool("ado_work_items", { organization: "myorg", query: "SELECT * FROM WorkItems" }, ctx)
    expect(result).toBe("Work items: #123 Fix bug")
    expect(queryWorkItems).toHaveBeenCalledWith("test-ado-token", "myorg", "SELECT * FROM WorkItems")
  })

  it("ado_work_items returns AUTH_REQUIRED when adoToken missing", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: ["myorg"],
    }

    const result = await execTool("ado_work_items", { organization: "myorg" }, ctx)
    expect(result).toBe("AUTH_REQUIRED:ado -- I need access to your Azure DevOps account. Please sign in when prompted.")
  })

  it("ado_work_items rejects invalid organization", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: ["org1", "org2"],
    }

    const result = await execTool("ado_work_items", { organization: "bad-org" }, ctx)
    expect(result).toContain("not in the configured organizations")
    expect(result).toContain("org1")
    expect(result).toContain("org2")
  })

  it("ado_work_items uses default query when none provided", async () => {
    vi.resetModules()
    const { queryWorkItems } = await import("../../repertoire/ado-client")
    vi.mocked(queryWorkItems).mockResolvedValue("Work items found")

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: ["myorg"],
    }

    const result = await execTool("ado_work_items", { organization: "myorg" }, ctx)
    expect(result).toBe("Work items found")
    // Should use default query
    expect(queryWorkItems).toHaveBeenCalledWith("test-token", "myorg", expect.stringContaining("SELECT"))
  })

  it("ado_work_items allows any org when adoOrganizations is empty", async () => {
    vi.resetModules()
    const { queryWorkItems } = await import("../../repertoire/ado-client")
    vi.mocked(queryWorkItems).mockResolvedValue("Work items found")

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("ado_work_items", { organization: "any-org" }, ctx)
    expect(result).toBe("Work items found")
  })

  it("ado_work_items returns AUTH_REQUIRED when no ToolContext provided", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("ado_work_items", { organization: "myorg" })
    expect(result).toBe("AUTH_REQUIRED:ado -- I need access to your Azure DevOps account. Please sign in when prompted.")
  })

  it("base tools work without ToolContext", async () => {
    vi.resetModules()
    vi.mocked(fs.readFileSync).mockReturnValue("file content")
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("read_file", { path: "/tmp/test.txt" })
    expect(result).toBe("file content")
  })

  it("base tools work with ToolContext (context is ignored)", async () => {
    vi.resetModules()
    vi.mocked(fs.readFileSync).mockReturnValue("file content")
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: "token",
      adoToken: "token",
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("read_file", { path: "/tmp/test.txt" }, ctx)
    expect(result).toBe("file content")
  })
})

describe("summarizeArgs for graph/ado tools", () => {
  let summarizeArgs: (name: string, args: Record<string, any>) => string

  beforeEach(async () => {
    vi.resetModules()
    const tools = await import("../../repertoire/tools")
    summarizeArgs = tools.summarizeArgs
  })

  it("returns empty string for graph_profile", () => {
    expect(summarizeArgs("graph_profile", {})).toBe("")
  })

  it("returns organization for ado_work_items", () => {
    expect(summarizeArgs("ado_work_items", { organization: "myorg", query: "some query" })).toBe("myorg")
  })

  it("returns empty string for ado_work_items with no organization", () => {
    expect(summarizeArgs("ado_work_items", {})).toBe("")
  })

  it("returns path for graph_query", () => {
    expect(summarizeArgs("graph_query", { path: "/me/messages" })).toBe("/me/messages")
  })

  it("returns empty string for graph_query with no path", () => {
    expect(summarizeArgs("graph_query", {})).toBe("")
  })

  it("returns method + path for graph_mutate", () => {
    expect(summarizeArgs("graph_mutate", { method: "POST", path: "/me/messages" })).toBe("POST /me/messages")
  })

  it("returns empty string for graph_mutate with no method/path", () => {
    expect(summarizeArgs("graph_mutate", {})).toBe(" ")
  })

  it("returns org + path for ado_query", () => {
    expect(summarizeArgs("ado_query", { organization: "myorg", path: "/_apis/git/repos" })).toBe("myorg /_apis/git/repos")
  })

  it("returns empty string parts for ado_query with no args", () => {
    expect(summarizeArgs("ado_query", {})).toBe(" ")
  })

  it("returns method + org + path for ado_mutate", () => {
    expect(summarizeArgs("ado_mutate", { method: "PATCH", organization: "myorg", path: "/_apis/wit/workitems/1" })).toBe("PATCH myorg /_apis/wit/workitems/1")
  })

  it("returns empty string parts for ado_mutate with no args", () => {
    expect(summarizeArgs("ado_mutate", {})).toBe("  ")
  })
})

describe("execTool for generic Graph tools", () => {
  it("graph_query calls graphRequest with GET", async () => {
    vi.resetModules()
    const { graphRequest } = await import("../../repertoire/graph-client")
    vi.mocked(graphRequest).mockResolvedValue('{"value": []}')

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: "test-token",
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("graph_query", { path: "/me/messages?$top=5" }, ctx)
    expect(result).toBe('{"value": []}')
    expect(graphRequest).toHaveBeenCalledWith("test-token", "GET", "/me/messages?$top=5")
  })

  it("graph_query returns AUTH_REQUIRED when graphToken missing", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("graph_query", { path: "/me" }, ctx)
    expect(result).toContain("AUTH_REQUIRED:graph")
  })

  it("graph_query returns AUTH_REQUIRED when no ToolContext", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("graph_query", { path: "/me" })
    expect(result).toContain("AUTH_REQUIRED:graph")
  })

  it("graph_mutate calls graphRequest with specified method and body", async () => {
    vi.resetModules()
    const { graphRequest } = await import("../../repertoire/graph-client")
    vi.mocked(graphRequest).mockResolvedValue('{"id": "msg-1"}')

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: "test-token",
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const body = '{"subject": "Hello"}'
    const result = await execTool("graph_mutate", { method: "POST", path: "/me/messages", body }, ctx)
    expect(result).toBe('{"id": "msg-1"}')
    expect(graphRequest).toHaveBeenCalledWith("test-token", "POST", "/me/messages", body)
  })

  it("graph_mutate calls graphRequest with PATCH method", async () => {
    vi.resetModules()
    const { graphRequest } = await import("../../repertoire/graph-client")
    vi.mocked(graphRequest).mockResolvedValue('{"updated": true}')

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: "test-token",
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("graph_mutate", { method: "PATCH", path: "/me/events/1", body: '{"subject":"Updated"}' }, ctx)
    expect(result).toBe('{"updated": true}')
    expect(graphRequest).toHaveBeenCalledWith("test-token", "PATCH", "/me/events/1", '{"subject":"Updated"}')
  })

  it("graph_mutate calls graphRequest with DELETE method (no body)", async () => {
    vi.resetModules()
    const { graphRequest } = await import("../../repertoire/graph-client")
    vi.mocked(graphRequest).mockResolvedValue('{}')

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: "test-token",
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("graph_mutate", { method: "DELETE", path: "/me/messages/msg-1" }, ctx)
    expect(result).toBe('{}')
    expect(graphRequest).toHaveBeenCalledWith("test-token", "DELETE", "/me/messages/msg-1", undefined)
  })

  it("graph_mutate rejects invalid method", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: "test-token",
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("graph_mutate", { method: "GET", path: "/me" }, ctx)
    expect(result).toContain("Invalid method")
    expect(result).toContain("POST, PATCH, DELETE")
  })

  it("graph_mutate returns AUTH_REQUIRED when graphToken missing", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("graph_mutate", { method: "POST", path: "/me/messages" }, ctx)
    expect(result).toContain("AUTH_REQUIRED:graph")
  })
})

describe("execTool for generic ADO tools", () => {
  it("ado_query calls adoRequest with GET by default", async () => {
    vi.resetModules()
    const { adoRequest } = await import("../../repertoire/ado-client")
    vi.mocked(adoRequest).mockResolvedValue('{"value": []}')

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: ["myorg"],
    }

    const result = await execTool("ado_query", { organization: "myorg", path: "/_apis/git/repositories" }, ctx)
    expect(result).toBe('{"value": []}')
    expect(adoRequest).toHaveBeenCalledWith("test-token", "GET", "myorg", "/_apis/git/repositories", undefined)
  })

  it("ado_query calls adoRequest with POST for WIQL", async () => {
    vi.resetModules()
    const { adoRequest } = await import("../../repertoire/ado-client")
    vi.mocked(adoRequest).mockResolvedValue('{"workItems": []}')

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const body = '{"query": "SELECT [System.Id] FROM WorkItems"}'
    const result = await execTool("ado_query", { organization: "myorg", path: "/_apis/wit/wiql", method: "POST", body }, ctx)
    expect(result).toBe('{"workItems": []}')
    expect(adoRequest).toHaveBeenCalledWith("test-token", "POST", "myorg", "/_apis/wit/wiql", body)
  })

  it("ado_query returns AUTH_REQUIRED when adoToken missing", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("ado_query", { organization: "myorg", path: "/_apis/projects" }, ctx)
    expect(result).toContain("AUTH_REQUIRED:ado")
  })

  it("ado_query returns AUTH_REQUIRED when no ToolContext", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("ado_query", { organization: "myorg", path: "/_apis/projects" })
    expect(result).toContain("AUTH_REQUIRED:ado")
  })

  it("ado_query rejects invalid organization", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: ["org1", "org2"],
    }

    const result = await execTool("ado_query", { organization: "bad-org", path: "/_apis/projects" }, ctx)
    expect(result).toContain("not in the configured organizations")
    expect(result).toContain("org1")
  })

  it("ado_query allows any org when adoOrganizations is empty", async () => {
    vi.resetModules()
    const { adoRequest } = await import("../../repertoire/ado-client")
    vi.mocked(adoRequest).mockResolvedValue('{"value": []}')

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("ado_query", { organization: "any-org", path: "/_apis/projects" }, ctx)
    expect(result).toBe('{"value": []}')
  })

  it("ado_mutate calls adoRequest with specified method and body", async () => {
    vi.resetModules()
    const { adoRequest } = await import("../../repertoire/ado-client")
    vi.mocked(adoRequest).mockResolvedValue('{"id": 456}')

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: ["myorg"],
    }

    const body = '[{"op": "replace", "path": "/fields/System.Title", "value": "Updated"}]'
    const result = await execTool("ado_mutate", { method: "PATCH", organization: "myorg", path: "/_apis/wit/workitems/456", body }, ctx)
    expect(result).toBe('{"id": 456}')
    expect(adoRequest).toHaveBeenCalledWith("test-token", "PATCH", "myorg", "/_apis/wit/workitems/456", body)
  })

  it("ado_mutate rejects invalid method", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: ["myorg"],
    }

    const result = await execTool("ado_mutate", { method: "GET", organization: "myorg", path: "/_apis/projects" }, ctx)
    expect(result).toContain("Invalid method")
    expect(result).toContain("POST, PATCH, DELETE")
  })

  it("ado_mutate returns AUTH_REQUIRED when adoToken missing", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("ado_mutate", { method: "POST", organization: "myorg", path: "/_apis/wit/workitems" }, ctx)
    expect(result).toContain("AUTH_REQUIRED:ado")
  })

  it("ado_mutate rejects invalid organization", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: ["org1"],
    }

    const result = await execTool("ado_mutate", { method: "POST", organization: "bad-org", path: "/_apis/wit/workitems" }, ctx)
    expect(result).toContain("not in the configured organizations")
  })

  it("ado_mutate allows any org when adoOrganizations is empty", async () => {
    vi.resetModules()
    const { adoRequest } = await import("../../repertoire/ado-client")
    vi.mocked(adoRequest).mockResolvedValue('{"id": 1}')

    const { execTool } = await import("../../repertoire/tools")
    const ctx = {
      graphToken: undefined,
      adoToken: "test-token",
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const result = await execTool("ado_mutate", { method: "POST", organization: "any-org", path: "/_apis/wit/workitems", body: '{}' }, ctx)
    expect(result).toBe('{"id": 1}')
  })
})

describe("confirmationRequired export", () => {
  it("exports confirmationRequired set from tools-teams", async () => {
    vi.resetModules()
    const { confirmationRequired } = await import("../../repertoire/tools-teams")
    expect(confirmationRequired).toBeInstanceOf(Set)
    expect(confirmationRequired.has("graph_mutate")).toBe(true)
    expect(confirmationRequired.has("ado_mutate")).toBe(true)
    expect(confirmationRequired.has("graph_query")).toBe(false)
    expect(confirmationRequired.has("ado_query")).toBe(false)
    expect(confirmationRequired.has("graph_profile")).toBe(false)
    expect(confirmationRequired.has("ado_work_items")).toBe(false)
  })
})

describe("execTool for docs tools", () => {
  it("graph_docs returns matching endpoints for a query", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("graph_docs", { query: "send email" })
    expect(result).toContain("send")
    // Should be valid, non-empty output
    expect(result.length).toBeGreaterThan(10)
  })

  it("graph_docs returns matching endpoints for calendar", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("graph_docs", { query: "calendar events" })
    expect(result).toContain("calendar")
  })

  it("graph_docs returns no results message for non-matching query", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("graph_docs", { query: "zzzyyyxxx_nonexistent" })
    expect(result).toContain("No matching")
  })

  it("graph_docs returns top 5 results max", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    // A broad query that should match many endpoints
    const result = await execTool("graph_docs", { query: "me" })
    const sections = result.split("\n\n").filter((s: string) => s.trim().length > 0)
    expect(sections.length).toBeLessThanOrEqual(5)
  })

  it("graph_docs is case-insensitive", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const lower = await execTool("graph_docs", { query: "messages" })
    const upper = await execTool("graph_docs", { query: "MESSAGES" })
    expect(lower).toBe(upper)
  })

  it("ado_docs returns matching endpoints for a query", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("ado_docs", { query: "work items" })
    expect(result).toContain("work")
    expect(result.length).toBeGreaterThan(10)
  })

  it("ado_docs returns matching endpoints for pull requests", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("ado_docs", { query: "pull request" })
    expect(result).toContain("pull")
  })

  it("ado_docs returns no results message for non-matching query", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("ado_docs", { query: "zzzyyyxxx_nonexistent" })
    expect(result).toContain("No matching")
  })

  it("ado_docs returns top 5 results max", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("ado_docs", { query: "api" })
    const sections = result.split("\n\n").filter((s: string) => s.trim().length > 0)
    expect(sections.length).toBeLessThanOrEqual(5)
  })

  it("ado_docs is case-insensitive", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const lower = await execTool("ado_docs", { query: "pipeline" })
    const upper = await execTool("ado_docs", { query: "PIPELINE" })
    expect(lower).toBe(upper)
  })

  it("graph_docs handles missing query arg", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("graph_docs", {})
    expect(typeof result).toBe("string")
  })

  it("ado_docs handles missing query arg", async () => {
    vi.resetModules()
    const { execTool } = await import("../../repertoire/tools")

    const result = await execTool("ado_docs", {})
    expect(typeof result).toBe("string")
  })
})

describe("getToolsForChannel includes docs tools", () => {
  it("teams channel includes graph_docs and ado_docs", async () => {
    vi.resetModules()
    const { getToolsForChannel, tools } = await import("../../repertoire/tools")
    const teamsTools = getToolsForChannel("teams")
    const names = teamsTools.map((t) => t.function.name)
    expect(names).toContain("graph_docs")
    expect(names).toContain("ado_docs")
    // base tools + 8 teams tools (4 generic + 2 aliases + 2 docs)
    expect(teamsTools.length).toBe(tools.length + 8)
  })

  it("cli channel does NOT include graph_docs or ado_docs", async () => {
    vi.resetModules()
    const { getToolsForChannel } = await import("../../repertoire/tools")
    const cliTools = getToolsForChannel("cli")
    const names = cliTools.map((t) => t.function.name)
    expect(names).not.toContain("graph_docs")
    expect(names).not.toContain("ado_docs")
  })
})

describe("summarizeArgs for docs tools", () => {
  let summarizeArgs: (name: string, args: Record<string, any>) => string

  beforeEach(async () => {
    vi.resetModules()
    const tools = await import("../../repertoire/tools")
    summarizeArgs = tools.summarizeArgs
  })

  it("returns query for graph_docs", () => {
    expect(summarizeArgs("graph_docs", { query: "send email" })).toBe("send email")
  })

  it("returns empty string for graph_docs with no query", () => {
    expect(summarizeArgs("graph_docs", {})).toBe("")
  })

  it("returns query for ado_docs", () => {
    expect(summarizeArgs("ado_docs", { query: "work items" })).toBe("work items")
  })

  it("returns empty string for ado_docs with no query", () => {
    expect(summarizeArgs("ado_docs", {})).toBe("")
  })
})
