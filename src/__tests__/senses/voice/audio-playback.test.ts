import { describe, expect, it } from "vitest"
import * as os from "os"
import * as path from "path"
import { prepareVoiceCallAudio } from "../../../senses/voice/audio-playback"

describe("voice call audio playback preparation", () => {
  it("generates Twilio-ready mulaw tones", async () => {
    const prepared = await prepareVoiceCallAudio({
      source: "tone",
      label: "latency beep",
      toneHz: 880,
      durationMs: 250,
    })

    expect(prepared).toMatchObject({
      label: "latency beep",
      durationMs: 250,
      mimeType: "audio/x-mulaw;rate=8000",
    })
    expect(prepared.audio.byteLength).toBe(2000)
  })

  it("rejects local audio files outside the agent bundle or temp directory", async () => {
    await expect(prepareVoiceCallAudio({
      source: "file",
      path: path.join(os.homedir(), "outside.wav"),
    }, {
      agentRoot: path.join(os.tmpdir(), "agent.ouro"),
    })).rejects.toThrow("voice audio files must live under the agent bundle or temp directory")
  })
})
