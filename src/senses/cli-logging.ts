import { logPath } from "../config"
import { createLogger, createNdjsonFileSink } from "../nerves"
import { setRuntimeLogger } from "../nerves/runtime"

export function configureCliRuntimeLogger(_friendId: string): void {
  const logger = createLogger({
    level: "info",
    sinks: [createNdjsonFileSink(logPath("cli", "runtime"))],
  })
  setRuntimeLogger(logger)
}
