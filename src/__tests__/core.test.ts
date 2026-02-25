import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fs and child_process before importing core
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

vi.mock("../skills", () => ({
  listSkills: vi.fn(),
  loadSkill: vi.fn(),
}))

// We need to mock OpenAI before importing core
const mockCreate = vi.fn()
const mockResponsesCreate = vi.fn()
vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    }
    responses = {
      create: mockResponsesCreate,
    }
    constructor(_opts?: any) {}
  }
  return {
    default: MockOpenAI,
    AzureOpenAI: MockOpenAI,
  }
})

import * as fs from "fs"
import { execSync, spawnSync } from "child_process"
import { listSkills, loadSkill } from "../skills"
import type { ChannelCallbacks } from "../core"

// Set env var before importing core
process.env.MINIMAX_API_KEY = "test-key"
process.env.MINIMAX_MODEL = "test-model"

describe("isOwnCodebase", () => {
  it("returns true when package.json has name 'ouroboros'", async () => {
    const { isOwnCodebase } = await import("../core")
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "ouroboros" }))
    expect(isOwnCodebase()).toBe(true)
  })

  it("returns false when package.json has a different name", async () => {
    const { isOwnCodebase } = await import("../core")
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other-project" }))
    expect(isOwnCodebase()).toBe(false)
  })

  it("returns false when readFileSync throws", async () => {
    const { isOwnCodebase } = await import("../core")
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT")
    })
    expect(isOwnCodebase()).toBe(false)
  })
})

describe("buildSystem", () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
  })

  it("includes soul section with personality", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("chaos monkey coding assistant")
    expect(result).toContain("crack jokes")
  })

  it("includes identity section with Ouroboros name", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("i am Ouroboros")
    expect(result).toContain("i use lowercase")
  })

  it("includes boot greeting for cli channel", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../core")
    const result = buildSystem("cli")
    expect(result).toContain("i introduce myself on boot")
  })

  it("includes Teams context for teams channel", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../core")
    const result = buildSystem("teams")
    expect(result).toContain("Microsoft Teams")
    expect(result).toContain("i keep responses concise")
    expect(result).not.toContain("i introduce myself on boot")
  })

  it("defaults to cli channel", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("i introduce myself on boot")
  })

  it("includes date section with current date", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    const today = new Date().toISOString().slice(0, 10)
    expect(result).toContain(`current date: ${today}`)
  })

  it("includes tools section with tool names", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("## my tools")
    expect(result).toContain("- read_file:")
    expect(result).toContain("- shell:")
    expect(result).toContain("- web_search:")
  })

  it("includes skills section from listSkills", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    vi.mocked(listSkills).mockReturnValue(["code-review", "self-edit", "self-query"])
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("## my skills (use load_skill to activate)")
    expect(result).toContain("code-review, self-edit, self-query")
  })

  it("omits skills section when no skills available", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    vi.mocked(listSkills).mockReturnValue([])
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).not.toContain("## my skills")
  })

  it("includes self-aware section when in own codebase", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "ouroboros" }))
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("i am in my own codebase")
    expect(result).toContain("snake eating its own tail")
  })

  it("omits self-aware section when not in own codebase", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).not.toContain("i am in my own codebase")
  })

  it("includes azure provider string when AZURE_OPENAI_API_KEY is set", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    process.env.AZURE_OPENAI_API_KEY = "test-azure-key"
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o-deploy"
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("azure openai (gpt-4o-deploy, model: test-model)")
    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_DEPLOYMENT
  })

  it("uses 'default' deployment when AZURE_OPENAI_DEPLOYMENT is not set", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    process.env.AZURE_OPENAI_API_KEY = "test-azure-key"
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("azure openai (default, model: test-model)")
    delete process.env.AZURE_OPENAI_API_KEY
  })
})

