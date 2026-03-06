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

  it("falls back to default 60s interval for non-step and invalid step schedules", () => {
    const setIntervalFn = vi.fn(() => 1)
    const clearIntervalFn = vi.fn()

    const scheduler = new CronScheduler({
      jobs: [
        {
          id: "daily",
          schedule: "0 8 * * *",
          agent: "slugger",
          taskFile: "/tmp/daily.md",
          instruction: "daily",
          lastRun: null,
          lastResult: null,
        },
        {
          id: "bad-step",
          schedule: "*/0 * * * *",
          agent: "slugger",
          taskFile: "/tmp/bad.md",
          instruction: "bad",
          lastRun: null,
          lastResult: null,
        },
      ],
      runJob: async () => ({ ok: true, message: "ok" }),
      setIntervalFn,
      clearIntervalFn,
    })

    scheduler.start()

    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 60_000)
    expect(setIntervalFn).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it("records error results when a cron job execution fails", async () => {
    const runJob = vi.fn(async () => ({ ok: false, message: "failed" }))
    const scheduler = new CronScheduler({
      jobs: [
        {
          id: "failing",
          schedule: "*/5 * * * *",
          agent: "slugger",
          taskFile: "/tmp/fail.md",
          instruction: "fail",
          lastRun: null,
          lastResult: null,
        },
      ],
      runJob,
      now: () => "2026-03-05T23:10:00.000Z",
    })

    const result = await scheduler.triggerJob("failing")
    expect(result.ok).toBe(false)
    expect(scheduler.listJobs()[0]).toMatchObject({
      id: "failing",
      lastRun: "2026-03-05T23:10:00.000Z",
      lastResult: "error",
    })
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

  it("returns empty list for missing inbox files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "daemon-router-empty-"))
    const router = new FileMessageRouter({ baseDir: tmpDir })

    expect(router.pollInbox("missing-agent")).toEqual([])
  })

  it("uses normal priority when none is provided", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "daemon-router-normal-"))
    const router = new FileMessageRouter({
      baseDir: tmpDir,
      now: () => "2026-03-05T23:20:00.000Z",
    })

    await router.send({
      from: "ouroboros",
      to: "slugger",
      content: "default-priority",
    })

    const inbox = router.pollInbox("slugger")
    expect(inbox[0]?.priority).toBe("normal")
  })

  it("can initialize using default base directory behavior", async () => {
    const router = new FileMessageRouter()
    const receipt = await router.send({
      from: "ouroboros",
      to: "self-check",
      content: "default-dir",
    })

    expect(receipt.id).toContain("msg-")
    const polled = router.pollInbox("self-check")
    expect(polled).toHaveLength(1)
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

  it("reports all-ok state and uses default alert sink", async () => {
    const monitor = new HealthMonitor({
      processManager: {
        listAgentSnapshots: () => [
          { name: "ouroboros", status: "running" },
          { name: "slugger", status: "running" },
        ],
      },
      scheduler: {
        listJobs: () => [{ id: "daily", lastRun: "2026-03-05T23:00:00.000Z" }],
      },
      diskUsagePercent: () => 10,
    })

    const results = await monitor.runChecks()
    expect(results).toEqual([
      { name: "agent-processes", status: "ok", message: "all managed agents running" },
      { name: "cron-health", status: "ok", message: "cron jobs are healthy" },
      { name: "disk-space", status: "ok", message: "disk usage healthy (10%)" },
    ])
  })

  it("reports high-disk warn path", async () => {
    const monitor = new HealthMonitor({
      processManager: {
        listAgentSnapshots: () => [{ name: "ouroboros", status: "running" }],
      },
      scheduler: {
        listJobs: () => [{ id: "daily", lastRun: "2026-03-05T23:00:00.000Z" }],
      },
      alertSink: vi.fn(async () => undefined),
      diskUsagePercent: () => 85,
    })

    const results = await monitor.runChecks()
    expect(results.some((result) => result.name === "disk-space" && result.status === "warn")).toBe(true)
  })

  it("handles critical results without a custom alert sink", async () => {
    const monitor = new HealthMonitor({
      processManager: {
        listAgentSnapshots: () => [{ name: "slugger", status: "crashed" }],
      },
      scheduler: {
        listJobs: () => [{ id: "daily", lastRun: null }],
      },
      diskUsagePercent: () => 95,
    })

    const results = await monitor.runChecks()
    expect(results.some((result) => result.status === "critical")).toBe(true)
  })
})
