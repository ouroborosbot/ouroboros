import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as path from "path"
import * as os from "os"

// Mock fs before importing config
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

// Mock identity module -- config.ts will import from ./identity
vi.mock("../identity", () => ({
  loadAgentConfig: vi.fn(() => ({
    name: "testagent",
    configPath: "~/.agentsecrets/testagent/secrets.json",
  provider: "minimax",
  })),
  getAgentName: vi.fn(() => "testagent"),
}))

import * as fs from "fs"
import * as identity from "../identity"

beforeEach(() => {
  vi.mocked(fs.readFileSync).mockReset()
  vi.mocked(fs.mkdirSync).mockReset()
  vi.mocked(fs.writeFileSync).mockReset()
  vi.mocked(identity.loadAgentConfig).mockReturnValue({
    name: "testagent",
    configPath: "~/.agentsecrets/testagent/secrets.json",
  provider: "minimax",
  })
  vi.mocked(identity.getAgentName).mockReturnValue("testagent")
})

afterEach(() => {
})

describe("loadConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("reads config from path specified in agent.json configPath", async () => {
    const configData = {
      providers: {
        azure: {
          apiKey: "az-key",
          endpoint: "https://example.openai.azure.com",
          deployment: "gpt-4",
          modelName: "gpt-4",
        },
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const config = loadConfig()

    expect(config.providers.azure.apiKey).toBe("az-key")
    expect(config.providers.azure.endpoint).toBe("https://example.openai.azure.com")
    // Should resolve ~ to homedir and use configPath from agent.json
    const expectedPath = path.join(os.homedir(), ".agentsecrets", "testagent", "secrets.json")
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf-8")
  })

  it("auto-creates config directory when loading", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    loadConfig()

    const expectedDir = path.join(os.homedir(), ".agentsecrets", "testagent")
    expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true })
  })

  it("throws when agent.json configPath does not use .agentsecrets/<agent>/secrets.json", async () => {
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "testagent",
      configPath: "~/.agentconfigs/testagent/config.json",
    provider: "minimax",
    })

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    expect(() => loadConfig()).toThrow(/\.agentsecrets.*secrets\.json/)
  })

  it("returns defaults when file is missing (ENOENT)", async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err: any = new Error("ENOENT")
      err.code = "ENOENT"
      throw err
    })

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const config = loadConfig()

    expect(config.providers.azure.apiKey).toBe("")
    expect(config.providers.minimax.apiKey).toBe("")
    expect(config.context.maxTokens).toBe(80000)
    expect(config.context.contextMargin).toBe(20)

    const expectedPath = path.join(os.homedir(), ".agentsecrets", "testagent", "secrets.json")
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1)
    expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, expect.any(String), "utf-8")
    const written = vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]
    const parsed = JSON.parse(String(written)) as Record<string, unknown>
    expect(parsed).toHaveProperty("providers")
    expect(parsed).toMatchObject({
      providers: {
        anthropic: {
          model: "claude-opus-4-6",
          setupToken: "",
        },
      },
    })
    expect(parsed).not.toHaveProperty("teams")
    expect(parsed).not.toHaveProperty("oauth")
    expect(parsed).not.toHaveProperty("context")
    expect(parsed).not.toHaveProperty("teamsChannel")
    expect(parsed).not.toHaveProperty("integrations")
  })

  it("returns defaults when file contains invalid JSON", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("not json {{{")

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const config = loadConfig()

    expect(config.providers.azure.apiKey).toBe("")
    expect(config.context.maxTokens).toBe(80000)
  })

  it("returns defaults when config read throws a non-Error value", async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw "read-failure"
    })

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const config = loadConfig()

    expect(config.providers.azure.apiKey).toBe("")
    expect(config.context.maxTokens).toBe(80000)
  })

  it("merges partial config with defaults", async () => {
    const partial = {
      providers: {
        azure: {
          apiKey: "my-key",
        },
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(partial))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const config = loadConfig()

    expect(config.providers.azure.apiKey).toBe("my-key")
    expect(config.providers.azure.endpoint).toBe("")
    expect(config.providers.minimax.apiKey).toBe("")
    expect(config.context.maxTokens).toBe(80000)
    expect(config.context.contextMargin).toBe(20)
  })

  it("does not use OUROBOROS_CONFIG_PATH env var", async () => {
    process.env.OUROBOROS_CONFIG_PATH = "/tmp/should-not-be-used.json"
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ context: { maxTokens: 50000 } }))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    loadConfig()

    // Should NOT use the env var -- should use agent.json configPath
    const expectedPath = path.join(os.homedir(), ".agentsecrets", "testagent", "secrets.json")
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf-8")
    expect(fs.readFileSync).not.toHaveBeenCalledWith("/tmp/should-not-be-used.json", "utf-8")

    delete process.env.OUROBOROS_CONFIG_PATH
  })

  it("resolves configPath with ~ to homedir", async () => {
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "myagent",
      configPath: "~/custom/path/config.json",
    provider: "minimax",
    })
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    loadConfig()

    const expectedPath = path.join(os.homedir(), "custom", "path", "config.json")
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf-8")
  })

  it("uses absolute configPath as-is", async () => {
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "myagent",
      configPath: "/absolute/path/config.json",
    provider: "minimax",
    })
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    loadConfig()

    expect(fs.readFileSync).toHaveBeenCalledWith("/absolute/path/config.json", "utf-8")
  })

  it("caches config after first load", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ context: { maxTokens: 50000 } }))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const config1 = loadConfig()
    const config2 = loadConfig()

    expect(config1).toBe(config2) // same reference
    expect(fs.readFileSync).toHaveBeenCalledTimes(1)
  })

  it("re-reads from disk after resetConfigCache()", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ context: { maxTokens: 50000 } }))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const config1 = loadConfig()

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ context: { maxTokens: 60000 } }))
    resetConfigCache()
    const config2 = loadConfig()

    expect(config1).not.toBe(config2)
    expect(config2.context.maxTokens).toBe(60000)
    expect(fs.readFileSync).toHaveBeenCalledTimes(2)
  })

  it("emits config.load observability event when loading config", async () => {
    vi.resetModules()
    const emitNervesEvent = vi.fn()
    vi.doMock("../nerves/runtime", () => ({
      emitNervesEvent,
    }))
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    loadConfig()

    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "config.load",
      component: "config/identity",
    }))
  })
})

