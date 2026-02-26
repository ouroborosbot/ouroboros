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

vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: vi.fn() } }
    responses = { create: vi.fn() }
    constructor(_opts?: any) {}
  }
  return {
    default: MockOpenAI,
    AzureOpenAI: MockOpenAI,
  }
})

import * as fs from "fs"
import { listSkills } from "../../repertoire/skills"

// Set env var before importing prompt (which imports core for getModel)
process.env.MINIMAX_API_KEY = "test-key"
process.env.MINIMAX_MODEL = "test-model"

describe("isOwnCodebase", () => {
  it("returns true when package.json has name 'ouroboros'", async () => {
    const { isOwnCodebase } = await import("../../mind/prompt")
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "ouroboros" }))
    expect(isOwnCodebase()).toBe(true)
  })

  it("returns false when package.json has a different name", async () => {
    const { isOwnCodebase } = await import("../../mind/prompt")
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other-project" }))
    expect(isOwnCodebase()).toBe(false)
  })

  it("returns false when readFileSync throws", async () => {
    const { isOwnCodebase } = await import("../../mind/prompt")
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
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("chaos monkey coding assistant")
    expect(result).toContain("crack jokes")
  })

  it("includes identity section with Ouroboros name", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("i am Ouroboros")
    expect(result).toContain("i use lowercase")
  })

  it("includes boot greeting for cli channel", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem("cli")
    expect(result).toContain("i introduce myself on boot")
  })

  it("includes Teams context for teams channel", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem("teams")
    expect(result).toContain("Microsoft Teams")
    expect(result).toContain("i keep responses concise")
    expect(result).not.toContain("i introduce myself on boot")
  })

  it("defaults to cli channel", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("i introduce myself on boot")
  })

  it("includes date section with current date", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    const today = new Date().toISOString().slice(0, 10)
    expect(result).toContain(`current date: ${today}`)
  })

  it("includes tools section with tool names", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("## my tools")
    expect(result).toContain("- read_file:")
    expect(result).toContain("- shell:")
    expect(result).toContain("- web_search:")
  })

  it("includes skills section from listSkills", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    vi.mocked(listSkills).mockReturnValue(["code-review", "self-edit", "self-query"])
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("## my skills (use load_skill to activate)")
    expect(result).toContain("code-review, self-edit, self-query")
  })

  it("omits skills section when no skills available", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    vi.mocked(listSkills).mockReturnValue([])
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).not.toContain("## my skills")
  })

  it("includes self-aware section when in own codebase", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "ouroboros" }))
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("i am in my own codebase")
    expect(result).toContain("snake eating its own tail")
  })

  it("omits self-aware section when not in own codebase", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).not.toContain("i am in my own codebase")
  })

  it("includes azure provider string when AZURE_OPENAI_API_KEY is set", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    process.env.AZURE_OPENAI_API_KEY = "test-azure-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o-deploy"
    process.env.AZURE_OPENAI_MODEL_NAME = "test-model"
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("azure openai (gpt-4o-deploy, model: test-model)")
    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("uses 'default' deployment when AZURE_OPENAI_DEPLOYMENT is not set", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: "other" }))
    process.env.AZURE_OPENAI_API_KEY = "test-azure-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_MODEL_NAME = "test-model"
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("azure openai (default, model: test-model)")
    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })
})
