import { describe, expect, it, vi } from "vitest"
import { emitNervesEvent } from "../../../nerves/runtime"

vi.mock("../../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

import { OuroDaemon, type DaemonCommand } from "../../../heart/daemon/daemon"

describe("daemon handleCommand error wrapping", () => {
  function makeDaemon(overrides: { startAgent?: () => Promise<void> } = {}) {
    const processManager = {
      listAgentSnapshots: vi.fn(() => []),
      startAutoStartAgents: vi.fn(async () => undefined),
      stopAll: vi.fn(async () => undefined),
      startAgent: overrides.startAgent ?? vi.fn(async () => undefined),
      stopAgent: vi.fn(async () => undefined),
      restartAgent: vi.fn(async () => undefined),
      sendToAgent: vi.fn(),
    }

    const scheduler = {
      listJobs: vi.fn(() => []),
      triggerJob: vi.fn(async () => ({ ok: true, message: "ok" })),
    }

    const healthMonitor = {
      runChecks: vi.fn(async () => []),
    }

    const router = {
      send: vi.fn(async () => ({ id: "msg-1", queuedAt: "2026-03-05T23:00:00.000Z" })),
      pollInbox: vi.fn(() => []),
    }

    return new OuroDaemon({
      socketPath: "/tmp/test.sock",
      processManager,
      scheduler,
      healthMonitor,
      router,
    } as any)
  }

  it("catches errors from command handlers, logs with context, and re-throws", async () => {
    const daemon = makeDaemon({
      startAgent: vi.fn(async () => { throw new Error("agent not found") }),
    })

    const command: DaemonCommand = { kind: "agent.start", agent: "ghost" }
    await expect(daemon.handleCommand(command)).rejects.toThrow("agent not found")

    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        component: "daemon",
        event: "daemon.command_error",
        meta: expect.objectContaining({
          kind: "agent.start",
          error: "agent not found",
        }),
      }),
    )
  })

  it("still returns ok: false through handleRawPayload when inner handler throws", async () => {
    const daemon = makeDaemon({
      startAgent: vi.fn(async () => { throw new Error("boom") }),
    })

    const raw = JSON.stringify({ kind: "agent.start", agent: "ghost" })
    const responseStr = await daemon.handleRawPayload(raw)
    const response = JSON.parse(responseStr)

    expect(response.ok).toBe(false)
    expect(response.error).toBe("boom")
  })

  it("handles non-Error throws in command handler and logs with null stack", async () => {
    const daemon = makeDaemon({
      startAgent: vi.fn(async () => { throw "string error" }),
    })

    const command: DaemonCommand = { kind: "agent.start", agent: "ghost" }
    await expect(daemon.handleCommand(command)).rejects.toBe("string error")

    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "daemon.command_error",
        meta: expect.objectContaining({
          kind: "agent.start",
          error: "string error",
          stack: null,
        }),
      }),
    )
  })
})
