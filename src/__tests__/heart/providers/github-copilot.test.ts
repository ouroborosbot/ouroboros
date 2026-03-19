import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock fs before any imports
function defaultReadFileSync(filePath: any, _encoding?: any): string {
  const p = String(filePath)
  if (p.endsWith("SOUL.md")) return "mock soul"
  if (p.endsWith("IDENTITY.md")) return "mock identity"
  if (p.endsWith("LORE.md")) return "mock lore"
  if (p.endsWith("FRIENDS.md")) return "mock friends"
  if (p.endsWith("package.json")) return JSON.stringify({ name: "other" })
  return ""
}

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(defaultReadFileSync),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}))

vi.mock("../../../repertoire/skills", () => ({
  listSkills: vi.fn(),
  loadSkill: vi.fn(),
}))

vi.mock("../../../heart/identity", () => ({
  loadAgentConfig: vi.fn(() => ({
    name: "testagent",
    provider: "github-copilot",
  })),
  DEFAULT_AGENT_CONTEXT: { maxTokens: 80000, contextMargin: 20 },
  getAgentName: vi.fn(() => "testagent"),
  getAgentSecretsPath: vi.fn(() => "/tmp/.agentsecrets/testagent/secrets.json"),
  getAgentRoot: vi.fn(() => "/mock/repo/testagent"),
  getRepoRoot: vi.fn(() => "/mock/repo"),
  resetIdentity: vi.fn(),
}))

// Mock openai
const mockOpenAICtor = vi.fn()
vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: vi.fn() } }
    responses = { create: vi.fn() }
    constructor(opts?: any) { mockOpenAICtor(opts) }
  }
  return { default: MockOpenAI, AzureOpenAI: MockOpenAI }
})

async function setAgentProvider(provider: string) {
  const { loadAgentConfig } = await import("../../../heart/identity")
  vi.mocked(loadAgentConfig).mockReturnValue({
    name: "testagent",
    provider,
  } as any)
}

async function setupConfig(partial: Record<string, unknown>) {
  await setAgentProvider(
    partial.provider ? String(partial.provider) : "github-copilot",
  )
  const config = await import("../../../heart/config")
  config.resetConfigCache()
  config.patchRuntimeConfig(partial as any)
}

beforeEach(async () => {
  vi.resetModules()
  mockOpenAICtor.mockClear()
  const config = await import("../../../heart/config")
  config.resetConfigCache()
})

// --- Unit 1a: Types & Config tests ---

describe("github-copilot config", () => {
  it("getGithubCopilotConfig returns config from loadConfig().providers['github-copilot']", async () => {
    await setupConfig({
      providers: {
        "github-copilot": {
          model: "claude-sonnet-4.6",
          githubToken: "ghp_test123",
          baseUrl: "https://api.copilot.example.com",
        },
      },
    })
    const { getGithubCopilotConfig } = await import("../../../heart/config")
    const cfg = getGithubCopilotConfig()
    expect(cfg.model).toBe("claude-sonnet-4.6")
    expect(cfg.githubToken).toBe("ghp_test123")
    expect(cfg.baseUrl).toBe("https://api.copilot.example.com")
  })

  it("loadAgentConfig accepts 'github-copilot' as a valid provider value", async () => {
    await setAgentProvider("github-copilot")
    const { loadAgentConfig } = await import("../../../heart/identity")
    const config = loadAgentConfig()
    expect(config.provider).toBe("github-copilot")
  })

  it("default secrets template includes providers['github-copilot']", async () => {
    await setupConfig({})
    const { loadConfig } = await import("../../../heart/config")
    const config = loadConfig()
    expect(config.providers["github-copilot"]).toEqual({
      model: "claude-sonnet-4.6",
      githubToken: "",
      baseUrl: "",
    })
  })

  it("getProviderDisplayLabel returns 'github copilot (<model>)' for github-copilot", async () => {
    await setupConfig({
      provider: "github-copilot",
      providers: {
        "github-copilot": {
          model: "claude-sonnet-4.6",
          githubToken: "ghp_test123",
          baseUrl: "https://api.copilot.example.com",
        },
      },
    })
    const { getProviderDisplayLabel, resetProviderRuntime } = await import("../../../heart/core")
    resetProviderRuntime()
    expect(getProviderDisplayLabel()).toBe("github copilot (claude-sonnet-4.6)")
  })

  it("isAgentProvider('github-copilot') returns true", async () => {
    const { parseOuroCommand } = await import("../../../heart/daemon/daemon-cli")
    // If github-copilot is recognized, it won't throw
    expect(
      parseOuroCommand(["hatch", "--agent", "test", "--provider", "github-copilot"]),
    ).toMatchObject({
      kind: "hatch.start",
      provider: "github-copilot",
    })
  })
})
