import { describe, it, expect } from "vitest"

/**
 * Tests for individual audit rules 1-3 that operate on per-test event data.
 *
 * Rule 1: every-test-emits - every test must emit at least one nerves event
 * Rule 2: start/end pairing - _start events must have matching _end or _error
 * Rule 3: error context - error-level events must have non-empty meta
 */

import {
  checkEveryTestEmits,
  checkStartEndPairing,
  checkErrorContext,
} from "../../nerves/coverage/audit-rules"

type PerTestEvents = Record<string, Array<{ component: string; event: string; level?: string; meta?: Record<string, unknown> }>>

describe("Rule 1: every-test-emits", () => {
  it("passes when all tests emit at least one event", () => {
    const data: PerTestEvents = {
      "test A": [{ component: "engine", event: "turn_start" }],
      "test B": [{ component: "tools", event: "tool_start" }],
    }
    const result = checkEveryTestEmits(data)
    expect(result.status).toBe("pass")
    expect(result.silent_tests).toHaveLength(0)
  })

  it("fails when one test emits zero events", () => {
    const data: PerTestEvents = {
      "test A": [{ component: "engine", event: "turn_start" }],
      "test B": [],
    }
    const result = checkEveryTestEmits(data)
    expect(result.status).toBe("fail")
    expect(result.silent_tests).toContain("test B")
  })

  it("fails gracefully when per-test data is null", () => {
    const result = checkEveryTestEmits(null as unknown as PerTestEvents)
    expect(result.status).toBe("fail")
    expect(result.silent_tests).toHaveLength(0)
  })
})

describe("Rule 2: start/end pairing", () => {
  it("passes when _start has matching _end", () => {
    const data: PerTestEvents = {
      "test A": [
        { component: "engine", event: "turn_start" },
        { component: "engine", event: "turn_end" },
      ],
    }
    const result = checkStartEndPairing(data)
    expect(result.status).toBe("pass")
    expect(result.unmatched).toHaveLength(0)
  })

  it("passes when _start has matching _error", () => {
    const data: PerTestEvents = {
      "test A": [
        { component: "engine", event: "turn_start" },
        { component: "engine", event: "turn_error" },
      ],
    }
    const result = checkStartEndPairing(data)
    expect(result.status).toBe("pass")
  })

  it("fails when _start has no matching _end or _error", () => {
    const data: PerTestEvents = {
      "test A": [
        { component: "engine", event: "turn_start" },
      ],
    }
    const result = checkStartEndPairing(data)
    expect(result.status).toBe("fail")
    expect(result.unmatched.length).toBeGreaterThan(0)
    expect(result.unmatched[0]).toContain("turn_start")
  })

  it("orphan _end without _start is OK", () => {
    const data: PerTestEvents = {
      "test A": [
        { component: "engine", event: "turn_end" },
      ],
    }
    const result = checkStartEndPairing(data)
    expect(result.status).toBe("pass")
  })

  it("scopes pairing within a single test", () => {
    const data: PerTestEvents = {
      "test A": [
        { component: "engine", event: "turn_start" },
      ],
      "test B": [
        { component: "engine", event: "turn_end" },
      ],
    }
    const result = checkStartEndPairing(data)
    expect(result.status).toBe("fail")
  })

  it("handles null data gracefully", () => {
    const result = checkStartEndPairing(null as unknown as PerTestEvents)
    expect(result.status).toBe("fail")
  })
})

describe("Rule 3: error context", () => {
  it("passes when error-level event has non-empty meta", () => {
    const data: PerTestEvents = {
      "test A": [
        { component: "engine", event: "turn_error", level: "error", meta: { reason: "timeout" } },
      ],
    }
    const result = checkErrorContext(data)
    expect(result.status).toBe("pass")
    expect(result.violations).toHaveLength(0)
  })

  it("fails when error-level event has empty meta", () => {
    const data: PerTestEvents = {
      "test A": [
        { component: "engine", event: "turn_error", level: "error", meta: {} },
      ],
    }
    const result = checkErrorContext(data)
    expect(result.status).toBe("fail")
    expect(result.violations.length).toBeGreaterThan(0)
  })

  it("fails when error-level event has null meta", () => {
    const data: PerTestEvents = {
      "test A": [
        { component: "engine", event: "turn_error", level: "error", meta: undefined },
      ],
    }
    const result = checkErrorContext(data)
    expect(result.status).toBe("fail")
  })

  it("does not check non-error-level events", () => {
    const data: PerTestEvents = {
      "test A": [
        { component: "engine", event: "turn_start", level: "info", meta: {} },
      ],
    }
    const result = checkErrorContext(data)
    expect(result.status).toBe("pass")
  })

  it("handles null data gracefully", () => {
    const result = checkErrorContext(null as unknown as PerTestEvents)
    expect(result.status).toBe("fail")
  })
})