describe("execTool", () => {
  let execTool: (name: string, args: Record<string, string>) => Promise<string>

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
process.env.MINIMAX_MODEL = "test-model"
    const core = await import("../core")
    execTool = core.execTool
  })

  it("dispatches read_file to fs.readFileSync", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("file contents")
    const result = await execTool("read_file", { path: "/tmp/test.txt" })
    expect(result).toBe("file contents")
    expect(fs.readFileSync).toHaveBeenCalledWith("/tmp/test.txt", "utf-8")
  })

  it("dispatches write_file to fs.writeFileSync", async () => {
    const result = await execTool("write_file", { path: "/tmp/out.txt", content: "hello" })
    expect(result).toBe("ok")
    expect(fs.writeFileSync).toHaveBeenCalledWith("/tmp/out.txt", "hello", "utf-8")
  })

  it("dispatches shell to execSync", async () => {
    vi.mocked(execSync).mockReturnValue("output")
    const result = await execTool("shell", { command: "echo hi" })
    expect(result).toBe("output")
    expect(execSync).toHaveBeenCalledWith("echo hi", { encoding: "utf-8", timeout: 30000 })
  })

  it("dispatches list_directory to fs.readdirSync", async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: "file.txt", isDirectory: () => false } as any,
      { name: "subdir", isDirectory: () => true } as any,
    ])
    const result = await execTool("list_directory", { path: "/tmp" })
    expect(result).toBe("-  file.txt\nd  subdir")
    expect(fs.readdirSync).toHaveBeenCalledWith("/tmp", { withFileTypes: true })
  })

  it("dispatches git_commit with add=true", async () => {
    vi.mocked(execSync)
      .mockReturnValueOnce("") // git add
      .mockReturnValueOnce("committed") // git commit
    const result = await execTool("git_commit", { message: "test commit", add: "true" })
    expect(result).toBe("committed")
  })

  it("dispatches git_commit with add=all", async () => {
    vi.mocked(execSync)
      .mockReturnValueOnce("") // git add
      .mockReturnValueOnce("committed") // git commit
    const result = await execTool("git_commit", { message: "test commit", add: "all" })
    expect(result).toBe("committed")
  })

  it("dispatches git_commit without add", async () => {
    vi.mocked(execSync).mockReturnValueOnce("committed")
    const result = await execTool("git_commit", { message: "test commit" })
    expect(result).toBe("committed")
  })

  it("dispatches git_commit returns failure on error", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("nothing to commit")
    })
    const result = await execTool("git_commit", { message: "test commit" })
    expect(result).toContain("failed:")
  })

  it("dispatches list_skills", async () => {
    vi.mocked(listSkills).mockReturnValue(["skill1", "skill2"])
    const result = await execTool("list_skills", {})
    expect(result).toBe(JSON.stringify(["skill1", "skill2"]))
  })

  it("dispatches load_skill", async () => {
    vi.mocked(loadSkill).mockReturnValue("skill content")
    const result = await execTool("load_skill", { name: "myskill" })
    expect(result).toBe("skill content")
  })

  it("dispatches load_skill returns error on failure", async () => {
    vi.mocked(loadSkill).mockImplementation(() => {
      throw new Error("not found")
    })
    const result = await execTool("load_skill", { name: "missing" })
    expect(result).toContain("error:")
  })

  it("dispatches get_current_time", async () => {
    const result = await execTool("get_current_time", {})
    // Should return a date string
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })

  it("returns 'unknown: X' for unknown tools", async () => {
    const result = await execTool("nonexistent_tool", {})
    expect(result).toBe("unknown: nonexistent_tool")
  })

  it("dispatches claude and returns stdout", async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "4", stderr: "", error: null } as any)
    const result = await execTool("claude", { prompt: "what is 2+2?" })
    expect(result).toBe("4")
    expect(spawnSync).toHaveBeenCalledWith(
      "claude", ["-p", "--dangerously-skip-permissions", "--add-dir", "."],
      expect.objectContaining({ input: "what is 2+2?", encoding: "utf-8", timeout: 60000 })
    )
  })

  it("dispatches claude and returns error on non-zero exit", async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: "", stderr: "nope", error: null } as any)
    const result = await execTool("claude", { prompt: "fail" })
    expect(result).toContain("claude exited with code 1")
    expect(result).toContain("nope")
  })

  it("dispatches claude and returns error on spawn failure", async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: null, stdout: "", stderr: "", error: new Error("ENOENT") } as any)
    const result = await execTool("claude", { prompt: "fail" })
    expect(result).toContain("error:")
  })

  it("dispatches claude and returns (no output) when stdout is empty", async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "", stderr: "", error: null } as any)
    const result = await execTool("claude", { prompt: "silent" })
    expect(result).toBe("(no output)")
  })

  it("dispatches claude and returns error when spawnSync throws", async () => {
    vi.mocked(spawnSync).mockImplementation(() => { throw new Error("ENOMEM") })
    const result = await execTool("claude", { prompt: "boom" })
    expect(result).toContain("error:")
    expect(result).toContain("ENOMEM")
  })

  it("dispatches web_search with perplexity results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { title: "Result 1", url: "https://example.com/1", snippet: "First result" },
          { title: "Result 2", url: "https://example.com/2", snippet: "Second result" },
        ],
      }),
    })
    vi.stubGlobal("fetch", mockFetch)
    process.env.PERPLEXITY_API_KEY = "test-pplx-key"

    const result = await execTool("web_search", { query: "test query" })
    expect(result).toContain("Result 1")
    expect(result).toContain("https://example.com/1")
    expect(result).toContain("First result")
    expect(result).toContain("Result 2")
    expect(mockFetch).toHaveBeenCalledWith("https://api.perplexity.ai/search", expect.objectContaining({
      method: "POST",
      headers: { "Authorization": "Bearer test-pplx-key", "Content-Type": "application/json" },
    }))

    vi.unstubAllGlobals()
    delete process.env.PERPLEXITY_API_KEY
  })

  it("dispatches web_search returns error when PERPLEXITY_API_KEY not set", async () => {
    delete process.env.PERPLEXITY_API_KEY
    const result = await execTool("web_search", { query: "test" })
    expect(result).toBe("error: PERPLEXITY_API_KEY not set")
  })

  it("dispatches web_search returns error on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" })
    vi.stubGlobal("fetch", mockFetch)
    process.env.PERPLEXITY_API_KEY = "bad-key"

    const result = await execTool("web_search", { query: "test" })
    expect(result).toBe("error: 401 Unauthorized")

    vi.unstubAllGlobals()
    delete process.env.PERPLEXITY_API_KEY
  })

  it("dispatches web_search returns no results found when empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    })
    vi.stubGlobal("fetch", mockFetch)
    process.env.PERPLEXITY_API_KEY = "test-key"

    const result = await execTool("web_search", { query: "obscure" })
    expect(result).toBe("no results found")

    vi.unstubAllGlobals()
    delete process.env.PERPLEXITY_API_KEY
  })

  it("dispatches web_search returns error on fetch failure", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network error"))
    vi.stubGlobal("fetch", mockFetch)
    process.env.PERPLEXITY_API_KEY = "test-key"

    const result = await execTool("web_search", { query: "test" })
    expect(result).toContain("error:")
    expect(result).toContain("network error")

    vi.unstubAllGlobals()
    delete process.env.PERPLEXITY_API_KEY
  })
})

