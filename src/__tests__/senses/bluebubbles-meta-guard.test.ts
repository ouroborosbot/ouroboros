import { describe, expect, it } from "vitest"
import { containsInternalMetaMarkers } from "../../senses/bluebubbles-meta-guard"

describe("containsInternalMetaMarkers", () => {
  it("blocks the surfaced-from-inner-dialog prefix", () => {
    expect(containsInternalMetaMarkers("[surfaced from inner dialog] my reflection")).toBe(true)
    expect(containsInternalMetaMarkers("hey — [surfaced from inner dialog] more text")).toBe(true)
  })

  it("blocks the pending-from prefix", () => {
    expect(containsInternalMetaMarkers("[pending from ben]: hi")).toBe(true)
  })

  it("blocks pipeline section markers", () => {
    expect(containsInternalMetaMarkers("[conversation scope: existing chat trunk]")).toBe(true)
    expect(containsInternalMetaMarkers("[recent active lanes]")).toBe(true)
    expect(containsInternalMetaMarkers("[routing control: use bluebubbles_set_reply_target]")).toBe(true)
  })

  it("blocks reasoning <think> tags", () => {
    expect(containsInternalMetaMarkers("<think>internal reasoning</think>")).toBe(true)
    expect(containsInternalMetaMarkers("partial leak <think> tag")).toBe(true)
  })

  it("does NOT block ordinary user-facing prose that mentions the same concepts in plain text", () => {
    expect(containsInternalMetaMarkers("I had a thought from my inner dialog about your question")).toBe(false)
    expect(containsInternalMetaMarkers("the attention queue is a metacognitive concept")).toBe(false)
    expect(containsInternalMetaMarkers("we have a return obligation tracker now")).toBe(false)
    expect(containsInternalMetaMarkers("hey, just thinking of you")).toBe(false)
  })

  it("does NOT block the user-visible failover provider-switch banner", () => {
    expect(
      containsInternalMetaMarkers("[provider switch: anthropic timed out. switched to openai (gpt-5-codex)]"),
    ).toBe(false)
  })

  it("returns false for empty/undefined inputs", () => {
    expect(containsInternalMetaMarkers("")).toBe(false)
    expect(containsInternalMetaMarkers(undefined)).toBe(false)
    expect(containsInternalMetaMarkers(null)).toBe(false)
  })
})
