import { describe, expect, it, vi } from "vitest"

import { runOuroBotWrapper } from "../../daemon/ouro-bot-wrapper"

describe("ouro.bot wrapper", () => {
  it("delegates args to canonical @ouro.bot/cli runner when available", async () => {
    const canonicalRunCli = vi.fn(async () => "wrapped-ok")
    const loadCanonicalRunner = vi.fn(async () => canonicalRunCli)
    const fallbackRunCli = vi.fn(async () => "fallback")
    const writeStdout = vi.fn()

    const result = await runOuroBotWrapper(["hatch"], {
      loadCanonicalRunner,
      fallbackRunCli,
      writeStdout,
    })

    expect(loadCanonicalRunner).toHaveBeenCalledTimes(1)
    expect(canonicalRunCli).toHaveBeenCalledWith(["hatch"])
    expect(fallbackRunCli).not.toHaveBeenCalled()
    expect(writeStdout).toHaveBeenCalledWith("wrapped-ok")
    expect(result).toBe("wrapped-ok")
  })

  it("falls back to local CLI runner when canonical package load fails", async () => {
    const loadCanonicalRunner = vi.fn(async () => {
      throw new Error("module not found")
    })
    const fallbackRunCli = vi.fn(async () => "fallback-ok")
    const writeStdout = vi.fn()

    const result = await runOuroBotWrapper(["status"], {
      loadCanonicalRunner,
      fallbackRunCli,
      writeStdout,
    })

    expect(fallbackRunCli).toHaveBeenCalledWith(["status"])
    expect(writeStdout).toHaveBeenCalledWith("fallback-ok")
    expect(result).toBe("fallback-ok")
  })

  it("does not write stdout when the delegated command returns an empty message", async () => {
    const canonicalRunCli = vi.fn(async () => "")
    const writeStdout = vi.fn()

    const result = await runOuroBotWrapper([], {
      loadCanonicalRunner: vi.fn(async () => canonicalRunCli),
      fallbackRunCli: vi.fn(async () => "unused"),
      writeStdout,
    })

    expect(result).toBe("")
    expect(writeStdout).not.toHaveBeenCalled()
  })
})
