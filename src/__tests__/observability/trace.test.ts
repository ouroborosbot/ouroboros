import { describe, expect, it } from "vitest"

import { createTraceId, ensureTraceId } from "../../observability"

describe("observability/trace", () => {
  it("creates non-empty unique trace IDs", () => {
    const a = createTraceId()
    const b = createTraceId()

    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(a).not.toBe(b)
  })

  it("reuses a provided trace ID and generates one when missing", () => {
    expect(ensureTraceId("trace-123")).toBe("trace-123")
    expect(ensureTraceId()).toBeTruthy()
  })
})
