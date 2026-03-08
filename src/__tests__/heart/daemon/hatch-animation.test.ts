import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"

describe("playHatchAnimation", () => {
  it("writes egg emoji, then snake emoji with hatchling name", async () => {
    const { playHatchAnimation } = await import("../../../heart/daemon/hatch-animation")
    const chunks: string[] = []
    const writer = (text: string) => { chunks.push(text) }

    await playHatchAnimation("Slugger", writer)

    const output = chunks.join("")
    expect(output).toContain("\uD83E\uDD5A") // egg emoji
    expect(output).toContain("\uD83D\uDC0D") // snake emoji
    expect(output).toContain("Slugger")
  })

  it("custom writer receives all output chunks", async () => {
    const { playHatchAnimation } = await import("../../../heart/daemon/hatch-animation")
    const writer = vi.fn()

    await playHatchAnimation("TestBot", writer)

    expect(writer).toHaveBeenCalled()
    expect(writer.mock.calls.length).toBeGreaterThan(1) // multiple chunks
  })

  it("uses process.stderr.write as default writer", async () => {
    const { playHatchAnimation } = await import("../../../heart/daemon/hatch-animation")
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    try {
      await playHatchAnimation("DefaultWriter")

      expect(stderrSpy).toHaveBeenCalled()
      const allText = stderrSpy.mock.calls.map((c) => c[0]).join("")
      expect(allText).toContain("DefaultWriter")
    } finally {
      stderrSpy.mockRestore()
    }
  })

  it("output contains the hatchling name", async () => {
    const { playHatchAnimation } = await import("../../../heart/daemon/hatch-animation")
    const chunks: string[] = []
    const writer = (text: string) => { chunks.push(text) }

    await playHatchAnimation("MyAgent", writer)

    const output = chunks.join("")
    expect(output).toContain("MyAgent")
  })
})