describe("summarizeArgs", () => {
  let summarizeArgs: (name: string, args: Record<string, string>) => string

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
process.env.MINIMAX_MODEL = "test-model"
    const core = await import("../core")
    summarizeArgs = core.summarizeArgs
  })

  it("returns path for read_file", () => {
    expect(summarizeArgs("read_file", { path: "/tmp/file.txt" })).toBe("/tmp/file.txt")
  })

  it("returns path for write_file", () => {
    expect(summarizeArgs("write_file", { path: "/tmp/out.txt", content: "data" })).toBe("/tmp/out.txt")
  })

  it("returns truncated command for shell", () => {
    const short = "echo hello"
    expect(summarizeArgs("shell", { command: short })).toBe(short)
  })

  it("truncates shell commands longer than 50 chars", () => {
    const long = "a".repeat(60)
    const result = summarizeArgs("shell", { command: long })
    expect(result).toBe("a".repeat(50) + "...")
    expect(result.length).toBe(53)
  })

  it("returns path for list_directory", () => {
    expect(summarizeArgs("list_directory", { path: "/tmp" })).toBe("/tmp")
  })

  it("returns truncated message for git_commit", () => {
    const msg = "a".repeat(50)
    expect(summarizeArgs("git_commit", { message: msg })).toBe("a".repeat(40))
  })

  it("returns name for load_skill", () => {
    expect(summarizeArgs("load_skill", { name: "myskill" })).toBe("myskill")
  })

  it("returns truncated prompt for claude", () => {
    const long = "a".repeat(50)
    expect(summarizeArgs("claude", { prompt: long })).toBe("a".repeat(40))
  })

  it("returns empty string when prompt missing for claude", () => {
    expect(summarizeArgs("claude", {})).toBe("")
  })

  it("returns truncated query for web_search", () => {
    const long = "a".repeat(50)
    expect(summarizeArgs("web_search", { query: long })).toBe("a".repeat(40))
  })

  it("returns empty string when query missing for web_search", () => {
    expect(summarizeArgs("web_search", {})).toBe("")
  })

  it("returns JSON slice for unknown tool", () => {
    const result = summarizeArgs("some_other_tool", { foo: "bar" })
    expect(result).toBe(JSON.stringify({ foo: "bar" }).slice(0, 30))
  })

  it("returns empty string when path missing for read_file", () => {
    expect(summarizeArgs("read_file", {})).toBe("")
  })

  it("returns empty string when command missing for shell", () => {
    expect(summarizeArgs("shell", {})).toBe("")
  })

  it("returns empty string when message missing for git_commit", () => {
    expect(summarizeArgs("git_commit", {})).toBe("")
  })

  it("returns empty string when name missing for load_skill", () => {
    expect(summarizeArgs("load_skill", {})).toBe("")
  })

  it("returns empty string when path missing for list_directory", () => {
    expect(summarizeArgs("list_directory", {})).toBe("")
  })
})

describe("toResponsesTools", () => {
  let toResponsesTools: (ccTools: any[]) => any[]
  let tools: any[]

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    const core = await import("../core")
    toResponsesTools = core.toResponsesTools
    tools = core.tools
  })

  it("converts a single CC tool to Responses API FunctionTool format", () => {
    const ccTools = [
      {
        type: "function",
        function: {
          name: "read_file",
          description: "read file contents",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      },
    ]

    const result = toResponsesTools(ccTools)
    expect(result).toEqual([
      {
        type: "function",
        name: "read_file",
        description: "read file contents",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
        strict: false,
      },
    ])
  })

  it("converts all tools in the exported tools array", () => {
    const result = toResponsesTools(tools)
    expect(result).toHaveLength(tools.length)
    // Spot-check a couple
    const readFile = result.find((t: any) => t.name === "read_file")
    expect(readFile).toBeDefined()
    expect(readFile.type).toBe("function")
    expect(readFile.strict).toBe(false)
    expect(readFile.description).toBe("read file contents")

    const shell = result.find((t: any) => t.name === "shell")
    expect(shell).toBeDefined()
    expect(shell.name).toBe("shell")
    expect(shell.description).toBe("run shell command")
  })

  it("sets description to null when undefined", () => {
    const ccTools = [
      {
        type: "function",
        function: {
          name: "no_desc",
          parameters: { type: "object", properties: {} },
        },
      },
    ]

    const result = toResponsesTools(ccTools)
    expect(result[0].description).toBeNull()
  })

  it("sets parameters to null when undefined", () => {
    const ccTools = [
      {
        type: "function",
        function: {
          name: "no_params",
          description: "a tool without params",
        },
      },
    ]

    const result = toResponsesTools(ccTools)
    expect(result[0].parameters).toBeNull()
  })
})

