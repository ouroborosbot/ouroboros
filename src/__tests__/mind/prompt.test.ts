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

// Default psyche file contents used by the mock
const MOCK_SOUL = "i am a witty, funny, competent chaos monkey coding assistant.\ni get things done, crack jokes, embrace chaos, deliver quality."
const MOCK_IDENTITY = "i am Ouroboros.\ni use lowercase in my responses to the user except for proper nouns. no periods unless necessary. i never apply lowercase to code, file paths, environment variables, or tool arguments — only to natural language output."
const MOCK_LORE = "i am named after the ouroboros — the ancient symbol of a serpent eating its own tail."
const MOCK_FRIENDS = "my creator works at microsoft and talks to me through the CLI and Teams."

// Helper: configure readFileSync to return psyche files by path and package.json
function setupReadFileSync(pkgName: string = "other") {
  vi.mocked(fs.readFileSync).mockImplementation((filePath: any, _encoding?: any) => {
    const p = String(filePath)
    if (p.endsWith("SOUL.md")) return MOCK_SOUL
    if (p.endsWith("IDENTITY.md")) return MOCK_IDENTITY
    if (p.endsWith("LORE.md")) return MOCK_LORE
    if (p.endsWith("FRIENDS.md")) return MOCK_FRIENDS
    if (p.endsWith("package.json")) return JSON.stringify({ name: pkgName })
    if (p.endsWith("config.json")) return JSON.stringify({})
    return ""
  })
}

describe("isOwnCodebase", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns true when package.json has name 'ouroboros'", async () => {
    setupReadFileSync("ouroboros")
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { isOwnCodebase } = await import("../../mind/prompt")
    expect(isOwnCodebase()).toBe(true)
  })

  it("returns false when package.json has a different name", async () => {
    setupReadFileSync("other-project")
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { isOwnCodebase } = await import("../../mind/prompt")
    expect(isOwnCodebase()).toBe(false)
  })

  it("returns false when readFileSync throws for package.json", async () => {
    // Set up psyche files normally but make package.json throw
    vi.mocked(fs.readFileSync).mockImplementation((filePath: any, _encoding?: any) => {
      const p = String(filePath)
      if (p.endsWith("SOUL.md")) return MOCK_SOUL
      if (p.endsWith("IDENTITY.md")) return MOCK_IDENTITY
      if (p.endsWith("LORE.md")) return MOCK_LORE
      if (p.endsWith("FRIENDS.md")) return MOCK_FRIENDS
      if (p.endsWith("config.json")) return JSON.stringify({})
      throw new Error("ENOENT")
    })
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { isOwnCodebase } = await import("../../mind/prompt")
    expect(isOwnCodebase()).toBe(false)
  })
})

describe("buildSystem", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("includes soul section with personality", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("chaos monkey coding assistant")
    expect(result).toContain("crack jokes")
  })

  it("includes identity section with Ouroboros name", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("i am Ouroboros")
    expect(result).toContain("i use lowercase")
  })

  it("includes lore section", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("## my lore")
    expect(result).toContain("ouroboros")
  })

  it("includes friends section", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("## my friends")
    expect(result).toContain("microsoft")
  })

  it("includes boot greeting for cli channel", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem("cli")
    expect(result).toContain("i introduce myself on boot")
  })

  it("includes Teams context for teams channel", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
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
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("i introduce myself on boot")
  })

  it("includes date section with current date", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    const today = new Date().toISOString().slice(0, 10)
    expect(result).toContain(`current date: ${today}`)
  })

  it("includes tools section with tool names", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
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
    const { buildSystem } = await import("../../mind/prompt")
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
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).not.toContain("## my skills")
  })

  it("includes self-aware section when in own codebase", async () => {
    setupReadFileSync("ouroboros")
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("i am in my own codebase")
    expect(result).toContain("snake eating its own tail")
  })

  it("omits self-aware section when not in own codebase", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).not.toContain("i am in my own codebase")
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
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("azure openai (gpt-4o-deploy, model: test-model)")
  })

  it("uses 'default' deployment when azure deployment is not set", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    // First set valid azure config so getClient() selects azure provider
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
    // Import prompt (triggers lazy getClient init on first getModel() call)
    const { buildSystem, getProvider } = await import("../../mind/prompt")
    // Force client initialization so provider is cached as "azure"
    const { getModel } = await import("../../engine/core")
    getModel()
    // Now clear deployment to test the "default" fallback in providerSection display
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
      if (p.endsWith("package.json")) return JSON.stringify({ name: "other" })
      if (p.endsWith("config.json")) return JSON.stringify({})
      return ""
    })
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
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
      if (p.endsWith("package.json")) return JSON.stringify({ name: "other" })
      if (p.endsWith("config.json")) return JSON.stringify({})
      return ""
    })
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem()
    expect(result).toContain("custom identity content")
  })

  it("includes tool behavior section when toolChoiceRequired is true", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
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
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem("cli", { toolChoiceRequired: false })
    expect(result).not.toContain("## tool behavior")
    expect(result).not.toContain("final_answer")
  })

  it("does NOT include tool behavior section when options is undefined", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem("cli")
    expect(result).not.toContain("## tool behavior")
  })

  it("includes flags section when disableStreaming is true and channel is teams", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
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
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem("cli", { disableStreaming: true })
    expect(result).not.toContain("## my flags")
  })

  it("does NOT include flags section when disableStreaming is false", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem("teams", { disableStreaming: false })
    expect(result).not.toContain("## my flags")
  })

  it("does NOT include flags section when disableStreaming is undefined", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { buildSystem } = await import("../../mind/prompt")
    const result = buildSystem("teams")
    expect(result).not.toContain("## my flags")
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
    const { flagsSection } = await import("../../mind/prompt")
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result).toContain("devtunnel")
    expect(result).toContain("dev-tunnels#518")
  })

  it("mentions 60-second hard timeout", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { flagsSection } = await import("../../mind/prompt")
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result).toContain("60")
    expect(result.toLowerCase()).toContain("timeout")
  })

  it("mentions no HTTP/2 support on devtunnels", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { flagsSection } = await import("../../mind/prompt")
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result).toContain("HTTP/2")
  })

  it("mentions Teams throttles streaming updates to 1 req/sec", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { flagsSection } = await import("../../mind/prompt")
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result).toContain("1 req/sec")
  })

  it("mentions buffering avoids compounding latency", async () => {
    setupReadFileSync()
    const { setTestConfig, resetConfigCache } = await import("../../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
    const { flagsSection } = await import("../../mind/prompt")
    const result = flagsSection("teams", { disableStreaming: true })
    expect(result.toLowerCase()).toContain("latency")
  })
})
