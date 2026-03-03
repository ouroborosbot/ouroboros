import { describe, expect, it } from "vitest"

import {
  REQUIRED_EVENTS,
  eventKey,
  getDeclaredLogpoints,
  getRequiredEventKeys,
} from "../../observability/coverage/contract"

describe("observability/coverage contract", () => {
  it("builds deterministic event keys", () => {
    expect(eventKey("engine", "engine.turn_start")).toBe("engine:engine.turn_start")
  })

  it("declares logpoints equal to required event keys", () => {
    const required = getRequiredEventKeys()
    const declared = getDeclaredLogpoints()

    expect(required).toHaveLength(REQUIRED_EVENTS.length)
    expect(declared).toEqual(required)
  })
})