describe("toResponsesInput", () => {
  let toResponsesInput: (messages: any[]) => { instructions: string; input: any[] }

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    const core = await import("../core")
    toResponsesInput = core.toResponsesInput
  })

  it("extracts system message content into instructions", () => {
    const messages = [
      { role: "system", content: "you are helpful" },
      { role: "user", content: "hi" },
    ]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("you are helpful")
    // System message should not appear in input
    expect(result.input.find((i: any) => i.role === "system")).toBeUndefined()
  })

  it("converts user message to input item", () => {
    const messages = [{ role: "user", content: "hi" }]
    const result = toResponsesInput(messages)
    expect(result.input).toEqual([{ role: "user", content: "hi" }])
  })

  it("converts assistant message (text only) to input item", () => {
    const messages = [{ role: "assistant", content: "hello" }]
    const result = toResponsesInput(messages)
    expect(result.input).toEqual([{ role: "assistant", content: "hello" }])
  })

  it("converts assistant with tool_calls to content + function_call items", () => {
    const messages = [
      {
        role: "assistant",
        content: "let me check",
        tool_calls: [
          {
            id: "tc1",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"a.txt"}' },
          },
        ],
      },
    ]
    const result = toResponsesInput(messages)
    expect(result.input).toEqual([
      { role: "assistant", content: "let me check" },
      {
        type: "function_call",
        call_id: "tc1",
        name: "read_file",
        arguments: '{"path":"a.txt"}',
      },
    ])
  })

  it("converts tool message to function_call_output item", () => {
    const messages = [
      { role: "tool", tool_call_id: "tc1", content: "file contents" },
    ]
    const result = toResponsesInput(messages)
    expect(result.input).toEqual([
      { type: "function_call_output", call_id: "tc1", output: "file contents" },
    ])
  })

  it("returns empty instructions when no system message", () => {
    const messages = [{ role: "user", content: "hi" }]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("")
  })

  it("preserves order in mixed multi-turn conversation", () => {
    const messages = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
      { role: "user", content: "read this file" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "read_file", arguments: '{"path":"x.txt"}' } },
        ],
      },
      { role: "tool", tool_call_id: "tc1", content: "data" },
      { role: "assistant", content: "here is the file" },
    ]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("system prompt")
    expect(result.input).toHaveLength(6)
    expect(result.input[0]).toEqual({ role: "user", content: "hello" })
    expect(result.input[1]).toEqual({ role: "assistant", content: "hi there" })
    expect(result.input[2]).toEqual({ role: "user", content: "read this file" })
    expect(result.input[3]).toEqual({
      type: "function_call",
      call_id: "tc1",
      name: "read_file",
      arguments: '{"path":"x.txt"}',
    })
    expect(result.input[4]).toEqual({
      type: "function_call_output",
      call_id: "tc1",
      output: "data",
    })
    expect(result.input[5]).toEqual({ role: "assistant", content: "here is the file" })
  })

  it("returns empty instructions and empty input for empty messages", () => {
    const result = toResponsesInput([])
    expect(result.instructions).toBe("")
    expect(result.input).toEqual([])
  })

  it("omits assistant content message when content is empty/falsy with tool_calls", () => {
    const messages = [
      {
        role: "assistant",
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "shell", arguments: '{"command":"ls"}' } },
        ],
      },
    ]
    const result = toResponsesInput(messages)
    // Only function_call item, no assistant content message
    expect(result.input).toEqual([
      {
        type: "function_call",
        call_id: "tc1",
        name: "shell",
        arguments: '{"command":"ls"}',
      },
    ])
  })

  it("only extracts first system message as instructions", () => {
    const messages = [
      { role: "system", content: "first system" },
      { role: "system", content: "second system" },
      { role: "user", content: "hi" },
    ]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("first system")
    // Neither system message should appear in input
    expect(result.input).toEqual([{ role: "user", content: "hi" }])
  })

  it("handles system message with empty content", () => {
    const messages = [
      { role: "system", content: "" },
      { role: "user", content: "hi" },
    ]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("")
  })
})

describe("ChannelCallbacks interface", () => {
  it("accepts an object with all required callback signatures", () => {
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (_text: string) => {},
      onReasoningChunk: (_text: string) => {},
      onToolStart: (_name: string, _args: Record<string, string>) => {},
      onToolEnd: (_name: string, _summary: string, _success: boolean) => {},
      onError: (_error: Error) => {},
    }
    // Type check passes if this compiles
    expect(callbacks).toBeDefined()
    expect(typeof callbacks.onModelStart).toBe("function")
    expect(typeof callbacks.onModelStreamStart).toBe("function")
    expect(typeof callbacks.onTextChunk).toBe("function")
    expect(typeof callbacks.onReasoningChunk).toBe("function")
    expect(typeof callbacks.onToolStart).toBe("function")
    expect(typeof callbacks.onToolEnd).toBe("function")
    expect(typeof callbacks.onError).toBe("function")
  })
})

describe("streamChatCompletion", () => {
  let streamChatCompletion: any

  function makeStream(chunks: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    }
  }

  function makeChunk(content?: string, toolCalls?: any[], reasoningContent?: string) {
    const delta: any = {}
    if (content !== undefined) delta.content = content
    if (toolCalls !== undefined) delta.tool_calls = toolCalls
    if (reasoningContent !== undefined) delta.reasoning_content = reasoningContent
    return { choices: [{ delta }] }
  }

  function makeCallbacks(overrides: Partial<ChannelCallbacks> = {}): ChannelCallbacks {
    return {
      onModelStart: vi.fn(),
      onModelStreamStart: vi.fn(),
      onTextChunk: vi.fn(),
      onReasoningChunk: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onError: vi.fn(),
      ...overrides,
    }
  }

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    mockCreate.mockReset()
    const core = await import("../core")
    streamChatCompletion = core.streamChatCompletion
  })

  it("returns TurnResult with content for text-only response", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([makeChunk("hello")])) } } }
    const callbacks = makeCallbacks()
    const result = await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(result).toEqual({ content: "hello", toolCalls: [], outputItems: [] })
  })

  it("calls onModelStreamStart once on first content delta", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([makeChunk("a"), makeChunk("b")])) } } }
    const callbacks = makeCallbacks()
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(callbacks.onModelStreamStart).toHaveBeenCalledTimes(1)
  })

  it("calls onTextChunk for each content delta", async () => {
    const textChunks: string[] = []
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([makeChunk("a"), makeChunk("b")])) } } }
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(textChunks).toEqual(["a", "b"])
  })

  it("accumulates tool call deltas and returns them in toolCalls", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([
      makeChunk(undefined, [{ index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path"' } }]),
      makeChunk(undefined, [{ index: 0, function: { arguments: ':"a.txt"}' } }]),
    ])) } } }
    const callbacks = makeCallbacks()
    const result = await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "read_file", arguments: '{"path":"a.txt"}' }])
  })

  it("calls onReasoningChunk for reasoning_content delta", async () => {
    const reasoningChunks: string[] = []
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([
      { choices: [{ delta: { reasoning_content: "thinking" } }] },
    ])) } } }
    const callbacks = makeCallbacks({ onReasoningChunk: (text: string) => reasoningChunks.push(text) })
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(reasoningChunks).toEqual(["thinking"])
  })

  it("routes think tags through processContentBuf correctly", async () => {
    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([
      makeChunk("<think>reasoning</think>answer"),
    ])) } } }
    const callbacks = makeCallbacks({
      onTextChunk: (text: string) => textChunks.push(text),
      onReasoningChunk: (text: string) => reasoningChunks.push(text),
    })
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("handles mixed content + tool_calls in same response", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([
      makeChunk("text"),
      makeChunk(undefined, [{ index: 0, id: "c1", function: { name: "shell", arguments: '{"command":"ls"}' } }]),
    ])) } } }
    const callbacks = makeCallbacks()
    const result = await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(result.content).toBe("text")
    expect(result.toolCalls).toHaveLength(1)
  })

  it("always returns empty outputItems (CC path)", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([makeChunk("hello")])) } } }
    const callbacks = makeCallbacks()
    const result = await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(result.outputItems).toEqual([])
  })

  it("respects abort signal during stream iteration", async () => {
    const controller = new AbortController()
    const client = { chat: { completions: { create: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeChunk("first")
        controller.abort()
        yield makeChunk("second")
      },
    }) } } }
    const textChunks: string[] = []
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks, controller.signal)
    expect(textChunks).toEqual(["first"])
  })

  it("propagates errors from client.chat.completions.create", async () => {
    const client = { chat: { completions: { create: vi.fn().mockImplementation(() => { throw new Error("API down") }) } } }
    const callbacks = makeCallbacks()
    await expect(streamChatCompletion(client, { messages: [], stream: true }, callbacks)).rejects.toThrow("API down")
  })
})

