import { beforeEach, describe, expect, it, vi } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { CronScheduler } from "../../daemon/cron-scheduler"
import { FileMessageRouter } from "../../daemon/message-router"
import { HealthMonitor } from "../../daemon/health-monitor"

describe("cron scheduler", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it("triggers recurring jobs on interval schedules", async () => {
    vi.useFakeTimers()
    const runJob = vi.fn(async () => ({ ok: true, message: "done" }))

    const scheduler = new CronScheduler({
      jobs: [
        {
          id: "heartbeat",
          schedule: "*/1 * * * *",
          agent: "slugger",
          taskFile: "/tmp/heartbeat.md",
          instruction: "Check queue",
          lastRun: null,
          lastResult: null,
        },
      ],
      runJob,
    })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(runJob).toHaveBeenCalledWith(expect.objectContaining({ id: "heartbeat" }))
    expect(scheduler.listJobs()[0]?.lastResult).toBe("success")

    scheduler.stop()
    vi.useRealTimers()
  })

  it("supports explicit trigger and missing-job failures", async () => {
    const runJob = vi.fn(async () => ({ ok: true, message: "done" }))
    const scheduler = new CronScheduler({ jobs: [], runJob })

    const missing = await scheduler.triggerJob("nope")
    expect(missing.ok).toBe(false)
    expect(missing.message).toContain("not found")

    scheduler.addJob({
      id: "manual",
      schedule: "*/5 * * * *",
      agent: "ouroboros",
      taskFile: "/tmp/manual.md",
      instruction: "Run health",
      lastRun: null,
      lastResult: null,
    })

    const triggered = await scheduler.triggerJob("manual")
    expect(triggered.ok).toBe(true)
    expect(runJob).toHaveBeenCalled()
  })
})

describe("file message router", () => {
  it("delivers messages via per-agent inbox files", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "daemon-router-"))
    const router = new FileMessageRouter({
      baseDir: tmpDir,
      now: () => "2026-03-05T23:05:00.000Z",
    })

    const receipt = await router.send({
      from: "slugger",
      to: "ouroboros",
      content: "Can you review this?",
      priority: "urgent",
    })

    expect(receipt.id).toContain("msg-")

    const inbox = router.pollInbox("ouroboros")
    expect(inbox).toHaveLength(1)
    expect(inbox[0]).toMatchObject({
      from: "slugger",
      to: "ouroboros",
      content: "Can you review this?",
      priority: "urgent",
    })

    expect(router.pollInbox("ouroboros")).toHaveLength(0)
  })
})

describe("health monitor", () => {
  it("classifies checks and routes critical alerts directly", async () => {
    const alertSink = vi.fn(async () => undefined)

    const monitor = new HealthMonitor({
      processManager: {
        listAgentSnapshots: () => [
          {
            name: "ouroboros",
            channel: "cli",
            status: "running",
            pid: 111,
            restartCount: 0,
            startedAt: "2026-03-05T22:00:00.000Z",
            lastCrashAt: null,
            backoffMs: 1000,
          },
          {
            name: "slugger",
            channel: "cli",
            status: "crashed",
            pid: null,
            restartCount: 5,
            startedAt: null,
            lastCrashAt: "2026-03-05T22:59:00.000Z",
            backoffMs: 60000,
          },
        ],
      },
      scheduler: {
        listJobs: () => [
          {
            id: "daily",
            schedule: "0 8 * * *",
            lastRun: null,
          },
        ],
      },
      alertSink,
      diskUsagePercent: () => 95,
    })

    const results = await monitor.runChecks()
    expect(results.some((result) => result.status === "warn")).toBe(true)
    expect(results.some((result) => result.status === "critical")).toBe(true)
    expect(alertSink).toHaveBeenCalled()
  })
})
