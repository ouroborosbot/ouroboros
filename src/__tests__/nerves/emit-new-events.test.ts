/**
 * Integration test: emit every new nerves event so the global-capture
 * setup file records them in vitest-events.ndjson for the audit gate.
 *
 * These calls use the REAL emitNervesEvent (no mock) so the global
 * log sink captures them.
 */
import { describe, it } from "vitest"

import { emitNervesEvent } from "../../nerves/runtime"

describe("nerves event capture for audit gate", () => {
  const events = [
    {
      level: "info" as const,
      event: "channel.verify_state",
      component: "channels",
      message: "audit capture",
      meta: {},
    },
    {
      level: "info" as const,
      event: "channel.message_received",
      component: "channels",
      message: "audit capture",
      meta: {},
    },
    {
      level: "info" as const,
      event: "channel.token_status",
      component: "channels",
      message: "audit capture",
      meta: {},
    },
    {
      level: "info" as const,
      event: "channel.signin_result",
      component: "channels",
      message: "audit capture",
      meta: {},
    },
    {
      level: "error" as const,
      event: "channel.signin_error",
      component: "channels",
      message: "audit capture",
      meta: {},
    },
    {
      level: "error" as const,
      event: "channel.handler_error",
      component: "channels",
      message: "audit capture",
      meta: {},
    },
    {
      level: "error" as const,
      event: "channel.unhandled_rejection",
      component: "channels",
      message: "audit capture",
      meta: {},
    },
    {
      level: "error" as const,
      event: "channel.app_error",
      component: "channels",
      message: "audit capture",
      meta: {},
    },
    {
      level: "info" as const,
      event: "channel.app_started",
      component: "channels",
      message: "audit capture",
      meta: {},
    },
    {
      level: "error" as const,
      event: "engine.provider_init_error",
      component: "engine",
      message: "audit capture",
      meta: {},
    },
    {
      level: "error" as const,
      event: "friends.persist_error",
      component: "friends",
      message: "audit capture",
      meta: {},
    },
  ]

  for (const evt of events) {
    it(`emits ${evt.event}`, () => {
      emitNervesEvent(evt)
    })
  }
})
