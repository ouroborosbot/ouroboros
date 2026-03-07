import { afterEach, describe, expect, it, vi } from "vitest"
import * as fs from "fs"
import * as net from "net"
import * as os from "os"
import * as path from "path"

import { OuroDaemon } from "../../daemon/daemon"

function tmpSocketPath(name: string): string {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sock`)
}

function sendRaw(socketPath: string, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath)
    let raw = ""
    client.on("connect", () => {
      client.write(payload)
      client.end()
    })
    client.on("data", (chunk) => {
      raw += chunk.toString("utf-8")
    })
    client.on("error", reject)
    client.on("end", () => resolve(raw))
  })
}

describe("daemon command plane branches", () => {
  const make = (socketPath: string, bundlesRoot?: string) => {
    const processManager = {
      listAgentSnapshots: vi.fn(() => []),
      startAutoStartAgents: vi.fn(async () => undefined),
      stopAll: vi.fn(async () => undefined),
      startAgent: vi.fn(async () => undefined),
    }

    const scheduler = {
      listJobs: vi.fn(() => []),
      triggerJob: vi.fn(async (jobId: string) => ({ ok: true, message: `triggered ${jobId}` })),
      reconcile: vi.fn(async () => undefined),
      recordTaskRun: vi.fn(async (_agent: string, _taskId: string) => undefined),
    }

    const healthMonitor = {
      runChecks: vi.fn(async () => [{ name: "agent-processes", status: "ok" as const, message: "good" }]),
    }

    const router = {
      send: vi.fn(async () => ({ id: "msg-1", queuedAt: "2026-03-05T23:00:00.000Z" })),
      pollInbox: vi.fn(() => [{ id: "m", from: "slugger", content: "hello", queuedAt: "x", priority: "normal" }]),
    }

    const daemon = new OuroDaemon({ socketPath, processManager, scheduler, healthMonitor, router, bundlesRoot })
    return { daemon, processManager, scheduler, healthMonitor, router }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("handles daemon start/stop and socket lifecycle", async () => {
    const socketPath = tmpSocketPath("daemon-start-stop")
    fs.writeFileSync(socketPath, "stale", "utf-8")

    const { daemon, processManager } = make(socketPath)

    const started = await daemon.handleCommand({ kind: "daemon.start" })
    expect(started).toEqual({ ok: true, message: "daemon started" })
    expect(processManager.startAutoStartAgents).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(socketPath)).toBe(true)

    const stopped = await daemon.handleCommand({ kind: "daemon.stop" })
    expect(stopped).toEqual({ ok: true, message: "daemon stopped" })
    expect(processManager.stopAll).toHaveBeenCalled()
    expect(fs.existsSync(socketPath)).toBe(false)
  })

  it("returns status summary for empty and populated snapshots", async () => {
    const socketPath = tmpSocketPath("daemon-status")
    const { daemon, processManager } = make(socketPath)

    const emptyStatus = await daemon.handleCommand({ kind: "daemon.status" })
    expect(emptyStatus.summary).toBe("no managed agents")

    processManager.listAgentSnapshots.mockReturnValueOnce([
      {
        name: "slugger",
        channel: "cli",
        status: "running",
        pid: null,
        restartCount: 2,
        startedAt: null,
        lastCrashAt: null,
        backoffMs: 1000,
      },
    ])

    const populatedStatus = await daemon.handleCommand({ kind: "daemon.status" })
    expect(populatedStatus.summary).toContain("slugger")
    expect(populatedStatus.summary).toContain("restarts=2")
  })

  it("handles logs, chat connect, message, task poke, and hatch commands", async () => {
    const socketPath = tmpSocketPath("daemon-command-set")
    const { daemon, processManager, router, scheduler } = make(socketPath)

    const logs = await daemon.handleCommand({ kind: "daemon.logs" })
    expect(logs.ok).toBe(true)
    expect(logs.summary).toContain("logs")

    const chat = await daemon.handleCommand({ kind: "chat.connect", agent: "slugger" })
    expect(chat.ok).toBe(true)
    expect(chat.message).toContain("connected")
    expect(processManager.startAgent).toHaveBeenCalledWith("slugger")

    const queued = await daemon.handleCommand({
      kind: "message.send",
      from: "ouro-cli",
      to: "ouroboros",
      content: "hi",
      sessionId: "session-1",
      taskRef: "task-7",
    })
    expect(queued.message).toContain("queued message")
    expect(router.send).toHaveBeenCalledWith(expect.objectContaining({
      from: "ouro-cli",
      to: "ouroboros",
      content: "hi",
      sessionId: "session-1",
      taskRef: "task-7",
    }))

    const polled = await daemon.handleCommand({ kind: "message.poll", agent: "ouroboros" })
    expect(polled.summary).toBe("1 messages")
    expect(router.pollInbox).toHaveBeenCalledWith("ouroboros")

    const poke = await daemon.handleCommand({ kind: "task.poke", agent: "slugger", taskId: "habit-heartbeat" })
    expect(poke.ok).toBe(true)
    expect(router.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "slugger",
      taskRef: "habit-heartbeat",
    }))
    expect(scheduler.recordTaskRun).toHaveBeenCalledWith("slugger", "habit-heartbeat")

    const hatch = await daemon.handleCommand({ kind: "hatch.start" })
    expect(hatch.ok).toBe(true)
    expect(hatch.message).toContain("Gate 6")
  })

  it("returns protocol errors for malformed payloads", async () => {
    const socketPath = tmpSocketPath("daemon-bad-raw")
    const { daemon } = make(socketPath)

    const notJson = JSON.parse(await daemon.handleRawPayload("not-json")) as { ok: boolean; error: string }
    expect(notJson.ok).toBe(false)
    expect(notJson.error).toContain("expected JSON object")

    const missingKind = JSON.parse(await daemon.handleRawPayload("{}")) as { ok: boolean; error: string }
    expect(missingKind.error).toContain("missing kind")

    const badKindType = JSON.parse(await daemon.handleRawPayload("{\"kind\":123}")) as { ok: boolean; error: string }
    expect(badKindType.error).toContain("kind must be a string")
  })

  it("stringifies non-Error throw values from command handling", async () => {
    const socketPath = tmpSocketPath("daemon-non-error-catch")
    const { daemon } = make(socketPath)
    vi.spyOn(daemon, "handleCommand").mockRejectedValueOnce("string-failure")

    const raw = await daemon.handleRawPayload("{\"kind\":\"daemon.status\"}")
    const parsed = JSON.parse(raw) as { ok: boolean; error: string }

    expect(parsed.ok).toBe(false)
    expect(parsed.error).toBe("string-failure")
  })

  it("serves socket requests and can be started twice safely", async () => {
    const socketPath = tmpSocketPath("daemon-socket-integration")
    const { daemon } = make(socketPath)

    await daemon.start()
    await daemon.start()

    const raw = await sendRaw(socketPath, "{\"kind\":\"daemon.status\"}")
    const parsed = JSON.parse(raw) as { ok: boolean; summary?: string }

    expect(parsed.ok).toBe(true)
    expect(parsed.summary).toBe("no managed agents")

    await daemon.stop()
  })

  it("drains pending inbox fallback files on daemon start", async () => {
    const socketPath = tmpSocketPath("daemon-pending-drain")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "daemon-bundles-"))
    const pendingDir = path.join(bundlesRoot, "slugger.ouro", "inbox")
    fs.mkdirSync(pendingDir, { recursive: true })
    const pendingPath = path.join(pendingDir, "pending.jsonl")
    fs.writeFileSync(
      pendingPath,
      `${JSON.stringify({
        from: "ouro-cli",
        to: "slugger",
        content: "queued while daemon was down",
        priority: "normal",
        sessionId: "session-1",
        taskRef: "task-1",
      })}\n`,
      "utf-8",
    )

    const { daemon, router } = make(socketPath, bundlesRoot)
    await daemon.start()
    await daemon.stop()

    expect(router.send).toHaveBeenCalledWith(expect.objectContaining({
      from: "ouro-cli",
      to: "slugger",
      content: "queued while daemon was down",
      sessionId: "session-1",
      taskRef: "task-1",
    }))
    expect(fs.readFileSync(pendingPath, "utf-8")).toBe("")

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
  })

  it("returns unknown-command error for unsupported kinds", async () => {
    const socketPath = tmpSocketPath("daemon-unknown-command")
    const { daemon } = make(socketPath)

    const result = await daemon.handleCommand({ kind: "unknown" } as unknown as never)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("Unknown daemon command")
  })

  it("stops cleanly when server was never started", async () => {
    const socketPath = tmpSocketPath("daemon-stop-no-server")
    fs.writeFileSync(socketPath, "stale", "utf-8")
    const { daemon, processManager } = make(socketPath)

    await daemon.stop()
    expect(processManager.stopAll).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(socketPath)).toBe(false)
  })

  it("handles health, agent lifecycle, and cron commands", async () => {
    const socketPath = tmpSocketPath("daemon-admin-commands")
    const { daemon, processManager, scheduler, healthMonitor } = make(socketPath)
    processManager.stopAgent = vi.fn(async (_agent: string) => undefined)
    processManager.restartAgent = vi.fn(async (_agent: string) => undefined)
    scheduler.listJobs.mockReturnValue([
      { id: "habit-heartbeat", schedule: "daily", lastRun: "2026-03-06T08:00:00.000Z" },
    ])

    const health = await daemon.handleCommand({ kind: "daemon.health" })
    expect(health.ok).toBe(true)
    expect(health.summary).toContain("agent-processes:ok:good")
    expect(health.data).toEqual(await healthMonitor.runChecks())

    const started = await daemon.handleCommand({ kind: "agent.start", agent: "slugger" })
    expect(started.message).toBe("started slugger")
    expect(processManager.startAgent).toHaveBeenCalledWith("slugger")

    const stopped = await daemon.handleCommand({ kind: "agent.stop", agent: "slugger" })
    expect(stopped.message).toBe("stopped slugger")
    expect(processManager.stopAgent).toHaveBeenCalledWith("slugger")

    const restarted = await daemon.handleCommand({ kind: "agent.restart", agent: "slugger" })
    expect(restarted.message).toBe("restarted slugger")
    expect(processManager.restartAgent).toHaveBeenCalledWith("slugger")

    const cronList = await daemon.handleCommand({ kind: "cron.list" })
    expect(cronList.summary).toContain("habit-heartbeat")

    scheduler.listJobs.mockReturnValueOnce([
      { id: "nightly", schedule: "daily", lastRun: null },
    ])
    const neverRunCronList = await daemon.handleCommand({ kind: "cron.list" })
    expect(neverRunCronList.summary).toContain("last=never")

    scheduler.listJobs.mockReturnValueOnce([])
    const emptyCronList = await daemon.handleCommand({ kind: "cron.list" })
    expect(emptyCronList.summary).toBe("no cron jobs")

    const cronTrigger = await daemon.handleCommand({ kind: "cron.trigger", jobId: "habit-heartbeat" })
    expect(cronTrigger).toEqual({ ok: true, message: "triggered habit-heartbeat" })
  })

  it("retains malformed pending lines and tolerates unreadable bundle roots", async () => {
    const socketPath = tmpSocketPath("daemon-pending-invalid")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "daemon-bundles-invalid-"))
    const pendingDir = path.join(bundlesRoot, "slugger.ouro", "inbox")
    fs.mkdirSync(pendingDir, { recursive: true })
    const pendingPath = path.join(pendingDir, "pending.jsonl")
    fs.writeFileSync(
      pendingPath,
      [
        "{\"from\":\"ouro-cli\",\"to\":\"slugger\",\"content\":\"valid\",\"priority\":1,\"sessionId\":2,\"taskRef\":3}",
        "{\"from\":\"ouro-cli\",\"to\":\"slugger\"}",
        "{invalid-json",
      ].join("\n") + "\n",
      "utf-8",
    )

    const { daemon, router } = make(socketPath, bundlesRoot)
    await daemon.start()
    await daemon.stop()

    expect(router.send).toHaveBeenCalledTimes(1)
    expect(router.send).toHaveBeenCalledWith({
      from: "ouro-cli",
      to: "slugger",
      content: "valid",
      priority: undefined,
      sessionId: undefined,
      taskRef: undefined,
    })
    const retained = fs.readFileSync(pendingPath, "utf-8")
    expect(retained).toContain("{\"from\":\"ouro-cli\",\"to\":\"slugger\"}")
    expect(retained).toContain("{invalid-json")

    const unreadableRoot = path.join(os.tmpdir(), `daemon-bundles-file-${Date.now()}`)
    fs.writeFileSync(unreadableRoot, "not-a-directory", "utf-8")
    const { daemon: unreadableDaemon } = make(tmpSocketPath("daemon-unreadable-bundles"), unreadableRoot)
    await expect(unreadableDaemon.start()).resolves.toBeUndefined()
    await unreadableDaemon.stop()

    const missingRoot = path.join(os.tmpdir(), `daemon-bundles-missing-${Date.now()}`)
    const { daemon: missingRootDaemon } = make(tmpSocketPath("daemon-missing-bundles"), missingRoot)
    await expect(missingRootDaemon.start()).resolves.toBeUndefined()
    await missingRootDaemon.stop()

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
    fs.rmSync(unreadableRoot, { force: true })
  })
})
