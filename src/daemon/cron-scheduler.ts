import { emitNervesEvent } from "../nerves/runtime"

export type CronJobResult = "success" | "error" | null

export interface CronJobDefinition {
  id: string
  schedule: string
  agent: string
  taskFile: string
  instruction: string
  lastRun: string | null
  lastResult: CronJobResult
}

export interface CronSchedulerOptions {
  jobs: CronJobDefinition[]
  runJob: (job: CronJobDefinition) => Promise<{ ok: boolean; message: string }>
  now?: () => string
  setIntervalFn?: (cb: () => void, delay: number) => unknown
  clearIntervalFn?: (timer: unknown) => void
}

function scheduleToIntervalMs(schedule: string): number {
  const match = schedule.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/)
  if (!match) return 60_000
  const minutes = Number.parseInt(match[1], 10)
  if (!Number.isFinite(minutes) || minutes <= 0) return 60_000
  return minutes * 60_000
}

export class CronScheduler {
  private readonly jobs = new Map<string, CronJobDefinition>()
  private readonly runJobFn: (job: CronJobDefinition) => Promise<{ ok: boolean; message: string }>
  private readonly now: () => string
  private readonly setIntervalFn: (cb: () => void, delay: number) => unknown
  private readonly clearIntervalFn: (timer: unknown) => void
  private readonly timers = new Map<string, unknown>()

  constructor(options: CronSchedulerOptions) {
    this.runJobFn = options.runJob
    this.now = options.now ?? (() => new Date().toISOString())
    this.setIntervalFn = options.setIntervalFn ?? ((cb, delay) => setInterval(cb, delay))
    this.clearIntervalFn = options.clearIntervalFn ?? ((timer) => clearInterval(timer as NodeJS.Timeout))

    for (const job of options.jobs) {
      this.jobs.set(job.id, { ...job })
    }
  }

  addJob(job: CronJobDefinition): void {
    this.jobs.set(job.id, { ...job })
    emitNervesEvent({
      component: "daemon",
      event: "daemon.cron_job_added",
      message: "cron job added to scheduler",
      meta: { jobId: job.id, schedule: job.schedule },
    })
  }

  listJobs(): CronJobDefinition[] {
    return [...this.jobs.values()].map((job) => ({ ...job }))
  }

  start(): void {
    this.stop()
    for (const job of this.jobs.values()) {
      const intervalMs = scheduleToIntervalMs(job.schedule)
      const timer = this.setIntervalFn(() => {
        void this.executeJob(job.id)
      }, intervalMs)
      this.timers.set(job.id, timer)
    }
    emitNervesEvent({
      component: "daemon",
      event: "daemon.cron_start",
      message: "cron scheduler started",
      meta: { jobCount: this.jobs.size },
    })
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      this.clearIntervalFn(timer)
    }
    this.timers.clear()
    emitNervesEvent({
      component: "daemon",
      event: "daemon.cron_stop",
      message: "cron scheduler stopped",
      meta: {},
    })
  }

  async triggerJob(jobId: string): Promise<{ ok: boolean; message: string }> {
    if (!this.jobs.has(jobId)) {
      return { ok: false, message: `cron job '${jobId}' not found` }
    }
    return this.executeJob(jobId)
  }

  private async executeJob(jobId: string): Promise<{ ok: boolean; message: string }> {
    const job = this.jobs.get(jobId) as CronJobDefinition

    emitNervesEvent({
      component: "daemon",
      event: "daemon.cron_run_start",
      message: "cron job execution started",
      meta: { jobId: job.id },
    })

    const result = await this.runJobFn({ ...job })
    const updated: CronJobDefinition = {
      ...job,
      lastRun: this.now(),
      lastResult: result.ok ? "success" : "error",
    }
    this.jobs.set(job.id, updated)

    emitNervesEvent({
      level: result.ok ? "info" : "warn",
      component: "daemon",
      event: "daemon.cron_run_end",
      message: "cron job execution finished",
      meta: { jobId: job.id, ok: result.ok },
    })

    return result
  }
}
