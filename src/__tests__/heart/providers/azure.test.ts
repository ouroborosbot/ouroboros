import { describe, it, expect, vi, beforeEach } from "vitest"
import { emitNervesEvent } from "../../../nerves/runtime"

function emitTestEvent(testName: string): void {
  emitNervesEvent({
    component: "engine",
    event: "engine.test_run",
    message: testName,
    meta: { test: true },
  })
}

// Mock @azure/identity before any imports that use it
const mockGetToken = vi.fn()
const mockDefaultAzureCredentialCtor = vi.fn()

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class MockDefaultAzureCredential {
    getToken: typeof mockGetToken
    constructor(opts?: any) {
      mockDefaultAzureCredentialCtor(opts)
      this.getToken = mockGetToken
    }
  },
}))

// Mock openai
const mockAzureOpenAICtor = vi.fn()
vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: vi.fn() } }
    responses = { create: vi.fn() }
    constructor(opts?: any) { mockAzureOpenAICtor(opts) }
  }
  return { default: MockOpenAI, AzureOpenAI: MockOpenAI }
})

// Mock fs
function defaultReadFileSync(filePath: any, _encoding?: any): string {
  const p = String(filePath)
  if (p.endsWith("SOUL.md")) return "mock soul"
  if (p.endsWith("IDENTITY.md")) return "mock identity"
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

vi.mock("../../../heart/identity", () => ({
  loadAgentConfig: vi.fn(() => ({
    name: "testagent",
    configPath: "~/.agentsecrets/testagent/secrets.json",
    provider: "azure",
  })),
  DEFAULT_AGENT_CONTEXT: {
    maxTokens: 80000,
    contextMargin: 20,
  },
  getAgentName: vi.fn(() => "testagent"),
  getAgentSecretsPath: vi.fn(() => "/tmp/.agentsecrets/testagent/secrets.json"),
  getAgentRoot: vi.fn(() => "/mock/repo/testagent"),
  getRepoRoot: vi.fn(() => "/mock/repo"),
  resetIdentity: vi.fn(),
}))

vi.mock("../../../repertoire/skills", () => ({
  listSkills: vi.fn(),
  loadSkill: vi.fn(),
}))

describe("createAzureTokenProvider", () => {
  beforeEach(() => {
    mockGetToken.mockReset()
    mockDefaultAzureCredentialCtor.mockReset()
  })

  it("creates DefaultAzureCredential with managedIdentityClientId when provided", async () => {
    emitTestEvent("creates DefaultAzureCredential with managedIdentityClientId when provided")
    mockGetToken.mockResolvedValue({ token: "test-token-123" })

    const { createAzureTokenProvider } = await import("../../../heart/providers/azure")
    const tokenProvider = createAzureTokenProvider("c404d5a9-1234-5678-abcd-ef0123456789")

    expect(mockDefaultAzureCredentialCtor).toHaveBeenCalledWith({
      managedIdentityClientId: "c404d5a9-1234-5678-abcd-ef0123456789",
    })

    const token = await tokenProvider()
    expect(token).toBe("test-token-123")
    expect(mockGetToken).toHaveBeenCalledWith("https://cognitiveservices.azure.com/.default")
  })

  it("creates DefaultAzureCredential without options when no client ID provided", async () => {
    emitTestEvent("creates DefaultAzureCredential without options when no client ID provided")
    mockGetToken.mockResolvedValue({ token: "local-dev-token" })

    const { createAzureTokenProvider } = await import("../../../heart/providers/azure")
    const tokenProvider = createAzureTokenProvider()

    expect(mockDefaultAzureCredentialCtor).toHaveBeenCalledWith(undefined)

    const token = await tokenProvider()
    expect(token).toBe("local-dev-token")
  })

  it("creates DefaultAzureCredential without options when client ID is empty string", async () => {
    emitTestEvent("creates DefaultAzureCredential without options when client ID is empty string")
    mockGetToken.mockResolvedValue({ token: "local-dev-token-2" })

    const { createAzureTokenProvider } = await import("../../../heart/providers/azure")
    const tokenProvider = createAzureTokenProvider("")

    expect(mockDefaultAzureCredentialCtor).toHaveBeenCalledWith(undefined)

    const token = await tokenProvider()
    expect(token).toBe("local-dev-token-2")
  })

  it("throws with clear error message when getToken fails", async () => {
    emitTestEvent("throws with clear error message when getToken fails")
    mockGetToken.mockRejectedValue(new Error("CredentialUnavailableError"))

    const { createAzureTokenProvider } = await import("../../../heart/providers/azure")
    const tokenProvider = createAzureTokenProvider()

    await expect(tokenProvider()).rejects.toThrow(
      "Azure OpenAI authentication failed. Either set providers.azure.apiKey in secrets.json, or run 'az login' to authenticate with your Azure account.",
    )
  })
})

describe("createAzureProviderRuntime", () => {
  beforeEach(() => {
    vi.resetModules()
    mockAzureOpenAICtor.mockReset()
    mockGetToken.mockReset()
    mockDefaultAzureCredentialCtor.mockReset()
  })

  it("uses apiKey when present and non-empty (existing behavior)", async () => {
    emitTestEvent("uses apiKey when present and non-empty")

    const config = await import("../../../heart/config")
    config.resetConfigCache()
    config.patchRuntimeConfig({
      providers: {
        azure: {
          apiKey: "test-api-key",
          endpoint: "https://test.openai.azure.com",
          deployment: "gpt-4",
          modelName: "gpt-4",
        },
      },
    })

    const { createAzureProviderRuntime } = await import("../../../heart/providers/azure")
    const runtime = createAzureProviderRuntime()

    expect(runtime.id).toBe("azure")
    expect(mockAzureOpenAICtor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-api-key",
      }),
    )
    // Should NOT have azureADTokenProvider
    const ctorArgs = mockAzureOpenAICtor.mock.calls[0][0]
    expect(ctorArgs.azureADTokenProvider).toBeUndefined()
  })

  it("uses azureADTokenProvider when apiKey is empty and managedIdentityClientId is set", async () => {
    emitTestEvent("uses azureADTokenProvider with managedIdentityClientId")

    const config = await import("../../../heart/config")
    config.resetConfigCache()
    config.patchRuntimeConfig({
      providers: {
        azure: {
          apiKey: "",
          endpoint: "https://test.openai.azure.com",
          deployment: "gpt-4",
          modelName: "gpt-4",
          managedIdentityClientId: "c404d5a9-test",
        },
      },
    })

    const { createAzureProviderRuntime } = await import("../../../heart/providers/azure")
    const runtime = createAzureProviderRuntime()

    expect(runtime.id).toBe("azure")
    const ctorArgs = mockAzureOpenAICtor.mock.calls[0][0]
    expect(ctorArgs.apiKey).toBeUndefined()
    expect(typeof ctorArgs.azureADTokenProvider).toBe("function")
    expect(mockDefaultAzureCredentialCtor).toHaveBeenCalledWith({
      managedIdentityClientId: "c404d5a9-test",
    })
  })

  it("uses azureADTokenProvider with default credential chain when apiKey empty and no managedIdentityClientId", async () => {
    emitTestEvent("uses azureADTokenProvider with default credential chain")

    const config = await import("../../../heart/config")
    config.resetConfigCache()
    config.patchRuntimeConfig({
      providers: {
        azure: {
          apiKey: "",
          endpoint: "https://test.openai.azure.com",
          deployment: "gpt-4",
          modelName: "gpt-4",
        },
      },
    })

    const { createAzureProviderRuntime } = await import("../../../heart/providers/azure")
    const runtime = createAzureProviderRuntime()

    expect(runtime.id).toBe("azure")
    const ctorArgs = mockAzureOpenAICtor.mock.calls[0][0]
    expect(ctorArgs.apiKey).toBeUndefined()
    expect(typeof ctorArgs.azureADTokenProvider).toBe("function")
    // Should use default credential (no managedIdentityClientId)
    expect(mockDefaultAzureCredentialCtor).toHaveBeenCalledWith(undefined)
  })

  it("still requires endpoint, deployment, and modelName in all paths", async () => {
    emitTestEvent("requires endpoint deployment modelName")

    const config = await import("../../../heart/config")
    config.resetConfigCache()
    config.patchRuntimeConfig({
      providers: {
        azure: {
          apiKey: "test-key",
          endpoint: "",
          deployment: "",
          modelName: "",
        },
      },
    })

    const { createAzureProviderRuntime } = await import("../../../heart/providers/azure")
    expect(() => createAzureProviderRuntime()).toThrow(/incomplete/)
  })

  it("still requires endpoint, deployment, and modelName when using managed identity", async () => {
    emitTestEvent("requires endpoint deployment modelName with managed identity")

    const config = await import("../../../heart/config")
    config.resetConfigCache()
    config.patchRuntimeConfig({
      providers: {
        azure: {
          apiKey: "",
          endpoint: "",
          deployment: "",
          modelName: "",
          managedIdentityClientId: "c404d5a9-test",
        },
      },
    })

    const { createAzureProviderRuntime } = await import("../../../heart/providers/azure")
    expect(() => createAzureProviderRuntime()).toThrow(/incomplete/)
  })

  it("includes authMethod in provider_init nerves event", async () => {
    emitTestEvent("includes authMethod in provider_init nerves event")
    const emitSpy = vi.fn()
    vi.doMock("../../../nerves/runtime", () => ({
      emitNervesEvent: emitSpy,
    }))

    const config = await import("../../../heart/config")
    config.resetConfigCache()
    config.patchRuntimeConfig({
      providers: {
        azure: {
          apiKey: "test-key",
          endpoint: "https://test.openai.azure.com",
          deployment: "gpt-4",
          modelName: "gpt-4",
        },
      },
    })

    const { createAzureProviderRuntime } = await import("../../../heart/providers/azure")
    createAzureProviderRuntime()

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "engine.provider_init",
        meta: expect.objectContaining({ authMethod: "api-key" }),
      }),
    )
  })

  it("reports managed-identity authMethod in nerves event when using token provider", async () => {
    emitTestEvent("reports managed-identity authMethod in nerves event")
    const emitSpy = vi.fn()
    vi.doMock("../../../nerves/runtime", () => ({
      emitNervesEvent: emitSpy,
    }))

    const config = await import("../../../heart/config")
    config.resetConfigCache()
    config.patchRuntimeConfig({
      providers: {
        azure: {
          apiKey: "",
          endpoint: "https://test.openai.azure.com",
          deployment: "gpt-4",
          modelName: "gpt-4",
        },
      },
    })

    const { createAzureProviderRuntime } = await import("../../../heart/providers/azure")
    createAzureProviderRuntime()

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "engine.provider_init",
        meta: expect.objectContaining({ authMethod: "managed-identity" }),
      }),
    )
  })
})
