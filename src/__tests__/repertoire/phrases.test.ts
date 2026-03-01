import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock identity before importing phrases
vi.mock("../../identity", () => ({
  loadAgentConfig: vi.fn(() => ({
    name: "testagent",
    configPath: "~/.agentconfigs/testagent/config.json",
  })),
}))

import * as identity from "../../identity"

describe("phrases - pool exports", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "testagent",
      configPath: "~/.agentconfigs/testagent/config.json",
    })
  })

  it("exports THINKING_PHRASES as non-empty array", async () => {
    const { THINKING_PHRASES } = await import("../../repertoire/phrases")
    expect(Array.isArray(THINKING_PHRASES)).toBe(true)
    expect(THINKING_PHRASES.length).toBeGreaterThan(0)
  })

  it("exports TOOL_PHRASES as non-empty array", async () => {
    const { TOOL_PHRASES } = await import("../../repertoire/phrases")
    expect(Array.isArray(TOOL_PHRASES)).toBe(true)
    expect(TOOL_PHRASES.length).toBeGreaterThan(0)
  })

  it("exports FOLLOWUP_PHRASES as non-empty array", async () => {
    const { FOLLOWUP_PHRASES } = await import("../../repertoire/phrases")
    expect(Array.isArray(FOLLOWUP_PHRASES)).toBe(true)
    expect(FOLLOWUP_PHRASES.length).toBeGreaterThan(0)
  })

  it("phrases have no trailing ellipsis", async () => {
    const { THINKING_PHRASES, TOOL_PHRASES, FOLLOWUP_PHRASES } = await import("../../repertoire/phrases")
    const all = [...THINKING_PHRASES, ...TOOL_PHRASES, ...FOLLOWUP_PHRASES]
    for (const p of all) {
      expect(p).not.toMatch(/\.{3}$/)
    }
  })
})

describe("phrases - pickPhrase", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns a phrase from the pool", async () => {
    const { pickPhrase, THINKING_PHRASES } = await import("../../repertoire/phrases")
    const result = pickPhrase(THINKING_PHRASES)
    expect(THINKING_PHRASES).toContain(result)
  })

  it("avoids immediate repeat when lastUsed is provided", async () => {
    const { pickPhrase } = await import("../../repertoire/phrases")
    const pool = ["a", "b", "c"]
    // Run many times -- should never return lastUsed
    for (let i = 0; i < 50; i++) {
      expect(pickPhrase(pool, "a")).not.toBe("a")
    }
  })

  it("returns the only element for single-element pool", async () => {
    const { pickPhrase } = await import("../../repertoire/phrases")
    expect(pickPhrase(["only"])).toBe("only")
  })

  it("returns the only element even when lastUsed matches (single-element)", async () => {
    const { pickPhrase } = await import("../../repertoire/phrases")
    expect(pickPhrase(["only"], "only")).toBe("only")
  })

  it("returns empty string for empty pool", async () => {
    const { pickPhrase } = await import("../../repertoire/phrases")
    expect(pickPhrase([])).toBe("")
  })

  it("works without lastUsed parameter", async () => {
    const { pickPhrase, TOOL_PHRASES } = await import("../../repertoire/phrases")
    const result = pickPhrase(TOOL_PHRASES)
    expect(TOOL_PHRASES).toContain(result)
  })
})

describe("phrases - getPhrases from agent.json", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns custom phrases from agent.json when present", async () => {
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "testagent",
      configPath: "~/.agentconfigs/testagent/config.json",
      phrases: {
        thinking: ["custom thinking"],
        tool: ["custom tool"],
        followup: ["custom followup"],
      },
    })

    const { getPhrases } = await import("../../repertoire/phrases")
    const phrases = getPhrases()

    expect(phrases.thinking).toEqual(["custom thinking"])
    expect(phrases.tool).toEqual(["custom tool"])
    expect(phrases.followup).toEqual(["custom followup"])
  })

  it("returns default phrases when agent.json has no phrases", async () => {
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "testagent",
      configPath: "~/.agentconfigs/testagent/config.json",
    })

    const { getPhrases } = await import("../../repertoire/phrases")
    const phrases = getPhrases()

    expect(phrases.thinking.length).toBeGreaterThan(0)
    expect(phrases.tool.length).toBeGreaterThan(0)
    expect(phrases.followup.length).toBeGreaterThan(0)
  })

  it("returns defaults for individual missing phrase categories", async () => {
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "testagent",
      configPath: "~/.agentconfigs/testagent/config.json",
      phrases: {
        thinking: ["custom thinking only"],
      },
    })

    const { getPhrases } = await import("../../repertoire/phrases")
    const phrases = getPhrases()

    expect(phrases.thinking).toEqual(["custom thinking only"])
    // tool and followup should fall back to defaults
    expect(phrases.tool.length).toBeGreaterThan(0)
    expect(phrases.followup.length).toBeGreaterThan(0)
  })
})
