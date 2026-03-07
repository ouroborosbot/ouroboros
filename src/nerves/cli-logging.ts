import { logPath } from "../heart/config"
import { createLogger, createNdjsonFileSink, createTerminalSink, type LogLevel, type LogSink } from "../nerves"
import { emitNervesEvent } from "./runtime"
import { setRuntimeLogger } from "./runtime"

export type CliRuntimeSink = "terminal" | "ndjson"

export interface CliRuntimeLoggerOptions {
  level?: LogLevel
  sinks?: CliRuntimeSink[]
}

function resolveCliSinks(sinks: CliRuntimeSink[] | undefined): CliRuntimeSink[] {
  const requested: CliRuntimeSink[] = sinks && sinks.length > 0 ? sinks : ["terminal", "ndjson"]
  return [...new Set(requested)]
}

export function configureCliRuntimeLogger(_friendId: string, options: CliRuntimeLoggerOptions = {}): void {
  const sinkKinds = resolveCliSinks(options.sinks)
  const sinks: LogSink[] = sinkKinds.map((sinkKind) => {
    if (sinkKind === "terminal") {
      return createTerminalSink()
    }
    return createNdjsonFileSink(logPath("cli", "runtime"))
  })

  const logger = createLogger({
    level: options.level ?? "info",
    sinks,
  })
  setRuntimeLogger(logger)
  emitNervesEvent({
    component: "senses",
    event: "senses.cli_logger_configured",
    message: "cli runtime logger configured",
    meta: { sinks: sinkKinds, level: options.level ?? "info" },
  })
}
