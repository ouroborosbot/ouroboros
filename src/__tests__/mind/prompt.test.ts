import { describe, it, expect, vi, beforeEach } from "vitest"
import * as path from "path"

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
import * as identity from "../../identity"

// Default psyche file contents used by the mock
const MOCK_SOUL = "i am a witty, funny, competent chaos monkey coding assistant.\ni get things done, crack jokes, embrace chaos, deliver quality."
const MOCK_IDENTITY = "i am Ouroboros.\ni use lowercase in my responses to the user except for proper nouns. no periods unless necessary. i never apply lowercase to code, file paths, environment variables, or tool arguments -- only to natural language output."
const MOCK_LORE = "i am named after the ouroboros -- the ancient symbol of a serpent eating its own tail."
const MOCK_FRIENDS = "my creator works at microsoft and talks to me through the CLI and Teams."

// Helper: configure readFileSync to return psyche files by path
function setupReadFileSync() {
  vi.mocked(fs.readFileSync).mockImplementation((filePath: any, _encoding?: any) => {
    const p = String(filePath)
    if (p.endsWith("SOUL.md")) return MOCK_SOUL
    if (p.endsWith("IDENTITY.md")) return MOCK_IDENTITY
    if (p.endsWith("LORE.md")) return MOCK_LORE
    if (p.endsWith("FRIENDS.md")) return MOCK_FRIENDS
    if (p.endsWith("config.json")) return JSON.stringify({})
    return ""
  })
}

describe("buildSystem", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("includes soul section with personality", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("chaos monkey coding assistant")
    expect(result).toContain("crack jokes")
  })

  it("includes identity section with Ouroboros name", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("i am Ouroboros")
    expect(result).toContain("i use lowercase")
  })

  it("includes lore section", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("## my lore")
    expect(result).toContain("ouroboros")
  })

  it("includes friends section", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("## my friends")
    expect(result).toContain("microsoft")
  })

  it("includes runtime info section for cli channel", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem("cli")
    expect(result).toContain("i introduce myself on boot")
    expect(result).toContain("testagent") // agent name from identity mock
    expect(result).toContain("i can read and modify my own source code")
  })

  it("includes runtime info section for teams channel", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem("teams")
    expect(result).toContain("Microsoft Teams")
    expect(result).toContain("i keep responses concise")
    expect(result).not.toContain("i introduce myself on boot")
  })

  it("defaults to cli channel", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("i introduce myself on boot")
  })

  it("includes date section with current date", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    const today = new Date().toISOString().slice(0, 10)
    expect(result).toContain(`current date: ${today}`)
  })

  it("includes tools section with tool names", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("## my tools")
    expect(result).toContain("- read_file:")
    expect(result).toContain("- shell:")
    expect(result).toContain("- web_search:")
  })

  it("includes skills section from listSkills", async () => {
    setupReadFileSync()
    vi.mocked(listSkills).mockReturnValue(["code-review", "self-edit", "self-query"])
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("## my skills (use load_skill to activate)")
    expect(result).toContain("code-review, self-edit, self-query")
  })

  it("omits skills section when no skills available", async () => {
    setupReadFileSync()
    vi.mocked(listSkills).mockReturnValue([])
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).not.toContain("## my skills")
  })

  it("does NOT export isOwnCodebase (removed)", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const prompt = await import("../../mind/prompt")
    expect("isOwnCodebase" in prompt).toBe(false)
  })

  it("includes azure provider string when azure config is set", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({
      providers: {
        azure: {
          apiKey: "test-azure-key",
          endpoint: "https://test.openai.azure.com",
          deployment: "gpt-4o-deploy",
          modelName: "test-model",
        },
      },
    })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("azure openai (gpt-4o-deploy, model: test-model)")
  })

  it("uses 'default' deployment when azure deployment is not set", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({
      providers: {
        azure: {
          apiKey: "test-azure-key",
          endpoint: "https://test.openai.azure.com",
          deployment: "temp-deploy",
          modelName: "test-model",
        },
      },
    })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const { getModel } = await import("../../engine/core")
    getModel()
    setTestConfig({
      providers: {
        azure: {
          deployment: "",
        },
      },
    })
    const result = buildSystem()
    expect(result).toContain("azure openai (default, model: test-model)")
  })

  it("reads soul content from SOUL.md file", async () => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: any, _encoding?: any) => {
      const p = String(filePath)
      if (p.endsWith("SOUL.md")) return "custom soul content"
      if (p.endsWith("IDENTITY.md")) return MOCK_IDENTITY
      if (p.endsWith("LORE.md")) return MOCK_LORE
      if (p.endsWith("FRIENDS.md")) return MOCK_FRIENDS
      if (p.endsWith("config.json")) return JSON.stringify({})
      return ""
    })
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("custom soul content")
  })

  it("reads identity content from IDENTITY.md file", async () => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: any, _encoding?: any) => {
      const p = String(filePath)
      if (p.endsWith("SOUL.md")) return MOCK_SOUL
      if (p.endsWith("IDENTITY.md")) return "custom identity content"
      if (p.endsWith("LORE.md")) return MOCK_LORE
      if (p.endsWith("FRIENDS.md")) return MOCK_FRIENDS
      if (p.endsWith("config.json")) return JSON.stringify({})
      return ""
    })
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem()
    expect(result).toContain("custom identity content")
  })

  it("includes tool behavior section when toolChoiceRequired is true", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem("cli", { toolChoiceRequired: true })
    expect(result).toContain("## tool behavior")
    expect(result).toContain("tool_choice is set to \"required\"")
    expect(result).toContain("final_answer")
    expect(result).toContain("ONLY tool call")
  })

  it("does NOT include tool behavior section when toolChoiceRequired is false", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem("cli", { toolChoiceRequired: false })
    expect(result).not.toContain("## tool behavior")
    expect(result).not.toContain("final_answer")
  })

  it("does NOT include tool behavior section when options is undefined", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem("cli")
    expect(result).not.toContain("## tool behavior")
  })

  it("includes flags section when disableStreaming is true and channel is teams", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem("teams", { disableStreaming: true })
    expect(result).toContain("## my flags")
    expect(result).toContain("streaming")
    expect(result).toContain("disabled")
  })

  it("does NOT include flags section when disableStreaming is true but channel is cli", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem("cli", { disableStreaming: true })
    expect(result).not.toContain("## my flags")
  })

  it("does NOT include flags section when disableStreaming is false", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem("teams", { disableStreaming: false })
    expect(result).not.toContain("## my flags")
  })

  it("does NOT include flags section when disableStreaming is undefined", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = buildSystem("teams")
    expect(result).not.toContain("## my flags")
  })
})

