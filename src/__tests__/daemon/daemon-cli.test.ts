import { describe, expect, it, vi } from "vitest"

import {
  parseOuroCommand,
  runOuroCli,
  type OuroCliDeps,
} from "../../daemon/daemon-cli"
import { OuroDaemon } from "../../daemon/daemon"

describe("ouro CLI parsing", () => {
  it("parses daemon-level commands", () => {
    expect(parseOuroCommand(["start"])).toEqual({ kind: "daemon.start" })
    expect(parseOuroCommand(["stop"])).toEqual({ kind: "daemon.stop" })
    expect(parseOuroCommand(["status"])).toEqual({ kind: "daemon.status" })
    expect(parseOuroCommand(["health"])).toEqual({ kind: "daemon.health" })
  })

  it("parses agent management commands", () => {
    expect(parseOuroCommand(["agent", "start", "slugger"])).toEqual({
      kind: "agent.start",
      agent: "slugger",
    })
    expect(parseOuroCommand(["agent", "restart", "ouroboros"])).toEqual({
      kind: "agent.restart",
      agent: "ouroboros",
    })
  })

  it("parses cron commands", () => {
    expect(parseOuroCommand(["cron", "list"])).toEqual({ kind: "cron.list" })
    expect(parseOuroCommand(["cron", "trigger", "nightly-memory-pass"])).toEqual({
      kind: "cron.trigger",
      jobId: "nightly-memory-pass",
    })
  })

  it("throws on unknown command shapes", () => {
    expect(() => parseOuroCommand(["agent", "start"])).toThrow("Usage")
    expect(() => parseOuroCommand(["cron", "trigger"])).toThrow("Usage")
    expect(() => parseOuroCommand(["mystery"])).toThrow("Unknown command")
  })
})

describe("ouro CLI execution", () => {
  const sendCommand = vi.fn()
  const startDaemonProcess = vi.fn()

  const deps: OuroCliDeps = {
    socketPath: "/tmp/ouro-test.sock",
    sendCommand,
    startDaemonProcess,
    writeStdout: vi.fn(),
  }

  it("starts daemon without socket command round-trip", async () => {
    startDaemonProcess.mockResolvedValueOnce({ pid: 12345 })

    const result = await runOuroCli(["start"], deps)

    expect(result).toContain("started")
    expect(startDaemonProcess).toHaveBeenCalled()
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it("routes status command through daemon socket", async () => {
    sendCommand.mockResolvedValueOnce({ ok: true, summary: "running" })

    const result = await runOuroCli(["status"], deps)

    expect(sendCommand).toHaveBeenCalledWith(
      "/tmp/ouro-test.sock",
      expect.objectContaining({ kind: "daemon.status" }),
    )
    expect(result).toContain("running")
  })
})

describe("daemon command protocol", () => {
  it("handles raw JSON command payloads and returns structured JSON", async () => {
    const daemon = new OuroDaemon({
      socketPath: "/tmp/ouro-test.sock",
      processManager: {
        listAgentSnapshots: () => [
          {
            name: "slugger",
            channel: "cli",
            status: "running",
            pid: 123,
            restartCount: 0,
            startedAt: null,
            lastCrashAt: null,
            backoffMs: 1000,
          },
        ],
        startAutoStartAgents: async () => undefined,
        stopAll: async () => undefined,
        startAgent: async () => undefined,
        stopAgent: async () => undefined,
        restartAgent: async () => undefined,
      },
      scheduler: {
        listJobs: () => [],
        triggerJob: async () => ({ ok: true, message: "triggered" }),
      },
      healthMonitor: {
        runChecks: async () => [{ name: "agent-processes", status: "ok", message: "all good" }],
      },
      router: {
        send: async () => ({ id: "msg-1", queuedAt: "2026-03-05T22:00:00.000Z" }),
        pollInbox: () => [],
      },
    })

    const raw = await daemon.handleRawPayload('{"kind":"daemon.status"}')
    const parsed = JSON.parse(raw) as { ok: boolean; summary?: string }

    expect(parsed.ok).toBe(true)
    expect(parsed.summary).toContain("slugger")
  })

  it("returns protocol errors for malformed payloads", async () => {
    const daemon = new OuroDaemon({
      socketPath: "/tmp/ouro-test.sock",
      processManager: {
        listAgentSnapshots: () => [],
        startAutoStartAgents: async () => undefined,
        stopAll: async () => undefined,
        startAgent: async () => undefined,
        stopAgent: async () => undefined,
        restartAgent: async () => undefined,
      },
      scheduler: {
        listJobs: () => [],
        triggerJob: async () => ({ ok: true, message: "triggered" }),
      },
      healthMonitor: {
        runChecks: async () => [],
      },
      router: {
        send: async () => ({ id: "msg-1", queuedAt: "2026-03-05T22:00:00.000Z" }),
        pollInbox: () => [],
      },
    })

    const raw = await daemon.handleRawPayload("not-json")
    const parsed = JSON.parse(raw) as { ok: boolean; error?: string }

    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain("Invalid daemon command payload")
  })
})
