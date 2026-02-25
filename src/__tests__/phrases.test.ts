import { describe, it, expect } from "vitest"
import { pickPhrase, THINKING_PHRASES, TOOL_PHRASES, FOLLOWUP_PHRASES } from "../phrases"

describe("phrases - pool exports", () => {
  it("exports THINKING_PHRASES as non-empty array", () => {
    expect(Array.isArray(THINKING_PHRASES)).toBe(true)
    expect(THINKING_PHRASES.length).toBeGreaterThan(0)
  })

  it("exports TOOL_PHRASES as non-empty array", () => {
    expect(Array.isArray(TOOL_PHRASES)).toBe(true)
    expect(TOOL_PHRASES.length).toBeGreaterThan(0)
  })

  it("exports FOLLOWUP_PHRASES as non-empty array", () => {
    expect(Array.isArray(FOLLOWUP_PHRASES)).toBe(true)
    expect(FOLLOWUP_PHRASES.length).toBeGreaterThan(0)
  })

  it("phrases have no trailing ellipsis", () => {
    const all = [...THINKING_PHRASES, ...TOOL_PHRASES, ...FOLLOWUP_PHRASES]
    for (const p of all) {
      expect(p).not.toMatch(/\.{3}$/)
    }
  })
})

describe("phrases - pickPhrase", () => {
  it("returns a phrase from the pool", () => {
    const result = pickPhrase(THINKING_PHRASES)
    expect(THINKING_PHRASES).toContain(result)
  })

  it("avoids immediate repeat when lastUsed is provided", () => {
    const pool = ["a", "b", "c"]
    // Run many times — should never return lastUsed
    for (let i = 0; i < 50; i++) {
      expect(pickPhrase(pool, "a")).not.toBe("a")
    }
  })

  it("returns the only element for single-element pool", () => {
    expect(pickPhrase(["only"])).toBe("only")
  })

  it("returns the only element even when lastUsed matches (single-element)", () => {
    expect(pickPhrase(["only"], "only")).toBe("only")
  })

  it("returns empty string for empty pool", () => {
    expect(pickPhrase([])).toBe("")
  })

  it("works without lastUsed parameter", () => {
    const result = pickPhrase(TOOL_PHRASES)
    expect(TOOL_PHRASES).toContain(result)
  })
})
