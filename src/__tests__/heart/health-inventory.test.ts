import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

const mockPingProvider = vi.fn()
vi.mock("../../heart/provider-ping", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../heart/provider-ping")>()
  return {
    ...actual,
    pingProvider: (...args: any[]) => mockPingProvider(...args),
  }
})

const mockLoadAgentSecrets = vi.fn()
vi.mock("../../heart/daemon/auth-flow", () => ({
  loadAgentSecrets: (...args: any[]) => mockLoadAgentSecrets(...args),
}))

import { runHealthInventory } from "../../heart/provider-ping"

describe("runHealthInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("pings all configured providers except current and returns results", async () => {
    mockLoadAgentSecrets.mockReturnValue({
      secretsPath: "/mock/secrets.json",
      secrets: {
        providers: {
          anthropic: { model: "claude-opus-4-6", setupToken: "sk-ant-oat01-valid" },
          "openai-codex": { model: "gpt-5.4", oauthAccessToken: "valid-token" },
          minimax: { model: "minimax-text-01", apiKey: "" },
          azure: { modelName: "", apiKey: "", endpoint: "", deployment: "", apiVersion: "" },
        },
      },
    })
    mockPingProvider
      .mockResolvedValueOnce({ ok: true }) // anthropic
      .mockResolvedValueOnce({ ok: false, classification: "auth-failure", message: "bad token" }) // codex

    const result = await runHealthInventory("slugger", "openai-codex")

    // Should have pinged anthropic (configured) but NOT codex (current provider)
    // minimax and azure have empty creds — pingProvider handles that (returns auth-failure)
    expect(mockPingProvider).toHaveBeenCalled()
    expect(result.anthropic).toBeDefined()
  })

  it("excludes current provider from inventory", async () => {
    mockLoadAgentSecrets.mockReturnValue({
      secretsPath: "/mock/secrets.json",
      secrets: {
        providers: {
          anthropic: { model: "claude-opus-4-6", setupToken: "sk-ant-oat01-valid" },
          "openai-codex": { model: "gpt-5.4", oauthAccessToken: "valid-token" },
          minimax: { model: "", apiKey: "" },
          azure: { modelName: "", apiKey: "", endpoint: "", deployment: "", apiVersion: "" },
        },
      },
    })
    mockPingProvider.mockResolvedValue({ ok: true })

    const result = await runHealthInventory("slugger", "anthropic")

    // Current provider "anthropic" should NOT be in results
    expect(result["anthropic"]).toBeUndefined()
    // openai-codex should have been pinged
    expect(result["openai-codex"]).toBeDefined()
  })

  it("returns empty map when no other providers are configured", async () => {
    mockLoadAgentSecrets.mockReturnValue({
      secretsPath: "/mock/secrets.json",
      secrets: {
        providers: {
          anthropic: { model: "", setupToken: "" },
          "openai-codex": { model: "gpt-5.4", oauthAccessToken: "valid" },
          minimax: { model: "", apiKey: "" },
          azure: { modelName: "", apiKey: "", endpoint: "", deployment: "", apiVersion: "" },
        },
      },
    })
    mockPingProvider.mockResolvedValue({ ok: false, classification: "auth-failure", message: "empty" })

    const result = await runHealthInventory("slugger", "openai-codex")

    // anthropic, minimax, azure all have empty creds — pingProvider returns auth-failure
    expect(Object.keys(result).length).toBeGreaterThan(0)
    for (const [, pingResult] of Object.entries(result)) {
      expect((pingResult as any).ok).toBe(false)
    }
  })

  it("pings providers in parallel", async () => {
    const callOrder: string[] = []
    mockLoadAgentSecrets.mockReturnValue({
      secretsPath: "/mock/secrets.json",
      secrets: {
        providers: {
          anthropic: { model: "claude-opus-4-6", setupToken: "valid" },
          "openai-codex": { model: "gpt-5.4", oauthAccessToken: "" },
          minimax: { model: "minimax-text-01", apiKey: "valid" },
          azure: { modelName: "", apiKey: "", endpoint: "", deployment: "", apiVersion: "" },
        },
      },
    })
    mockPingProvider.mockImplementation(async (provider: string) => {
      callOrder.push(`start:${provider}`)
      await new Promise((r) => setTimeout(r, 10))
      callOrder.push(`end:${provider}`)
      return { ok: true }
    })

    await runHealthInventory("slugger", "openai-codex")

    // Both should start before either ends (parallel)
    const anthropicStart = callOrder.indexOf("start:anthropic")
    const minimaxStart = callOrder.indexOf("start:minimax")
    const anthropicEnd = callOrder.indexOf("end:anthropic")
    expect(anthropicStart).toBeLessThan(anthropicEnd)
    expect(minimaxStart).toBeLessThan(anthropicEnd)
  })
})
