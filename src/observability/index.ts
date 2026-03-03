import { appendFileSync, mkdirSync } from "fs"
import { dirname } from "path"
import { randomUUID } from "crypto"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogEventInput {
  event: string
  trace_id: string
  component: string
  message: string
  meta: Record<string, unknown>
}

export interface LogEvent extends LogEventInput {
  ts: string
  level: LogLevel
}

export type LogSink = (entry: LogEvent) => void

export interface Logger {
  debug(entry: LogEventInput): void
  info(entry: LogEventInput): void
  warn(entry: LogEventInput): void
  error(entry: LogEventInput): void
}

export interface LoggerOptions {
  level?: LogLevel
  sinks?: LogSink[]
  now?: () => Date
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function shouldEmit(configuredLevel: LogLevel, eventLevel: LogLevel): boolean {
  return LEVEL_PRIORITY[eventLevel] >= LEVEL_PRIORITY[configuredLevel]
}

export function createTraceId(): string {
  return randomUUID()
}

export function ensureTraceId(traceId?: string): string {
  return traceId && traceId.trim() ? traceId : createTraceId()
}

export function createFanoutSink(sinks: LogSink[]): LogSink {
  return (entry: LogEvent): void => {
    for (const sink of sinks) {
      sink(entry)
    }
  }
}

export function createStderrSink(write: (chunk: string) => unknown = (chunk) => process.stderr.write(chunk)): LogSink {
  return (entry: LogEvent): void => {
    write(`${JSON.stringify(entry)}\n`)
  }
}

export function createNdjsonFileSink(filePath: string): LogSink {
  mkdirSync(dirname(filePath), { recursive: true })

  return (entry: LogEvent): void => {
    appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8")
  }
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const configuredLevel = options.level ?? "info"
  const sinks = options.sinks ?? [createStderrSink()]
  const sink = createFanoutSink(sinks)
  const now = options.now ?? (() => new Date())

  function emit(level: LogLevel, entry: LogEventInput): void {
    if (!shouldEmit(configuredLevel, level)) {
      return
    }

    sink({
      ts: now().toISOString(),
      level,
      event: entry.event,
      trace_id: entry.trace_id,
      component: entry.component,
      message: entry.message,
      meta: entry.meta,
    })
  }

  return {
    debug: (entry: LogEventInput) => emit("debug", entry),
    info: (entry: LogEventInput) => emit("info", entry),
    warn: (entry: LogEventInput) => emit("warn", entry),
    error: (entry: LogEventInput) => emit("error", entry),
  }
}
