import { afterEach, describe, expect, it, vi } from "vitest"

describe("nerves/runtime-hardening cli-main", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("invokes runRuntimeHardeningCli with argv args and exits with returned code", async () => {
    const runRuntimeHardeningCli = vi.fn(() => 9)
    vi.doMock("../../nerves/runtime-hardening/cli", () => ({
      runRuntimeHardeningCli,
    }))

    const originalArgv = process.argv
    process.argv = ["node", "cli-main", "--run-dir", "/tmp/run"]

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never)

    await import("../../nerves/runtime-hardening/cli-main")

    expect(runRuntimeHardeningCli).toHaveBeenCalledWith(["--run-dir", "/tmp/run"])
    expect(exitSpy).toHaveBeenCalledWith(9)

    process.argv = originalArgv
  })
})
