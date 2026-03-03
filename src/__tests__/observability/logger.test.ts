import { describe, expect, it, vi } from "vitest"

import { createLogger, registerGlobalLogSink } from "../../observability"

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

  it("supports warn level emissions", () => {
    const received: Array<Record<string, unknown>> = []
    const logger = createLogger({
      level: "debug",
      sinks: [(entry) => received.push(entry as Record<string, unknown>)],
    })

    logger.warn({
      event: "tool.warn",
      trace_id: "trace-3",
      component: "tools",
      message: "slow tool",
      meta: { timeoutMs: 5000 },
    })

    expect(received).toHaveLength(1)
    expect(received[0]?.level).toBe("warn")
    expect(received[0]?.event).toBe("tool.warn")
  })

  it("uses default stderr sink when no sinks are provided", () => {
    const chunks: string[] = []
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      chunks.push(chunk.toString())
      return true
    })

    const logger = createLogger({ level: "info" })
    logger.info({
      event: "turn.start",
      trace_id: "trace-default",
      component: "entrypoints",
      message: "started",
      meta: {},
    })

    expect(chunks.length).toBeGreaterThan(0)
    const payload = JSON.parse(chunks[0]!.trim()) as Record<string, unknown>
    expect(payload.level).toBe("info")
    expect(payload.event).toBe("turn.start")

    stderrSpy.mockRestore()
  })

  it("defaults log level to info when level is omitted", () => {
    const chunks: string[] = []
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      chunks.push(chunk.toString())
      return true
    })

    const logger = createLogger()
    logger.debug({
      event: "turn.debug",
      trace_id: "trace-default-level",
      component: "entrypoints",
      message: "debug",
      meta: {},
    })
    logger.info({
      event: "turn.info",
      trace_id: "trace-default-level",
      component: "entrypoints",
      message: "info",
      meta: {},
    })

    expect(chunks).toHaveLength(1)
    const payload = JSON.parse(chunks[0]!.trim()) as Record<string, unknown>
    expect(payload.event).toBe("turn.info")

    stderrSpy.mockRestore()
  })

  it("fans out emitted events to registered global sinks", () => {
    const local: Array<Record<string, unknown>> = []
    const global: Array<Record<string, unknown>> = []
    const unregister = registerGlobalLogSink((entry) => global.push(entry as Record<string, unknown>))

    const logger = createLogger({
      level: "debug",
      sinks: [(entry) => local.push(entry as Record<string, unknown>)],
      now: () => new Date("2026-03-02T17:00:00.000Z"),
    })

    logger.info({
      event: "engine.turn_end",
      trace_id: "trace-global",
      component: "engine",
      message: "turn completed",
      meta: { done: true },
    })
    unregister()

    expect(local).toHaveLength(1)
    expect(global).toHaveLength(1)
    expect(global[0]).toEqual(local[0])
  })

  it("isolates logger execution from global sink failures", () => {
    const local: Array<Record<string, unknown>> = []
    const unregister = registerGlobalLogSink(() => {
      throw new Error("global sink exploded")
    })

    const logger = createLogger({
      level: "info",
      sinks: [(entry) => local.push(entry as Record<string, unknown>)],
    })

    expect(() => {
      logger.info({
        event: "engine.turn_start",
        trace_id: "trace-safe",
        component: "engine",
        message: "still emits",
        meta: {},
      })
    }).not.toThrow()
    unregister()

    expect(local).toHaveLength(1)
    expect(local[0]?.event).toBe("engine.turn_start")
  })
})