describe("streamResponsesApi", () => {
  let streamResponsesApi: any

  function makeResponsesStream(events: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) {
          yield event
        }
      },
    }
  }

  function makeCallbacks(overrides: Partial<ChannelCallbacks> = {}): ChannelCallbacks {
    return {
      onModelStart: vi.fn(),
      onModelStreamStart: vi.fn(),
      onTextChunk: vi.fn(),
      onReasoningChunk: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onError: vi.fn(),
      ...overrides,
    }
  }

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    mockResponsesCreate.mockReset()
    const core = await import("../core")
    streamResponsesApi = core.streamResponsesApi
  })

  it("calls client.responses.create with createParams and signal", async () => {
    const create = vi.fn().mockReturnValue(makeResponsesStream([]))
    const client = { responses: { create } }
    const callbacks = makeCallbacks()
    const params = { model: "gpt-5", stream: true }
    const controller = new AbortController()
    await streamResponsesApi(client, params, callbacks, controller.signal)
    expect(create).toHaveBeenCalledWith(params, { signal: controller.signal })
  })

  it("calls client.responses.create without signal options when no signal", async () => {
    const create = vi.fn().mockReturnValue(makeResponsesStream([]))
    const client = { responses: { create } }
    const callbacks = makeCallbacks()
    await streamResponsesApi(client, { model: "gpt-5" }, callbacks)
    expect(create).toHaveBeenCalledWith({ model: "gpt-5" }, {})
  })

  it("fires onTextChunk and accumulates content on text delta events", async () => {
    const textChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "hello" },
      { type: "response.output_text.delta", delta: " world" },
    ])) } }
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(textChunks).toEqual(["hello", " world"])
    expect(result.content).toBe("hello world")
  })

  it("fires onReasoningChunk on reasoning summary text delta events", async () => {
    const reasoningChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.reasoning_summary_text.delta", delta: "thinking" },
    ])) } }
    const callbacks = makeCallbacks({ onReasoningChunk: (text: string) => reasoningChunks.push(text) })
    await streamResponsesApi(client, {}, callbacks)
    expect(reasoningChunks).toEqual(["thinking"])
  })

  it("fires onModelStreamStart once on first text or reasoning delta", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "a" },
      { type: "response.reasoning_summary_text.delta", delta: "b" },
      { type: "response.output_text.delta", delta: "c" },
    ])) } }
    const callbacks = makeCallbacks()
    await streamResponsesApi(client, {}, callbacks)
    expect(callbacks.onModelStreamStart).toHaveBeenCalledTimes(1)
  })

  it("fires onModelStreamStart on first reasoning delta when no text", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.reasoning_summary_text.delta", delta: "think" },
    ])) } }
    const callbacks = makeCallbacks()
    await streamResponsesApi(client, {}, callbacks)
    expect(callbacks.onModelStreamStart).toHaveBeenCalledTimes(1)
  })

  it("returns TurnResult with accumulated content, empty toolCalls and outputItems for text-only", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "hello" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result).toEqual({ content: "hello", toolCalls: [], outputItems: [] })
  })

  it("silently ignores unknown event types", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.created" },
      { type: "response.completed" },
      { type: "some.unknown.event" },
      { type: "response.output_text.delta", delta: "ok" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.content).toBe("ok")
  })

  it("fires callback even for empty delta string", async () => {
    const textChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "" },
    ])) } }
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    await streamResponsesApi(client, {}, callbacks)
    expect(textChunks).toEqual([""])
  })

  it("casts non-string delta to String()", async () => {
    const reasoningChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.reasoning_summary_text.delta", delta: 42 },
    ])) } }
    const callbacks = makeCallbacks({ onReasoningChunk: (text: string) => reasoningChunks.push(text) })
    await streamResponsesApi(client, {}, callbacks)
    expect(reasoningChunks).toEqual(["42"])
  })

  it("respects abort signal during stream iteration", async () => {
    const controller = new AbortController()
    const textChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: "response.output_text.delta", delta: "first" }
        controller.abort()
        yield { type: "response.output_text.delta", delta: "second" }
      },
    }) } }
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    await streamResponsesApi(client, {}, callbacks, controller.signal)
    expect(textChunks).toEqual(["first"])
  })

  it("handles abort signal already aborted before iteration", async () => {
    const controller = new AbortController()
    controller.abort()
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "should not fire" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks, controller.signal)
    expect(callbacks.onTextChunk).not.toHaveBeenCalled()
    expect(result.content).toBe("")
  })

  it("propagates errors from client.responses.create", async () => {
    const client = { responses: { create: vi.fn().mockImplementation(() => { throw new Error("API error") }) } }
    const callbacks = makeCallbacks()
    await expect(streamResponsesApi(client, {}, callbacks)).rejects.toThrow("API error")
  })

  it("handles stream with only non-content events", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.created" },
      { type: "response.completed" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(callbacks.onModelStreamStart).not.toHaveBeenCalled()
    expect(result.content).toBe("")
  })

  // --- Tool call events ---

  it("tracks function_call from output_item.added + arguments.delta + output_item.done", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
      { type: "response.function_call_arguments.delta", delta: '{"path"' },
      { type: "response.function_call_arguments.delta", delta: ':"a.txt"}' },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: '{"path":"a.txt"}' } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.toolCalls).toEqual([{ id: "c1", name: "read_file", arguments: '{"path":"a.txt"}' }])
  })

  it("tracks multiple tool calls independently", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
      { type: "response.function_call_arguments.delta", delta: '{"path":"a.txt"}' },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: '{"path":"a.txt"}' } },
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c2", name: "shell", arguments: "" } },
      { type: "response.function_call_arguments.delta", delta: '{"command":"ls"}' },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c2", name: "shell", arguments: '{"command":"ls"}' } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0].name).toBe("read_file")
    expect(result.toolCalls[1].name).toBe("shell")
  })

  // --- Output item collection ---

  it("pushes all output_item.done items to outputItems regardless of type", async () => {
    const reasoningItem = { type: "reasoning", id: "r1", summary: [{ text: "thought", type: "summary_text" }], encrypted_content: "enc123" }
    const messageItem = { type: "message", id: "m1", content: [{ type: "output_text", text: "hello" }] }
    const fcItem = { type: "function_call", call_id: "c1", name: "read_file", arguments: '{}' }
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.done", item: reasoningItem },
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
      { type: "response.output_item.done", item: fcItem },
      { type: "response.output_item.done", item: messageItem },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.outputItems).toHaveLength(3)
    expect(result.outputItems[0]).toEqual(reasoningItem)
    expect(result.outputItems[1]).toEqual(fcItem)
    expect(result.outputItems[2]).toEqual(messageItem)
  })

  it("preserves encrypted_content in reasoning output items", async () => {
    const item = { type: "reasoning", id: "r1", summary: [], encrypted_content: "secret" }
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.done", item },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.outputItems[0].encrypted_content).toBe("secret")
  })

  it("returns empty outputItems when no done events", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "text" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.outputItems).toEqual([])
  })

  // --- TurnResult shape ---

  it("returns TurnResult with text + tool calls + output items", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "text" },
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "shell", arguments: "" } },
      { type: "response.function_call_arguments.delta", delta: '{"command":"ls"}' },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "shell", arguments: '{"command":"ls"}' } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.content).toBe("text")
    expect(result.toolCalls).toHaveLength(1)
    expect(result.outputItems).toHaveLength(1)
  })

  // --- Edge cases ---

  it("does not track output_item.added for non-function_call types", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.added", item: { type: "message", id: "m1" } },
      { type: "response.output_item.done", item: { type: "message", id: "m1", content: [] } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.toolCalls).toEqual([])
    expect(result.outputItems).toHaveLength(1)
  })

  it("ignores function_call_arguments.delta when no active tool call", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.function_call_arguments.delta", delta: "stray args" },
      { type: "response.output_text.delta", delta: "ok" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.content).toBe("ok")
    expect(result.toolCalls).toEqual([])
  })

  it("handles tool call with empty arguments string", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "get_current_time", arguments: "" } },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "get_current_time", arguments: "" } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.toolCalls).toEqual([{ id: "c1", name: "get_current_time", arguments: "" }])
  })
})

