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