describe("getAzureConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns azure config from config.json", async () => {
    const configData = {
      providers: {
        azure: {
          apiKey: "az-key",
          endpoint: "https://example.openai.azure.com",
          deployment: "gpt-4",
          modelName: "gpt-4-model",
          apiVersion: "2025-01-01",
        },
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getAzureConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const azure = getAzureConfig()

    expect(azure.apiKey).toBe("az-key")
    expect(azure.endpoint).toBe("https://example.openai.azure.com")
    expect(azure.deployment).toBe("gpt-4")
    expect(azure.modelName).toBe("gpt-4-model")
    expect(azure.apiVersion).toBe("2025-01-01")
  })

  it("uses default apiVersion when not specified", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getAzureConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const azure = getAzureConfig()

    expect(azure.apiVersion).toBe("2025-04-01-preview")
  })

})

describe("getMinimaxConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns minimax config from config.json", async () => {
    const configData = {
      providers: {
        minimax: {
          apiKey: "mm-key",
          model: "mm-model",
        },
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getMinimaxConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const mm = getMinimaxConfig()

    expect(mm.apiKey).toBe("mm-key")
    expect(mm.model).toBe("mm-model")
  })

})

describe("getTeamsConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns teams config from config.json", async () => {
    const configData = {
      teams: {
        clientId: "cid",
        clientSecret: "csecret",
        tenantId: "tid",
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getTeamsConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const teams = getTeamsConfig()

    expect(teams.clientId).toBe("cid")
    expect(teams.clientSecret).toBe("csecret")
    expect(teams.tenantId).toBe("tid")
  })

})

