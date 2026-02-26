import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock fs and child_process before importing tools
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
  let execTool: (name: string, args: Record<string, string>) => Promise<string>

  beforeEach(async () => {
    vi.resetModules()
    const tools = await import("../../engine/tools")
    execTool = tools.execTool
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
    const tools = await import("../../engine/tools")
    summarizeArgs = tools.summarizeArgs
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
