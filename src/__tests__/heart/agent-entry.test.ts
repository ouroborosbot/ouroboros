import { afterEach, describe, expect, it, vi } from "vitest"

describe("agent entrypoint", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("starts unified agent runtime when --agent is present", async () => {
    vi.resetModules()

    const startInnerDialogWorker = vi.fn(async () => undefined)
    const configureCliRuntimeLogger = vi.fn()
    vi.doMock("../../senses/inner-dialog-worker", () => ({ startInnerDialogWorker }))
    vi.doMock("../../senses/cli-logging", () => ({ configureCliRuntimeLogger }))

    const argvSpy = vi.spyOn(process, "argv", "get").mockReturnValue([
      "node",
      "agent-entry.js",
      "--agent",
      "slugger",
    ])

    await import("../../heart/agent-entry")
    await Promise.resolve()

    expect(configureCliRuntimeLogger).toHaveBeenCalledWith("self")
    expect(startInnerDialogWorker).toHaveBeenCalledTimes(1)
    argvSpy.mockRestore()
  })

  it("fails fast when --agent is missing", async () => {
    vi.resetModules()

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`)
    }) as never)
    const argvSpy = vi.spyOn(process, "argv", "get").mockReturnValue(["node", "agent-entry.js"])

    await expect(import("../../heart/agent-entry")).rejects.toThrow("exit:1")
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Missing required --agent"),
    )

    argvSpy.mockRestore()
    exitSpy.mockRestore()
    consoleError.mockRestore()
  })
})
