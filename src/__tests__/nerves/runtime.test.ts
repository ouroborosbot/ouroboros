import { afterEach, describe, expect, it, vi } from "vitest"

import { emitObservabilityEvent, setRuntimeLogger } from "../../nerves/runtime"

describe("observability/runtime", () => {
  afterEach(() => {
    setRuntimeLogger(null)
    vi.restoreAllMocks()
  })

  it("routes events to the level-specific runtime logger methods", () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    setRuntimeLogger(logger)

    emitObservabilityEvent({
      level: "debug",
      event: "runtime.debug",
      trace_id: "trace-debug",
      component: "observability",
      message: "debug event",
    })
    emitObservabilityEvent({
      level: "warn",
      event: "runtime.warn",
      trace_id: "trace-warn",
      component: "observability",
      message: "warn event",
    })
    emitObservabilityEvent({
      level: "error",
      event: "runtime.error",
      trace_id: "trace-error",
      component: "observability",
      message: "error event",
    })
    emitObservabilityEvent({
      event: "runtime.info",
      trace_id: "trace-info",
      component: "observability",
      message: "info event",
    })

    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({
      event: "runtime.debug",
      trace_id: "trace-debug",
    }))
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      event: "runtime.warn",
      trace_id: "trace-warn",
    }))
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      event: "runtime.error",
      trace_id: "trace-error",
    }))
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: "runtime.info",
      trace_id: "trace-info",
    }))
  })

  it("creates a default logger when runtime logger is unset", () => {
    const chunks: string[] = []
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      chunks.push(chunk.toString())
      return true
    })

    setRuntimeLogger(null)
    emitObservabilityEvent({
      event: "runtime.default",
      component: "observability",
      message: "default logger path",
      meta: { test: true },
    })

    expect(chunks.length).toBeGreaterThan(0)
    const payload = JSON.parse(chunks[0]!.trim()) as Record<string, unknown>
    expect(payload.event).toBe("runtime.default")
    expect(payload.level).toBe("info")
    expect(typeof payload.trace_id).toBe("string")

    stderrSpy.mockRestore()
  })
})
