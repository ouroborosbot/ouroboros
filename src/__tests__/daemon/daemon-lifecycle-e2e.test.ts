import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OuroDaemon, type DaemonProcessManagerLike } from "../../daemon/daemon"
import { CronScheduler } from "../../daemon/cron-scheduler"
import { FileMessageRouter } from "../../daemon/message-router"
import { HealthMonitor } from "../../daemon/health-monitor"

describe("daemon lifecycle e2e", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("runs scheduled work while daemon is up and halts it when stopped", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "daemon-e2e-"))
    const socketPath = path.join(tmpRoot, "daemon.sock")
    const runJob = vi.fn(async () => ({ ok: true, message: "done" }))

    const processManager: DaemonProcessManagerLike = {
      startAutoStartAgents: vi.fn(async () => undefined),
      stopAll: vi.fn(async () => undefined),
      startAgent: vi.fn(async () => undefined),
      stopAgent: vi.fn(async () => undefined),
      restartAgent: vi.fn(async () => undefined),
      listAgentSnapshots: () => [
        {
          name: "ouroboros",
          channel: "cli",
          status: "running",
          pid: 11,
          restartCount: 0,
          startedAt: "2026-03-05T23:00:00.000Z",
          lastCrashAt: null,
          backoffMs: 1000,
        },
        {
          name: "slugger",
          channel: "cli",
          status: "running",
          pid: 22,
          restartCount: 0,
          startedAt: "2026-03-05T23:00:00.000Z",
          lastCrashAt: null,
          backoffMs: 1000,
        },
      ],
    }

    const scheduler = new CronScheduler({
      jobs: [
        {
          id: "heartbeat",
          schedule: "*/1 * * * *",
          agent: "ouroboros",
          taskFile: "/tmp/heartbeat.md",
          instruction: "check",
          lastRun: null,
          lastResult: null,
        },
      ],
      runJob,
    })

    const router = new FileMessageRouter({ baseDir: path.join(tmpRoot, "messages") })
    const healthMonitor = new HealthMonitor({
      processManager,
      scheduler,
      diskUsagePercent: () => 10,
      alertSink: vi.fn(async () => undefined),
    })

    const daemon = new OuroDaemon({
      socketPath,
      processManager,
      scheduler,
      healthMonitor,
      router,
    })

    await daemon.start()

    await expect(daemon.handleCommand({ kind: "message.send", from: "ouroboros", to: "slugger", content: "hi" })).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    )
    await expect(daemon.handleCommand({ kind: "message.poll", agent: "slugger" })).resolves.toEqual(
      expect.objectContaining({ ok: true, data: expect.arrayContaining([expect.objectContaining({ content: "hi" })]) }),
    )

    await vi.advanceTimersByTimeAsync(60_000)
    expect(runJob).toHaveBeenCalledTimes(1)

    await daemon.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(runJob).toHaveBeenCalledTimes(1)
  })
})
