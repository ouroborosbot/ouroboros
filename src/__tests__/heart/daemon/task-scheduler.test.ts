import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { afterEach, describe, expect, it } from "vitest"

import { parseTaskFile, renderTaskFile } from "../../../repertoire/tasks/parser"
import { TaskDrivenScheduler } from "../../../heart/daemon/task-scheduler"

function makeTaskFile(
  bundlesRoot: string,
  agent: string,
  collection: "habits" | "one-shots" | "ongoing",
  stem: string,
  frontmatter: Record<string, unknown>,
  body = "## scope\nrun task",
): string {
  const dir = path.join(bundlesRoot, `${agent}.ouro`, "tasks", collection)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${stem}.md`)
  fs.writeFileSync(filePath, renderTaskFile(frontmatter, body), "utf-8")
  return filePath
}

describe("task-driven scheduler", () => {
  let bundlesRoot = ""

  afterEach(() => {
    if (bundlesRoot && fs.existsSync(bundlesRoot)) {
      fs.rmSync(bundlesRoot, { recursive: true, force: true })
    }
    bundlesRoot = ""
  })

  it("reconciles cadence/scheduledAt tasks into ouro poke jobs", async () => {
    bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-scheduler-"))

    makeTaskFile(bundlesRoot, "slugger", "habits", "2026-03-07-0800-heartbeat", {
      type: "habit",
      category: "operations",
      title: "Heartbeat",
      status: "processing",
      cadence: "30m",
      scheduledAt: null,
      lastRun: "2026-03-07T08:00:00.000Z",
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    makeTaskFile(bundlesRoot, "slugger", "one-shots", "2026-03-07-0815-report", {
      type: "one-shot",
      category: "ops",
      title: "Send report",
      status: "processing",
      cadence: null,
      scheduledAt: "2026-03-07T15:45:00.000Z",
      lastRun: "2026-03-07T08:15:00.000Z",
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    makeTaskFile(bundlesRoot, "slugger", "habits", "2026-03-07-0820-invalid", {
      type: "habit",
      category: "operations",
      title: "Invalid cadence",
      status: "processing",
      cadence: "nonsense",
      scheduledAt: null,
      lastRun: null,
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    makeTaskFile(bundlesRoot, "slugger", "habits", "2026-03-07-0825-empty-values", {
      type: "habit",
      category: "operations",
      title: "Empty values",
      status: "processing",
      cadence: "\"\"",
      scheduledAt: "\"\"",
      lastRun: null,
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    makeTaskFile(bundlesRoot, "slugger", "one-shots", "2026-03-07-0830-null-last-run", {
      type: "one-shot",
      category: "ops",
      title: "Null last run",
      status: "processing",
      cadence: null,
      scheduledAt: "2026-03-07T18:00:00.000Z",
      lastRun: null,
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    const nonMarkdownPath = path.join(bundlesRoot, "slugger.ouro", "tasks", "habits", "note.txt")
    fs.writeFileSync(nonMarkdownPath, "ignore me", "utf-8")

    const scheduler = new TaskDrivenScheduler({
      bundlesRoot,
      agents: ["slugger"],
    })

    scheduler.start()

    const jobs = scheduler.listJobs()
    expect(jobs.map((job) => job.id).sort()).toEqual([
      "slugger:2026-03-07-0800-heartbeat:cadence",
      "slugger:2026-03-07-0815-report:scheduledAt",
      "slugger:2026-03-07-0830-null-last-run:scheduledAt",
    ])

    const internalJobs = (scheduler as any).jobs as Map<string, { command: string }>
    expect(internalJobs.get("slugger:2026-03-07-0800-heartbeat:cadence")?.command).toBe(
      "ouro poke slugger --task 2026-03-07-0800-heartbeat",
    )
  })

  it("records lastRun when task poke executes", async () => {
    bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-scheduler-"))

    const taskPath = makeTaskFile(bundlesRoot, "slugger", "habits", "2026-03-07-0900-checkin", {
      type: "habit",
      category: "operations",
      title: "Checkin",
      status: "processing",
      cadence: "1h",
      scheduledAt: null,
      lastRun: null,
      created: "2026-03-07",
      updated: null,
    })

    makeTaskFile(bundlesRoot, "slugger", "habits", "2026-03-07-0905-secondary", {
      type: "habit",
      category: "operations",
      title: "Secondary",
      status: "processing",
      cadence: "1h",
      scheduledAt: null,
      lastRun: null,
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    const scheduler = new TaskDrivenScheduler({
      bundlesRoot,
      agents: ["slugger"],
      nowIso: () => "2026-03-07T16:00:00.000Z",
    })

    await scheduler.recordTaskRun("slugger", "2026-03-07-0900-checkin")

    const parsed = parseTaskFile(fs.readFileSync(taskPath, "utf-8"), taskPath)
    expect(parsed.frontmatter.lastRun).toBe("2026-03-07T16:00:00.000Z")
    expect(parsed.frontmatter.updated).toBeNull()

    const job = scheduler.listJobs().find((entry) => entry.id === "slugger:2026-03-07-0900-checkin:cadence")
    expect(job?.lastRun).toBe("2026-03-07T16:00:00.000Z")
  })

  it("supports triggerJob for known and unknown ids", async () => {
    bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-scheduler-"))

    makeTaskFile(bundlesRoot, "slugger", "habits", "2026-03-07-1000-ping", {
      type: "habit",
      category: "operations",
      title: "Ping",
      status: "processing",
      cadence: "*/15 * * * *",
      scheduledAt: null,
      lastRun: null,
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    const scheduler = new TaskDrivenScheduler({
      bundlesRoot,
      agents: ["slugger"],
    })

    scheduler.start()

    await expect(scheduler.triggerJob("slugger:2026-03-07-1000-ping:cadence")).resolves.toEqual({
      ok: true,
      message: "triggered slugger:2026-03-07-1000-ping:cadence",
    })
    await expect(scheduler.triggerJob("missing-job")).resolves.toEqual({
      ok: false,
      message: "unknown scheduled job: missing-job",
    })
  })

  it("supports day cadence and ignores completed/invalid schedules", async () => {
    bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-scheduler-"))

    makeTaskFile(bundlesRoot, "slugger", "habits", "2026-03-07-1100-daily", {
      type: "habit",
      category: "operations",
      title: "Daily",
      status: "processing",
      cadence: "2d",
      scheduledAt: "not-a-date",
      lastRun: null,
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    makeTaskFile(bundlesRoot, "slugger", "habits", "2026-03-07-1115-zero", {
      type: "habit",
      category: "operations",
      title: "Zero cadence",
      status: "processing",
      cadence: "0h",
      scheduledAt: null,
      lastRun: null,
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    makeTaskFile(bundlesRoot, "slugger", "ongoing", "2026-03-07-1120-done", {
      type: "ongoing",
      category: "operations",
      title: "Already complete",
      status: "done",
      cadence: "1h",
      scheduledAt: null,
      lastRun: null,
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    const scheduler = new TaskDrivenScheduler({
      bundlesRoot,
      agents: ["slugger"],
    })

    scheduler.start()

    expect(scheduler.listJobs()).toEqual([
      {
        id: "slugger:2026-03-07-1100-daily:cadence",
        schedule: "0 0 */2 * *",
        lastRun: null,
      },
    ])
  })

  it("gracefully returns when recordTaskRun cannot resolve or parse a task", async () => {
    bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-scheduler-"))

    const scheduler = new TaskDrivenScheduler({
      bundlesRoot,
      agents: ["slugger"],
    })

    await expect(scheduler.recordTaskRun("slugger", "missing-task")).resolves.toBeUndefined()

    const taskPath = makeTaskFile(bundlesRoot, "slugger", "habits", "2026-03-07-1200-break", {
      type: "habit",
      category: "operations",
      title: "Break parse",
      status: "processing",
      cadence: "1h",
      scheduledAt: null,
      lastRun: null,
      created: "2026-03-07",
      updated: "2026-03-07",
    })

    scheduler.start()
    fs.writeFileSync(taskPath, "---\ntitle: bad\n---\n", "utf-8")
    await expect(scheduler.recordTaskRun("slugger", "2026-03-07-1200-break")).resolves.toBeUndefined()
  })

  it("walks nested task directories and skips malformed markdown files during reconcile", async () => {
    bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-scheduler-"))

    const nestedDir = path.join(bundlesRoot, "slugger.ouro", "tasks", "habits", "nested")
    fs.mkdirSync(nestedDir, { recursive: true })
    const nestedTaskPath = path.join(nestedDir, "2026-03-07-1300-nested.md")
    fs.writeFileSync(
      nestedTaskPath,
      renderTaskFile(
        {
          type: "habit",
          category: "operations",
          title: "Nested task",
          status: "processing",
          cadence: "1h",
          scheduledAt: null,
          lastRun: null,
          created: "2026-03-07",
          updated: "2026-03-07",
        },
        "## scope\nnested",
      ),
      "utf-8",
    )

    const malformedDir = path.join(bundlesRoot, "slugger.ouro", "tasks", "ongoing")
    fs.mkdirSync(malformedDir, { recursive: true })
    fs.writeFileSync(path.join(malformedDir, "2026-03-07-1305-bad.md"), "---\ntitle: bad\n---\n", "utf-8")

    const scheduler = new TaskDrivenScheduler({
      bundlesRoot,
      agents: ["slugger"],
    })

    scheduler.start()

    expect(scheduler.listJobs()).toEqual([
      {
        id: "slugger:2026-03-07-1300-nested:cadence",
        schedule: "0 */1 * * *",
        lastRun: null,
      },
    ])
  })

  it("falls back to default bundles root path and supports stop", async () => {
    const scheduler = new TaskDrivenScheduler({
      agents: ["slugger"],
      existsSync: () => false,
    })

    await expect(scheduler.reconcile()).resolves.toBeUndefined()
    scheduler.stop()
  })
})
