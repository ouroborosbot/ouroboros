import { describe, it, expect } from "vitest"
import { hasToolIntent, detectKick } from "../../engine/kicks"
import type { Kick } from "../../engine/kicks"

describe("hasToolIntent", () => {
  it.each([
    "let me read that file",
    "I'll check that for you",
    "I will look into it",
    "I'm going to run the command",
    "going to check the logs",
    "I am going to investigate",
    "I would like to help with that",
    "I want to read the code",
  ])("returns true for intent phrase: %s", (text) => {
    expect(hasToolIntent(text)).toBe(true)
  })

  it.each([
    "LET ME check that",
    "i'll do it",
    "I WILL handle this",
  ])("is case-insensitive: %s", (text) => {
    expect(hasToolIntent(text)).toBe(true)
  })

  it.each([
    "I\u2019ll read that file",      // curly apostrophe '
    "I\u2018m going to check",       // curly apostrophe '
    "I\u2032ll do that",             // prime ′
  ])("handles curly quotes/apostrophes: %s", (text) => {
    expect(hasToolIntent(text)).toBe(true)
  })

  it.each([
    "Hello",
    "Here is the result",
    "The file contains data",
    "",
  ])("returns false for non-intent text: %s", (text) => {
    expect(hasToolIntent(text)).toBe(false)
  })
})

describe("detectKick", () => {
  it("returns empty kick for empty string", () => {
    const kick = detectKick("")
    expect(kick).toEqual({ reason: "empty", message: "I sent an empty message by accident — let me try again." })
  })

  it("returns empty kick for whitespace-only content", () => {
    const kick = detectKick("   \n\t  ")
    expect(kick).toEqual({ reason: "empty", message: expect.stringContaining("empty") })
  })

  it("returns narration kick for content with intent phrases", () => {
    const kick = detectKick("let me read that file for you")
    expect(kick).toEqual({ reason: "narration", message: "I narrated instead of acting. Calling the tool now." })
  })

  it("returns tool_required kick when toolChoiceRequired is true and content has no intent", () => {
    const kick = detectKick("here are my thoughts on the matter", { toolChoiceRequired: true })
    expect(kick).toEqual({ reason: "tool_required", message: expect.stringContaining("tool-required") })
  })

  it("returns null for normal content without toolChoiceRequired", () => {
    const kick = detectKick("here is the answer you asked for")
    expect(kick).toBeNull()
  })

  it("prioritizes empty over narration", () => {
    // empty content — even if we hypothetically matched intent, empty wins
    const kick = detectKick("")
    expect(kick!.reason).toBe("empty")
  })

  it("prioritizes narration over tool_required", () => {
    // content has intent phrase AND toolChoiceRequired is true — narration wins
    const kick = detectKick("let me check that", { toolChoiceRequired: true })
    expect(kick!.reason).toBe("narration")
  })

  it("tool_required message mentions /tool-required command", () => {
    const kick = detectKick("some response", { toolChoiceRequired: true })
    expect(kick!.message).toContain("/tool-required")
  })

  it("returns null when toolChoiceRequired is false and content is normal", () => {
    const kick = detectKick("the answer is 42", { toolChoiceRequired: false })
    expect(kick).toBeNull()
  })
})