describe("runAgent", () => {
  let runAgent: (messages: any[], callbacks: ChannelCallbacks) => Promise<void>

  // Helper to create an async iterable from chunks
  function makeStream(chunks: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    }
  }

  function makeChunk(content?: string, toolCalls?: any[]) {
    const delta: any = {}
    if (content !== undefined) delta.content = content
    if (toolCalls !== undefined) delta.tool_calls = toolCalls
    return { choices: [{ delta }] }
  }

  // Helper for Responses API events (flat { type, delta, ... } objects)
  function makeResponsesStream(events: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) {
          yield event
        }
      },
    }
  }

  beforeEach(async () => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
process.env.MINIMAX_MODEL = "test-model"
    mockCreate.mockReset()
    mockResponsesCreate.mockReset()

    const core = await import("../core")
    runAgent = core.runAgent
  })

  it("fires onModelStart before API call", async () => {
    const order: string[] = []
    mockCreate.mockImplementation(() => {
      order.push("api_call")
      return makeStream([makeChunk("hello")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => order.push("onModelStart"),
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    expect(order[0]).toBe("onModelStart")
    expect(order[1]).toBe("api_call")
  })

  it("fires onModelStreamStart on first content token", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello"), makeChunk(" world")])
    )

    const calls: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => calls.push("streamStart"),
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // onModelStreamStart should fire exactly once
    expect(calls).toEqual(["streamStart"])
  })

  it("routes inline think tags to onReasoningChunk and answer to onTextChunk (single chunk)", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>reasoning</think>answer")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("routes inline think tags split across chunks", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<think>"),
        makeChunk("reasoning"),
        makeChunk("</think>"),
        makeChunk("answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("content-only (no think tags) goes only to onTextChunk", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("just text")]))

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(textChunks).toEqual(["just text"])
    expect(reasoningChunks).toEqual([])
  })

  it("think-only content goes only to onReasoningChunk", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>only thinking</think>")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("only thinking")
    expect(textChunks).toEqual([])
  })

  it("handles multiple think blocks in content", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>a</think>mid<think>b</think>end")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("ab")
    expect(textChunks.join("")).toBe("midend")
  })

  it("handles partial think tag at chunk boundary", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("some text<thi"),
        makeChunk("nk>reasoning</think>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("some textanswer")
  })

  it("handles think tags split across many chunks", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<th"),
        makeChunk("ink>"),
        makeChunk("reas"),
        makeChunk("oning</thi"),
        makeChunk("nk>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("handles partial close tag at chunk boundary inside think block", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<think>reasoning</"),
        makeChunk("think>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("flushes remaining content buffer as text at end of stream", async () => {
    // Content that ends with a partial <think> prefix -- at flush time, treated as plain text
    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello<th")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(textChunks.join("")).toBe("hello<th")
    expect(reasoningChunks).toEqual([])
  })

  it("flushes remaining reasoning buffer at end of stream (unclosed think)", async () => {
    // Think block that never closes -- at flush time, remaining buffer is reasoning
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>unterminated reasoning")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("unterminated reasoning")
    expect(textChunks).toEqual([])
  })

  it("retains partial close tag prefix in reasoning buffer across chunks", async () => {
    // Reasoning text ending with partial </think> prefix: "reasoning</"
    // Next chunk completes it: "think>answer"
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<think>reasoning</"),
        makeChunk("think>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("flushes partial close tag prefix as reasoning at end of stream", async () => {
    // Stream ends with buffer holding a partial </think> prefix inside think block
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>reasoning</")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // "reasoning" is emitted during chunked processing, "</" is flushed at end as reasoning
    expect(reasoningChunks.join("")).toBe("reasoning</")
    expect(textChunks).toEqual([])
  })

  it("handles empty reasoning before partial close tag prefix", async () => {
    // Think tag opens, then immediately a partial close tag with no reasoning in between
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<think></"),
        makeChunk("think>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual([])
    expect(textChunks.join("")).toBe("answer")
  })

  it("handles empty content chunks in think tag processing", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>r</think>text")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("r")
    expect(textChunks.join("")).toBe("text")
  })

  it("ends loop when response has no tool calls", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("just text")]))

    let modelStartCount = 0
    const callbacks: ChannelCallbacks = {
      onModelStart: () => modelStartCount++,
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // Should only call the model once
    expect(modelStartCount).toBe(1)
  })

  it("fires onToolStart before tool execution and onToolEnd after", async () => {
    // First call: model returns tool call
    // Second call: model returns text only (ending loop)
    vi.mocked(fs.readFileSync).mockReturnValue("file data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"/tmp/test.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const events: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => events.push("modelStart"),
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name, args) => events.push(`toolStart:${name}:${args.path}`),
      onToolEnd: (name, summary, success) => events.push(`toolEnd:${name}:${summary}:${success}`),
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)

    expect(events).toContain("toolStart:read_file:/tmp/test.txt")
    // onToolEnd should appear after toolStart
    const toolStartIdx = events.indexOf("toolStart:read_file:/tmp/test.txt")
    const toolEndIdx = events.findIndex((e) => e.startsWith("toolEnd:read_file"))
    expect(toolEndIdx).toBeGreaterThan(toolStartIdx)
  })

  it("loops back for another model call after tool execution", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"f.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("final answer")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(callCount).toBe(2)
  })

  it("fires onError on API errors and ends loop", async () => {
    mockCreate.mockImplementation(() => {
      throw new Error("API rate limit")
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("API rate limit")
  })

  it("pushes assistant message with content onto messages array", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("hello there")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg.content).toBe("hello there")
  })

  it("pushes assistant message with tool_calls and tool result messages", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("contents")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("ok")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    // Should have: system, assistant (with tool_calls), tool result, assistant (text)
    const toolCallMsg = messages.find(
      (m: any) => m.role === "assistant" && m.tool_calls
    )
    expect(toolCallMsg).toBeDefined()
    expect(toolCallMsg.tool_calls[0].function.name).toBe("read_file")

    const toolResultMsg = messages.find((m: any) => m.role === "tool")
    expect(toolResultMsg).toBeDefined()
    expect(toolResultMsg.tool_call_id).toBe("call_1")
    expect(toolResultMsg.content).toBe("contents")
  })

  it("does NOT push user message (adapter responsibility)", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("response")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [
      { role: "system", content: "test" },
      { role: "user", content: "hi" },
    ]
    const initialLen = messages.length
    await runAgent(messages, callbacks)

    // Only assistant message should be added, no user message
    const userMessages = messages.filter((m: any) => m.role === "user")
    expect(userMessages).toHaveLength(1) // only the one we passed in
  })

  it("handles tool call with arguments split across chunks", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path"' } },
          ]),
          makeChunk(undefined, [
            { index: 0, function: { arguments: ':"/tmp/f.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const toolNames: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name) => toolNames.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(toolNames).toEqual(["read_file"])
  })

  it("handles multiple tool calls in a single response", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data1")
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: "a.txt", isDirectory: () => false } as any,
    ])

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
            { index: 1, id: "call_2", function: { name: "list_directory", arguments: '{"path":"/tmp"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const toolStarts: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(toolStarts).toEqual(["read_file", "list_directory"])
  })

  it("fires onToolEnd with success=false when tool throws", async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("file not found")
    })

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"missing.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("ok")])
    })

    const toolEnds: { name: string; success: boolean }[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: () => {},
      onToolEnd: (name, _summary, success) => toolEnds.push({ name, success }),
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(toolEnds).toHaveLength(1)
    expect(toolEnds[0].success).toBe(false)
  })

  it("skips chunks with no delta", async () => {
    mockCreate.mockReturnValue(
      makeStream([{ choices: [{}] }, makeChunk("text")])
    )

    const chunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => chunks.push(text),
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(chunks).toEqual(["text"])
  })

  it("handles invalid JSON in tool call arguments gracefully", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("fallback")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: "not valid json{" } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const toolStarts: { name: string; args: Record<string, string> }[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name, args) => toolStarts.push({ name, args }),
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // args should be empty object when JSON parse fails
    expect(toolStarts[0].args).toEqual({})
  })

  it("wraps non-Error thrown values in Error in onError callback", async () => {
    mockCreate.mockImplementation(() => {
      throw "string error"
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(errors[0].message).toBe("string error")
  })

  it("pushes assistant message without content when only tool calls are returned", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("result")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    const firstAssistant = messages.find((m: any) => m.role === "assistant")
    // When there's no content, content should not be set on the message
    expect(firstAssistant.content).toBeUndefined()
    expect(firstAssistant.tool_calls).toBeDefined()
  })

  it("handles tool call chunks with missing id and function name", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          // First chunk: no id, no function name -- only index
          makeChunk(undefined, [
            { index: 0 },
          ]),
          // Second chunk: provides id and name
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"x.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)
    const toolMsg = messages.find((m: any) => m.role === "tool")
    expect(toolMsg).toBeDefined()
    expect(toolMsg.content).toBe("data")
  })

  it("handles tool call chunk with no function arguments", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          // Chunk with id and name but no arguments field
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "get_current_time" } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const toolStarts: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(toolStarts).toContain("get_current_time")
  })

  it("uses MINIMAX_MODEL env var when set", async () => {
    process.env.MINIMAX_MODEL = "custom-model"
    mockCreate.mockReturnValue(makeStream([makeChunk("hi")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.model).toBe("custom-model")
    delete process.env.MINIMAX_MODEL
  })

  it("calls onReasoningChunk for reasoning_content", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "thinking hard" } }] },
        { choices: [{ delta: { content: "answer" } }] },
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual(["thinking hard"])
    expect(textChunks).toEqual(["answer"])
  })

  it("calls onReasoningChunk for reasoning-only stream", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "still thinking" } }] },
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual(["still thinking"])
    expect(textChunks).toEqual([])
  })

  it("stops immediately when signal is pre-aborted", async () => {
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const controller = new AbortController()
    controller.abort()
    await runAgent([{ role: "system", content: "test" }], callbacks, controller.signal)
    // mockCreate should never be called
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("stops streaming when signal is aborted mid-stream", async () => {
    const controller = new AbortController()
    mockCreate.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeChunk("hello")
        controller.abort()
        yield makeChunk(" world") // should be skipped
      },
    })

    const chunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => chunks.push(text),
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks, controller.signal)
    expect(chunks).toEqual(["hello"])
  })

  it("breaks out of loop cleanly when signal aborted during catch", async () => {
    const controller = new AbortController()
    mockCreate.mockImplementation(() => {
      controller.abort()
      throw new Error("network error")
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    await runAgent([{ role: "system", content: "test" }], callbacks, controller.signal)
    // Abort in catch path should break cleanly, not fire onError
    expect(errors).toHaveLength(0)
  })

  it("fires onModelStreamStart on first reasoning_content token", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "hmm" } }] },
      ])
    )

    const calls: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => calls.push("streamStart"),
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(calls).toEqual(["streamStart"])
  })

  it("calls onReasoningChunk for each reasoning chunk", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "step 1" } }] },
        { choices: [{ delta: { reasoning_content: "step 2" } }] },
      ])
    )

    const reasoningChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual(["step 1", "step 2"])
  })

  it("handles multiple reasoning_content chunks before content", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "step 1 " } }] },
        { choices: [{ delta: { reasoning_content: "step 2" } }] },
        { choices: [{ delta: { content: "result" } }] },
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual(["step 1 ", "step 2"])
    expect(textChunks).toEqual(["result"])
  })

  it("passes reasoning params for Azure provider", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello")])
    )

    const core = await import("../core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await core.runAgent([{ role: "system", content: "test" }], callbacks)
    const params = mockCreate.mock.calls[0][0]
    expect(params.reasoning_effort).toBe("medium")

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("does not pass reasoning params for MiniMax provider", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello")])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    const params = mockCreate.mock.calls[0][0]
    expect(params.reasoning_effort).toBeUndefined()
  })
})