describe("getContextConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns context config from agent.json", async () => {
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "testagent",
      configPath: "~/.agentsecrets/testagent/secrets.json",
      provider: "minimax",
      context: {
        maxTokens: 100000,
        contextMargin: 25,
        maxToolOutputChars: 12345,
      },
    } as any)

    const configData = {
      context: {
        maxTokens: 1,
        contextMargin: 2,
        maxToolOutputChars: 3,
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getContextConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ctx = getContextConfig()

    expect(ctx.maxTokens).toBe(100000)
    expect(ctx.contextMargin).toBe(25)
    expect(ctx.maxToolOutputChars).toBe(12345)
  })

  it("returns defaults when not configured", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getContextConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ctx = getContextConfig()

    expect(ctx.maxTokens).toBe(80000)
    expect(ctx.contextMargin).toBe(20)
  })

  it("falls back per-field defaults when agent.json context has invalid types", async () => {
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "testagent",
      configPath: "~/.agentsecrets/testagent/secrets.json",
      provider: "minimax",
      context: {
        maxTokens: "bad",
        contextMargin: 12,
        maxToolOutputChars: null,
      },
    } as any)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getContextConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ctx = getContextConfig()

    expect(ctx.maxTokens).toBe(80000)
    expect(ctx.contextMargin).toBe(12)
    expect(ctx.maxToolOutputChars).toBe(20000)
  })

  it("falls back contextMargin to default when agent.json contextMargin is not numeric", async () => {
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "testagent",
      configPath: "~/.agentsecrets/testagent/secrets.json",
      provider: "minimax",
      context: {
        maxTokens: 91000,
        contextMargin: "bad",
        maxToolOutputChars: 15000,
      },
    } as any)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getContextConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ctx = getContextConfig()

    expect(ctx.maxTokens).toBe(91000)
    expect(ctx.contextMargin).toBe(20)
    expect(ctx.maxToolOutputChars).toBe(15000)
  })

})

describe("sessionPath", () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.mocked(fs.mkdirSync).mockReset()
  })

  it("returns correct path with friendId, channel, and key (3-arg signature)", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { sessionPath } = await import("../config")
    const p = sessionPath("uuid-abc-123", "cli", "session")

    expect(p).toBe(path.join(os.homedir(), ".agentstate", "testagent", "sessions", "uuid-abc-123", "cli", "session.json"))
  })

  it("returns correct path for teams channel with friendId", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { sessionPath } = await import("../config")
    const p = sessionPath("uuid-xyz-456", "teams", "conv-123")

    expect(p).toBe(path.join(os.homedir(), ".agentstate", "testagent", "sessions", "uuid-xyz-456", "teams", "conv-123.json"))
  })

  it("sanitizes key by replacing slashes and colons with underscores", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { sessionPath } = await import("../config")
    const p = sessionPath("uuid-1", "teams", "a]conv/id:123")

    expect(p).toBe(path.join(os.homedir(), ".agentstate", "testagent", "sessions", "uuid-1", "teams", "a]conv_id_123.json"))
  })

  it("auto-creates parent directories", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { sessionPath } = await import("../config")
    sessionPath("uuid-1", "cli", "session")

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      path.join(os.homedir(), ".agentstate", "testagent", "sessions", "uuid-1", "cli"),
      { recursive: true },
    )
  })
})

describe("logPath", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns logs directory using agent name from identity module", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getLogsDir } = await import("../config")
    const dir = getLogsDir()

    expect(dir).toBe(path.join(os.homedir(), ".agentstate", "testagent", "logs"))
  })

  it("returns NDJSON log path and sanitizes key", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { logPath } = await import("../config")
    const p = logPath("teams", "a]conv/id:123")

    expect(p).toBe(path.join(os.homedir(), ".agentstate", "testagent", "logs", "teams", "a]conv_id_123.ndjson"))
  })
})

describe("getOAuthConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns default connection names", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getOAuthConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const oauth = getOAuthConfig()

    expect(oauth.graphConnectionName).toBe("graph")
    expect(oauth.adoConnectionName).toBe("ado")
  })

  it("respects config.json values", async () => {
    const configData = {
      oauth: {
        graphConnectionName: "custom-graph",
        adoConnectionName: "custom-ado",
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getOAuthConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const oauth = getOAuthConfig()

    expect(oauth.graphConnectionName).toBe("custom-graph")
    expect(oauth.adoConnectionName).toBe("custom-ado")
  })

})

describe("getAdoConfig removed", () => {
  it("getAdoConfig no longer exists (removed in Unit 1Hb)", async () => {
    vi.resetModules()
    const config = await import("../config")
    expect((config as any).getAdoConfig).toBeUndefined()
  })
})

