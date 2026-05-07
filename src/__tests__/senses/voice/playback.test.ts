import { describe, expect, it, vi } from "vitest"
import { writeVoicePlaybackArtifact } from "../../../senses/voice/playback"
import type { VoiceTtsDelivery } from "../../../senses/voice/turn"

const delivered: VoiceTtsDelivery = {
  status: "delivered",
  audio: Buffer.from("mp3 audio"),
  byteLength: 9,
  chunkCount: 1,
  mimeType: "audio/mpeg",
  modelId: "eleven_flash_v2_5",
  voiceId: "voice_123",
}

describe("voice playback artifacts", () => {
  it("writes delivered TTS audio to a stable artifact path without invoking playback by default", async () => {
    const mkdir = vi.fn(async () => undefined)
    const writeFile = vi.fn(async () => undefined)
    const commandRunner = vi.fn(async () => ({ exitCode: 0 }))

    const result = await writeVoicePlaybackArtifact({
      utteranceId: "utt playback",
      delivery: delivered,
      outputDir: "/tmp/voice-artifacts",
      mkdir,
      writeFile,
      commandRunner,
    })

    expect(mkdir).toHaveBeenCalledWith("/tmp/voice-artifacts", { recursive: true })
    expect(writeFile).toHaveBeenCalledWith("/tmp/voice-artifacts/utt-playback.mp3", delivered.audio)
    expect(commandRunner).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: "written",
      audioPath: "/tmp/voice-artifacts/utt-playback.mp3",
      byteLength: 9,
      playbackAttempted: false,
    })
  })

  it("can invoke afplay for a written artifact", async () => {
    const commandRunner = vi.fn(async () => ({ exitCode: 0 }))

    const result = await writeVoicePlaybackArtifact({
      utteranceId: "utt_play",
      delivery: delivered,
      outputDir: "/tmp/voice-artifacts",
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      commandRunner,
      playAudio: true,
      playbackCommandPath: "/usr/bin/afplay",
    })

    expect(commandRunner).toHaveBeenCalledWith("/usr/bin/afplay", ["/tmp/voice-artifacts/utt-play.mp3"], { timeoutMs: 30_000 })
    expect(result).toMatchObject({ status: "played", playbackAttempted: true })
  })

  it("returns failure metadata when playback command fails after writing the artifact", async () => {
    const result = await writeVoicePlaybackArtifact({
      utteranceId: "utt_fail",
      delivery: delivered,
      outputDir: "/tmp/voice-artifacts",
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      commandRunner: async () => ({ exitCode: 2, stderr: "no device" }),
      playAudio: true,
    })

    expect(result).toMatchObject({
      status: "failed",
      audioPath: "/tmp/voice-artifacts/utt-fail.mp3",
      error: "exit 2: no device",
      playbackAttempted: true,
    })
  })
})
