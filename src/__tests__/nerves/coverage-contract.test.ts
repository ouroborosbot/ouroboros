import { describe, expect, it } from "vitest"

import * as contractModule from "../../nerves/coverage/contract"

describe("observability/coverage contract (post-cleanup)", () => {
  it("builds deterministic event keys", () => {
    expect(contractModule.eventKey("engine", "engine.turn_start")).toBe(
      "engine:engine.turn_start",
    )
  })

  it("still exports REQUIRED_ENVELOPE_FIELDS", () => {
    expect(contractModule.REQUIRED_ENVELOPE_FIELDS).toContain("ts")
    expect(contractModule.REQUIRED_ENVELOPE_FIELDS).toContain("level")
    expect(contractModule.REQUIRED_ENVELOPE_FIELDS).toContain("event")
    expect(contractModule.REQUIRED_ENVELOPE_FIELDS).toContain("trace_id")
    expect(contractModule.REQUIRED_ENVELOPE_FIELDS).toContain("component")
    expect(contractModule.REQUIRED_ENVELOPE_FIELDS).toContain("message")
    expect(contractModule.REQUIRED_ENVELOPE_FIELDS).toContain("meta")
  })

  it("still exports SENSITIVE_PATTERNS", () => {
    expect(contractModule.SENSITIVE_PATTERNS).toBeInstanceOf(Array)
    expect(contractModule.SENSITIVE_PATTERNS.length).toBeGreaterThan(0)
    expect(contractModule.SENSITIVE_PATTERNS[0]).toBeInstanceOf(RegExp)
  })

  it("no longer exports REQUIRED_EVENTS", () => {
    const mod = contractModule as Record<string, unknown>
    expect(mod["REQUIRED_EVENTS"]).toBeUndefined()
  })

  it("no longer exports getRequiredEventKeys", () => {
    const mod = contractModule as Record<string, unknown>
    expect(mod["getRequiredEventKeys"]).toBeUndefined()
  })

  it("no longer exports getDeclaredLogpoints", () => {
    const mod = contractModule as Record<string, unknown>
    expect(mod["getDeclaredLogpoints"]).toBeUndefined()
  })
})
