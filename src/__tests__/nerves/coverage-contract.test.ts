import { describe, expect, it } from "vitest"

import {
  REQUIRED_EVENTS,
  eventKey,
  getDeclaredLogpoints,
  getRequiredEventKeys,
} from "../../nerves/coverage/contract"

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

  it("includes all nerves-console-migration events", () => {
    const keys = getRequiredEventKeys()
    const expected = [
      "channels:channel.verify_state",
      "channels:channel.message_received",
      "channels:channel.token_status",
      "channels:channel.signin_result",
      "channels:channel.signin_error",
      "channels:channel.handler_error",
      "channels:channel.unhandled_rejection",
      "channels:channel.app_error",
      "channels:channel.app_started",
      "engine:engine.provider_init_error",
      "friends:friends.persist_error",
    ]
    for (const key of expected) {
      expect(keys, `missing required event: ${key}`).toContain(key)
    }
  })
})
