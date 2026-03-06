import { runInnerDialogTurn } from "./inner-dialog"
import { emitNervesEvent } from "../nerves/runtime"

export type InnerDialogWorkerReason = "boot" | "heartbeat" | "instinct"

export interface InnerDialogWorkerMessage {
  type: "heartbeat" | "shutdown" | string
}

export interface InnerDialogWorkerController {
  run(reason: InnerDialogWorkerReason): Promise<void>
  handleMessage(message: unknown): Promise<void>
}

export function createInnerDialogWorker(
  runTurn: (options: { reason: InnerDialogWorkerReason }) => Promise<unknown> = (options) => runInnerDialogTurn(options),
): InnerDialogWorkerController {
  let running = false

  async function run(reason: InnerDialogWorkerReason): Promise<void> {
    if (running) return
    running = true
    try {
      await runTurn({ reason })
    } catch (error) {
      emitNervesEvent({
        level: "error",
        component: "senses",
        event: "senses.inner_dialog_worker_error",
        message: "inner dialog worker turn failed",
        meta: {
          reason,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    } finally {
      running = false
    }
  }

  async function handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== "object") return
    const maybeMessage = message as Partial<InnerDialogWorkerMessage>
    if (maybeMessage.type === "heartbeat") {
      await run("heartbeat")
      return
    }
    if (maybeMessage.type === "shutdown") {
      process.exit(0)
    }
  }

  return { run, handleMessage }
}

export async function startInnerDialogWorker(): Promise<void> {
  const worker = createInnerDialogWorker()
  process.on("message", (message) => {
    void worker.handleMessage(message)
  })
  process.on("disconnect", () => {
    process.exit(0)
  })
  await worker.run("boot")
}

