import { logPath } from "../config"
import { createLogger, createNdjsonFileSink } from "../nerves"
import { emitNervesEvent } from "../nerves/runtime"
import { setRuntimeLogger } from "../nerves/runtime"

export function configureCliRuntimeLogger(_friendId: string): void {
  const logger = createLogger({
    level: "info",
    sinks: [createNdjsonFileSink(logPath("cli", "runtime"))],
  })
  setRuntimeLogger(logger)
  emitNervesEvent({
    component: "senses",
    event: "senses.cli_logger_configured",
    message: "cli runtime logger configured",
    meta: {},
  })
}
