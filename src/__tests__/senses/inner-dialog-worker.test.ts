import { describe, expect, it, vi } from "vitest"

const mockRunInnerDialogTurn = vi.fn()
const mockEmitNervesEvent = vi.fn()

vi.mock("../../senses/inner-dialog", () => ({
  runInnerDialogTurn: (...args: any[]) => mockRunInnerDialogTurn(...args),
}))

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: (...args: any[]) => mockEmitNervesEvent(...args),
}))

import { createInnerDialogWorker, startInnerDialogWorker } from "../../senses/inner-dialog-worker"

describe("inner-dialog-worker", () => {
  it("runs boot/heartbeat cycles and ignores unknown messages", async () => {
    const runTurn = vi.fn().mockResolvedValue(undefined)
    const worker = createInnerDialogWorker(runTurn)

    await worker.run("boot")
    await worker.handleMessage({ type: "heartbeat" })
    await worker.handleMessage({ type: "unknown" })
    await worker.handleMessage(null)

    expect(runTurn).toHaveBeenCalledTimes(2)
    expect(runTurn).toHaveBeenNthCalledWith(1, { reason: "boot" })
    expect(runTurn).toHaveBeenNthCalledWith(2, { reason: "heartbeat" })
  })

  it("emits an error event when a turn fails", async () => {
    const runTurn = vi.fn().mockRejectedValue(new Error("explode"))
    const worker = createInnerDialogWorker(runTurn)

    await worker.run("heartbeat")

    expect(mockEmitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "senses.inner_dialog_worker_error",
      }),
    )
  })

  it("stringifies non-Error failures in worker error metadata", async () => {
    mockEmitNervesEvent.mockReset()
    const runTurn = vi.fn().mockRejectedValue("explode-string")
    const worker = createInnerDialogWorker(runTurn)

    await worker.run("heartbeat")

    expect(mockEmitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ error: "explode-string" }),
      }),
    )
  })

  it("handles shutdown messages by exiting the process", async () => {
    const worker = createInnerDialogWorker(vi.fn().mockResolvedValue(undefined))
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as any)
    try {
      await expect(worker.handleMessage({ type: "shutdown" })).rejects.toThrow("process.exit called")
    } finally {
      mockExit.mockRestore()
    }
  })

  it("ignores overlapping runs while a cycle is already in progress", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const runTurn = vi.fn().mockImplementation(() => gate)
    const worker = createInnerDialogWorker(runTurn)

    const first = worker.run("heartbeat")
    const second = worker.run("heartbeat")
    release()
    await Promise.all([first, second])

    expect(runTurn).toHaveBeenCalledTimes(1)
  })

  it("starts worker listeners and triggers boot + heartbeat cycle", async () => {
    mockRunInnerDialogTurn.mockReset().mockResolvedValue(undefined)
    const listeners: Record<string, (...args: any[]) => void> = {}
    const onSpy = vi.spyOn(process, "on").mockImplementation(((event: string, handler: (...args: any[]) => void) => {
      listeners[event] = handler
      return process
    }) as any)
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as any)

    try {
      await startInnerDialogWorker()
      expect(mockRunInnerDialogTurn).toHaveBeenCalledWith({ reason: "boot" })

      listeners.message?.({ type: "heartbeat" })
      await Promise.resolve()
      expect(mockRunInnerDialogTurn).toHaveBeenCalledWith({ reason: "heartbeat" })

      expect(() => listeners.disconnect?.()).toThrow("process.exit called")
    } finally {
      onSpy.mockRestore()
      mockExit.mockRestore()
    }
  })
})
