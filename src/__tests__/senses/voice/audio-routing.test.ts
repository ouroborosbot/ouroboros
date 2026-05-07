import { describe, expect, it, vi } from "vitest"
import { inspectVoiceAudioRouting } from "../../../senses/voice/audio-routing"

describe("voice audio routing readiness", () => {
  it("marks the local BlackHole/Multi-Output shape ready when both devices are present", async () => {
    const runner = vi.fn(async (_command: string, args: string[]) => {
      if (args.includes("-a")) {
        return { stdout: "MacBook Pro Speakers\nBlackHole 2ch\nMulti-Output Device\n" }
      }
      return { stdout: "BlackHole 2ch\n" }
    })

    const result = await inspectVoiceAudioRouting({ commandRunner: runner, switchAudioSourcePath: "/opt/SwitchAudioSource" })

    expect(runner).toHaveBeenCalledWith("/opt/SwitchAudioSource", ["-a"], { timeoutMs: 5_000 })
    expect(runner).toHaveBeenCalledWith("/opt/SwitchAudioSource", ["-c"], { timeoutMs: 5_000 })
    expect(result).toMatchObject({
      status: "ready",
      hasCaptureDevice: true,
      hasOutputDevice: true,
      currentOutput: "BlackHole 2ch",
      missing: [],
    })
  })

  it("returns setup guidance when required routing devices are missing", async () => {
    const result = await inspectVoiceAudioRouting({
      commandRunner: async () => ({ stdout: "MacBook Pro Speakers\n" }),
    })

    expect(result).toMatchObject({
      status: "needs_setup",
      hasCaptureDevice: false,
      hasOutputDevice: false,
      missing: ["BlackHole 2ch", "Multi-Output Device"],
    })
    expect(result.guidance.join("\n")).toContain("BlackHole 2ch")
    expect(result.guidance.join("\n")).toContain("Multi-Output Device")
  })

  it("reports command failures without pretending routing is ready", async () => {
    const result = await inspectVoiceAudioRouting({
      commandRunner: async () => ({ exitCode: 1, stderr: "SwitchAudioSource missing" }),
    })

    expect(result).toMatchObject({
      status: "unknown",
      missing: ["BlackHole 2ch", "Multi-Output Device"],
      error: "SwitchAudioSource missing",
    })
  })
})
