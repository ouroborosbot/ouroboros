import { describe, expect, it, vi } from "vitest"
import {
  createWhisperCppTranscriber,
  parseWhisperCppTranscriptJson,
} from "../../../senses/voice/whisper"

describe("Whisper.cpp voice transcriber", () => {
  it("runs whisper-cli with explicit model/audio/output paths and parses segment JSON", async () => {
    const processRunner = vi.fn(async () => ({ stdout: "", stderr: "" }))
    const readFile = vi.fn(async () => JSON.stringify({
      transcription: [
        { text: " Hello " },
        { text: "from voice. " },
      ],
    }))
    const removeDir = vi.fn(async () => undefined)

    const transcriber = createWhisperCppTranscriber({
      whisperCliPath: "/opt/whisper/bin/whisper-cli",
      modelPath: "/models/ggml-base.en.bin",
      processRunner,
      readFile,
      makeTempDir: async () => "/tmp/ouro-voice-whisper",
      removeDir,
    })

    const result = await transcriber.transcribe({
      utteranceId: "utt_002",
      audioPath: "/tmp/input.wav",
      language: "en",
    })

    expect(processRunner).toHaveBeenCalledWith(
      "/opt/whisper/bin/whisper-cli",
      ["-m", "/models/ggml-base.en.bin", "-f", "/tmp/input.wav", "-oj", "-of", "/tmp/ouro-voice-whisper/transcript", "-l", "en"],
      { timeoutMs: 120_000 },
    )
    expect(readFile).toHaveBeenCalledWith("/tmp/ouro-voice-whisper/transcript.json", "utf8")
    expect(removeDir).toHaveBeenCalledWith("/tmp/ouro-voice-whisper")
    expect(result).toMatchObject({
      utteranceId: "utt_002",
      text: "Hello from voice.",
      audioPath: "/tmp/input.wav",
      source: "whisper.cpp",
      language: "en",
    })
  })

  it("parses top-level text output from whisper.cpp JSON", () => {
    expect(parseWhisperCppTranscriptJson(JSON.stringify({ text: "  one clean sentence.  " }))).toBe("one clean sentence.")
  })

  it("rejects invalid JSON and empty transcripts with useful errors", () => {
    expect(() => parseWhisperCppTranscriptJson("{not-json")).toThrow("invalid whisper.cpp JSON")
    expect(() => parseWhisperCppTranscriptJson(JSON.stringify({ transcription: [{ text: " " }] }))).toThrow("empty whisper.cpp transcript")
  })

  it("wraps process failures with command context", async () => {
    const transcriber = createWhisperCppTranscriber({
      whisperCliPath: "/opt/whisper-cli",
      modelPath: "/models/model.bin",
      processRunner: async () => {
        throw new Error("exit 1")
      },
      readFile: async () => "{}",
      makeTempDir: async () => "/tmp/ouro-voice-fail",
      removeDir: async () => undefined,
    })

    await expect(transcriber.transcribe({
      utteranceId: "utt_fail",
      audioPath: "/tmp/input.wav",
    })).rejects.toThrow("whisper.cpp transcription failed: exit 1")
  })
})
