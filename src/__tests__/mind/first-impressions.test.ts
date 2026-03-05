import { describe, it, expect } from "vitest"
import { ONBOARDING_TOKEN_THRESHOLD, isOnboarding, getFirstImpressions } from "../../mind/first-impressions"

describe("first-impressions", () => {
  describe("ONBOARDING_TOKEN_THRESHOLD", () => {
    it("is exported and equals 100_000", () => {
      expect(ONBOARDING_TOKEN_THRESHOLD).toBe(100_000)
    })
  })

  describe("isOnboarding", () => {
    it("returns true for totalTokens: 0", () => {
      expect(isOnboarding({ totalTokens: 0 })).toBe(true)
    })

    it("returns true for totalTokens: 99_999", () => {
      expect(isOnboarding({ totalTokens: 99_999 })).toBe(true)
    })

    it("returns false for totalTokens: 100_000 (at threshold)", () => {
      expect(isOnboarding({ totalTokens: 100_000 })).toBe(false)
    })

    it("returns false for totalTokens: 500_000", () => {
      expect(isOnboarding({ totalTokens: 500_000 })).toBe(false)
    })

    it("returns true for totalTokens: undefined (treated as 0 via ?? 0)", () => {
      expect(isOnboarding({ totalTokens: undefined as unknown as number })).toBe(true)
    })
  })

  describe("getFirstImpressions", () => {
    it("returns non-empty string containing displayName when totalTokens: 0 and known name", () => {
      const result = getFirstImpressions({ totalTokens: 0, displayName: "Jordan" })
      expect(result.length).toBeGreaterThan(0)
      expect(result).toContain("Jordan")
    })

    it("mentions asking what they'd like to be called when displayName is 'Unknown'", () => {
      const result = getFirstImpressions({ totalTokens: 0, displayName: "Unknown" })
      expect(result.length).toBeGreaterThan(0)
      expect(result.toLowerCase()).toMatch(/don't know.*name|do not know.*name/)
      expect(result.toLowerCase()).toMatch(/ask/)
    })

    it("returns empty string for totalTokens: 100_000 (at threshold)", () => {
      const result = getFirstImpressions({ totalTokens: 100_000, displayName: "Jordan" })
      expect(result).toBe("")
    })

    it("returns empty string for totalTokens: 200_000 (above threshold)", () => {
      const result = getFirstImpressions({ totalTokens: 200_000, displayName: "Jordan" })
      expect(result).toBe("")
    })

    it("encourages learning about the friend and mentions agent capabilities", () => {
      const result = getFirstImpressions({ totalTokens: 0, displayName: "Jordan" })
      // Should encourage learning about the friend
      expect(result.toLowerCase()).toMatch(/learn|get to know/)
      // Should mention agent capabilities
      expect(result.toLowerCase()).toMatch(/tool|skill|save/)
    })
  })
})
