import { describe, expect, it } from "vitest"

import { getCodingSessionManager, resetCodingSessionManager } from "../../../repertoire/coding"

describe("coding manager singleton", () => {
  it("initializes once and reuses singleton until reset", () => {
    resetCodingSessionManager()

    const first = getCodingSessionManager()
    const second = getCodingSessionManager()
    expect(second).toBe(first)

    resetCodingSessionManager()
    const third = getCodingSessionManager()
    expect(third).not.toBe(first)
  })

  it("allows reset when no manager exists", () => {
    resetCodingSessionManager()
    resetCodingSessionManager()
    const manager = getCodingSessionManager()
    expect(manager).toBeDefined()
  })
})