describe("getTeamsChannelConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns default teamsChannel config when not specified", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getTeamsChannelConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const tc = getTeamsChannelConfig()

    expect(tc).toEqual({
      skipConfirmation: true,
      disableStreaming: false,
      port: 3978,
    })
  })

  it("returns teamsChannel config from config.json", async () => {
    const configData = {
      teamsChannel: {
        skipConfirmation: true,
        disableStreaming: true,
        port: 4000,
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getTeamsChannelConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const tc = getTeamsChannelConfig()

    expect(tc).toEqual({
      skipConfirmation: true,
      disableStreaming: true,
      port: 4000,
    })
  })

  it("returns a shallow copy (not the same reference)", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getTeamsChannelConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const tc1 = getTeamsChannelConfig()
    const tc2 = getTeamsChannelConfig()

    expect(tc1).toEqual(tc2)
    expect(tc1).not.toBe(tc2)
  })

  it("merges partial teamsChannel config with defaults", async () => {
    const configData = {
      teamsChannel: {
        port: 5000,
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getTeamsChannelConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const tc = getTeamsChannelConfig()

    expect(tc.skipConfirmation).toBe(true)
    expect(tc.disableStreaming).toBe(false)
    expect(tc.port).toBe(5000)
  })
})

describe("getIntegrationsConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns default integrations config when not specified", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getIntegrationsConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ic = getIntegrationsConfig()

    expect(ic.perplexityApiKey).toBe("")
  })

  it("returns integrations config from config.json", async () => {
    const configData = {
      integrations: {
        perplexityApiKey: "pplx-key-123",
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getIntegrationsConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ic = getIntegrationsConfig()

    expect(ic.perplexityApiKey).toBe("pplx-key-123")
  })

  it("returns a shallow copy (not the same reference)", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getIntegrationsConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ic1 = getIntegrationsConfig()
    const ic2 = getIntegrationsConfig()

    expect(ic1).toEqual(ic2)
    expect(ic1).not.toBe(ic2)
  })
})

describe("setTestConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("deep-merges partial config into cached config", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { setTestConfig, resetConfigCache, getAzureConfig } = await import("../config")
    resetConfigCache()
    setTestConfig({ providers: { azure: { apiKey: "test-key" } } })
    const azure = getAzureConfig()

    expect(azure.apiKey).toBe("test-key")
    // Other fields should remain as defaults
    expect(azure.endpoint).toBe("")
    expect(azure.apiVersion).toBe("2025-04-01-preview")
  })

  it("overrides specific fields while leaving others untouched", async () => {
    const configData = {
      providers: {
        azure: {
          apiKey: "original-key",
          endpoint: "https://original.openai.azure.com",
          deployment: "gpt-4",
          modelName: "gpt-4",
          apiVersion: "2025-01-01",
        },
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { setTestConfig, resetConfigCache, getAzureConfig } = await import("../config")
    resetConfigCache()
    setTestConfig({ providers: { azure: { apiKey: "overridden-key" } } })
    const azure = getAzureConfig()

    expect(azure.apiKey).toBe("overridden-key")
    expect(azure.endpoint).toBe("https://original.openai.azure.com")
    expect(azure.deployment).toBe("gpt-4")
  })

  it("works with resetConfigCache to restore defaults", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { setTestConfig, resetConfigCache, getContextConfig } = await import("../config")
    resetConfigCache()
    setTestConfig({ context: { maxTokens: 99999 } })

    expect(getContextConfig().maxTokens).toBe(99999)

    resetConfigCache()
    expect(getContextConfig().maxTokens).toBe(80000)
  })

  it("handles empty partial (no-op)", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { setTestConfig, resetConfigCache, getContextConfig } = await import("../config")
    resetConfigCache()
    setTestConfig({})
    const ctx = getContextConfig()

    expect(ctx.maxTokens).toBe(80000)
    expect(ctx.contextMargin).toBe(20)
  })

  it("can set nested config sections (teamsChannel, integrations)", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { setTestConfig, resetConfigCache, getTeamsChannelConfig, getIntegrationsConfig } = await import("../config")
    resetConfigCache()
    setTestConfig({
      teamsChannel: { skipConfirmation: true, port: 5000 },
      integrations: { perplexityApiKey: "pplx-test" },
    })

    const tc = getTeamsChannelConfig()
    expect(tc.skipConfirmation).toBe(true)
    expect(tc.port).toBe(5000)
    expect(tc.disableStreaming).toBe(false) // default preserved

    const ic = getIntegrationsConfig()
    expect(ic.perplexityApiKey).toBe("pplx-test")
  })

  it("can overwrite then reset then overwrite again", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { setTestConfig, resetConfigCache, getMinimaxConfig } = await import("../config")
    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "first" } } })
    expect(getMinimaxConfig().apiKey).toBe("first")

    resetConfigCache()
    setTestConfig({ providers: { minimax: { apiKey: "second" } } })
    expect(getMinimaxConfig().apiKey).toBe("second")
  })
})
