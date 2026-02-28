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

import * as fs from "fs"

// Save and restore env vars
const savedEnv: Record<string, string | undefined> = {}
const envKeys = [
  "OUROBOROS_CONFIG_PATH",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_MODEL_NAME",
  "AZURE_OPENAI_API_VERSION",
  "MINIMAX_API_KEY",
  "MINIMAX_MODEL",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "TENANT_ID",
  "OUROBOROS_MAX_TOKENS",
  "OUROBOROS_CONTEXT_MARGIN",
  "OAUTH_GRAPH_CONNECTION",
  "OAUTH_ADO_CONNECTION",
  "ADO_ORGANIZATIONS",
]

beforeEach(() => {
  envKeys.forEach((k) => {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  })
  vi.mocked(fs.readFileSync).mockReset()
})

afterEach(() => {
  envKeys.forEach((k) => {
    if (savedEnv[k] !== undefined) {
      process.env[k] = savedEnv[k]
    } else {
      delete process.env[k]
    }
  })
})

describe("loadConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("reads and parses config from default path", async () => {
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
    const expectedPath = path.join(os.homedir(), ".agentconfigs", "ouroboros", "config.json")
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf-8")
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
  })

  it("returns defaults when file contains invalid JSON", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("not json {{{")

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

  it("uses OUROBOROS_CONFIG_PATH env var to override config path", async () => {
    process.env.OUROBOROS_CONFIG_PATH = "/tmp/test-config.json"
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ context: { maxTokens: 50000 } }))

    const { loadConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    loadConfig()

    expect(fs.readFileSync).toHaveBeenCalledWith("/tmp/test-config.json", "utf-8")
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

  it("returns context config from config.json", async () => {
    const configData = {
      context: {
        maxTokens: 100000,
        contextMargin: 25,
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getContextConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ctx = getContextConfig()

    expect(ctx.maxTokens).toBe(100000)
    expect(ctx.contextMargin).toBe(25)
  })

  it("returns defaults when not configured", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getContextConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ctx = getContextConfig()

    expect(ctx.maxTokens).toBe(80000)
    expect(ctx.contextMargin).toBe(20)
  })

})

describe("getSessionDir", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns sessions directory under agentconfigs", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getSessionDir } = await import("../config")
    const dir = getSessionDir()

    expect(dir).toBe(path.join(os.homedir(), ".agentconfigs", "ouroboros", "sessions"))
  })
})

describe("sessionPath", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns correct path for cli channel", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { sessionPath } = await import("../config")
    const p = sessionPath("cli", "session")

    expect(p).toBe(path.join(os.homedir(), ".agentconfigs", "ouroboros", "sessions", "cli", "session.json"))
  })

  it("returns correct path for teams channel with conversation id", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { sessionPath } = await import("../config")
    const p = sessionPath("teams", "conv-123")

    expect(p).toBe(path.join(os.homedir(), ".agentconfigs", "ouroboros", "sessions", "teams", "conv-123.json"))
  })

  it("sanitizes key by replacing slashes and colons with underscores", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { sessionPath } = await import("../config")
    const p = sessionPath("teams", "a]conv/id:123")

    expect(p).toBe(path.join(os.homedir(), ".agentconfigs", "ouroboros", "sessions", "teams", "a]conv_id_123.json"))
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

describe("getAdoConfig", () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it("returns empty organizations by default", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

    const { getAdoConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ado = getAdoConfig()

    expect(ado.organizations).toEqual([])
  })

  it("respects config.json values", async () => {
    const configData = {
      ado: {
        organizations: ["org1", "org2"],
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configData))

    const { getAdoConfig, resetConfigCache } = await import("../config")
    resetConfigCache()
    const ado = getAdoConfig()

    expect(ado.organizations).toEqual(["org1", "org2"])
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

    expect(tc.skipConfirmation).toBe(false)
    expect(tc.disableStreaming).toBe(false)
    expect(tc.port).toBe(3978)
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

    expect(tc.skipConfirmation).toBe(true)
    expect(tc.disableStreaming).toBe(true)
    expect(tc.port).toBe(4000)
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

    expect(tc.skipConfirmation).toBe(false)
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