describe("runtimeInfoSection", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("always includes agent name and cwd", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { runtimeInfoSection, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = runtimeInfoSection("cli")
    expect(result).toContain("testagent")
    expect(result).toContain(process.cwd())
  })

  it("includes note about self-modification", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { runtimeInfoSection, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = runtimeInfoSection("cli")
    expect(result).toContain("i can read and modify my own source code")
  })

  it("cli channel includes boot greeting", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { runtimeInfoSection, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = runtimeInfoSection("cli")
    expect(result).toContain("i introduce myself on boot")
  })

  it("teams channel includes concise behavior", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { runtimeInfoSection, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = runtimeInfoSection("teams")
    expect(result).toContain("Microsoft Teams")
    expect(result).toContain("concise")
  })
})

describe("psyche loading", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("loads psyche files from agentRoot/psyche/", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    buildSystem()
    // Check that readFileSync was called with paths under the mock agent root
    const calls = vi.mocked(fs.readFileSync).mock.calls.map(c => String(c[0]))
    const psycheCalls = calls.filter(p => p.includes("psyche"))
    expect(psycheCalls.length).toBeGreaterThan(0)
    for (const p of psycheCalls) {
      expect(p).toContain(path.join("/mock/repo/testagent", "psyche"))
    }
  })

  it("handles missing psyche files gracefully (empty string, no crash)", async () => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: any, _encoding?: any) => {
      const p = String(filePath)
      if (p.endsWith("config.json")) return JSON.stringify({})
      throw new Error("ENOENT: no such file or directory")
    })
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    // Should not throw
    const result = buildSystem()
    expect(typeof result).toBe("string")
  })

  it("caches psyche text after first load", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    buildSystem()
    const callCount1 = vi.mocked(fs.readFileSync).mock.calls.length
    buildSystem()
    const callCount2 = vi.mocked(fs.readFileSync).mock.calls.length
    // Second call should not trigger more readFileSync calls for psyche files
    expect(callCount2).toBe(callCount1)
  })

  it("resetPsycheCache clears cached psyche text", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    buildSystem()
    const callCount1 = vi.mocked(fs.readFileSync).mock.calls.length
    resetPsycheCache()
    buildSystem()
    const callCount2 = vi.mocked(fs.readFileSync).mock.calls.length
    // After reset, psyche files should be re-read
    expect(callCount2).toBeGreaterThan(callCount1)
  })
})

describe("flagsSection rationale", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("mentions devtunnel relay buffering (microsoft/dev-tunnels#518)", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { flagsSection, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result).toContain("devtunnel")
    expect(result).toContain("dev-tunnels#518")
  })

  it("mentions 60-second hard timeout", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { flagsSection, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result).toContain("60")
    expect(result.toLowerCase()).toContain("timeout")
  })

  it("mentions no HTTP/2 support on devtunnels", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { flagsSection, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result).toContain("HTTP/2")
  })

  it("mentions Teams throttles streaming updates to 1 req/sec", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { flagsSection, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result).toContain("1 req/sec")
  })

  it("mentions buffering avoids compounding latency", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { flagsSection, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result.toLowerCase()).toContain("latency")
  })
})
