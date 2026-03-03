import { describe, expect, it } from "vitest"

import { createLogger } from "../../observability"

describe("observability/logger", () => {
  it("emits required envelope fields", () => {
    const received: Array<Record<string, unknown>> = []
    const logger = createLogger({
      level: "debug",
      sinks: [(entry) => received.push(entry as Record<string, unknown>)],
      now: () => new Date("2026-03-02T17:00:00.000Z"),
    })

    logger.info({
      event: "engine.turn_start",
      trace_id: "trace-1",
      component: "engine",
      message: "turn started",
      meta: { turn: 1 },
    })

    expect(received).toHaveLength(1)
    const entry = received[0]
    expect(entry).toEqual({
      ts: "2026-03-02T17:00:00.000Z",
      level: "info",
      event: "engine.turn_start",
      trace_id: "trace-1",
      component: "engine",
      message: "turn started",
      meta: { turn: 1 },
    })
  })

  it("filters events below configured level", () => {
    const received: Array<Record<string, unknown>> = []
    const logger = createLogger({
      level: "info",
      sinks: [(entry) => received.push(entry as Record<string, unknown>)],
    })

    logger.debug({
      event: "engine.debug",
      trace_id: "trace-1",
      component: "engine",
      message: "debug",
      meta: {},
    })

    logger.error({
      event: "engine.error",
      trace_id: "trace-1",
      component: "engine",
      message: "boom",
      meta: { code: "E_TEST" },
    })

    expect(received).toHaveLength(1)
    expect(received[0]?.event).toBe("engine.error")
  })

  it("fans out to all configured sinks", () => {
    const left: Array<Record<string, unknown>> = []
    const right: Array<Record<string, unknown>> = []

    const logger = createLogger({
      level: "info",
      sinks: [
        (entry) => left.push(entry as Record<string, unknown>),
        (entry) => right.push(entry as Record<string, unknown>),
      ],
    })

    logger.info({
      event: "tool.start",
      trace_id: "trace-2",
      component: "tools",
      message: "starting tool",
      meta: { name: "search" },
    })

    expect(left).toHaveLength(1)
    expect(right).toHaveLength(1)
    expect(left[0]).toEqual(right[0])
  })
})