describe("getClient", () => {
  const saved: Record<string, string | undefined> = {}
  const allVars = [
    "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_DEPLOYMENT", "AZURE_OPENAI_MODEL_NAME",
    "AZURE_OPENAI_API_VERSION", "MINIMAX_API_KEY", "MINIMAX_MODEL",
  ]

  beforeEach(() => {
    for (const v of allVars) { saved[v] = process.env[v]; delete process.env[v] }
  })

  afterEach(() => {
    for (const v of allVars) {
      if (saved[v] !== undefined) process.env[v] = saved[v]
      else delete process.env[v]
    }
  })

  it("exits when no env vars are set", async () => {
    vi.resetModules()

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as any)
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const core = await import("../core")
      const callbacks: ChannelCallbacks = {
        onModelStart: () => {},
        onModelStreamStart: () => {},
        onTextChunk: () => {},
        onToolStart: () => {},
        onToolEnd: () => {},
        onError: () => {},
      }
      await core.runAgent([], callbacks).catch(() => {})
    } catch {
      // Expected -- process.exit throws
    }

    expect(mockExit).toHaveBeenCalledWith(1)
    expect(mockError).toHaveBeenCalled()

    mockExit.mockRestore()
    mockError.mockRestore()
  })

  it("uses MiniMax when MINIMAX vars are set", async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "mm-key"
    process.env.MINIMAX_MODEL = "MiniMax-M2.5"

    const core = await import("../core")
    expect(core.getModel()).toBe("MiniMax-M2.5")
    expect(core.getProvider()).toBe("minimax")
  })

  it("prefers Azure when all Azure vars are set", async () => {
    vi.resetModules()
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-4o"
    process.env.MINIMAX_API_KEY = "mm-key"
    process.env.MINIMAX_MODEL = "MiniMax-M2.5"

    const core = await import("../core")
    expect(core.getModel()).toBe("gpt-4o")
    expect(core.getProvider()).toBe("azure")
  })

  it("falls back to MiniMax when Azure vars are incomplete", async () => {
    vi.resetModules()
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    // Missing endpoint/deployment/model
    process.env.MINIMAX_API_KEY = "mm-key"
    process.env.MINIMAX_MODEL = "MiniMax-M2.5"

    const core = await import("../core")
    expect(core.getModel()).toBe("MiniMax-M2.5")
    expect(core.getProvider()).toBe("minimax")
  })
})
