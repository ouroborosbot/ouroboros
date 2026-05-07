import { describe, expect, it } from "vitest"
import { createElevenLabsTtsClient } from "../../../senses/voice/elevenlabs"

type Handler = (payload?: unknown) => void

class FakeSocket {
  readonly sent: string[] = []
  private handlers: Record<string, Handler[]> = {}

  on(event: "open" | "message" | "error" | "close", handler: Handler): void {
    this.handlers[event] = [...(this.handlers[event] ?? []), handler]
  }

  send(payload: string): void {
    this.sent.push(payload)
  }

  close(): void {
    this.emit("close")
  }

  emit(event: "open" | "message" | "error" | "close", payload?: unknown): void {
    for (const handler of this.handlers[event] ?? []) {
      handler(payload)
    }
  }
}

describe("ElevenLabs streaming TTS client", () => {
  it("opens the low-latency stream URL, sends text chunks, and collects audio bytes", async () => {
    const socket = new FakeSocket()
    const urls: string[] = []
    const client = createElevenLabsTtsClient({
      apiKey: "eleven-secret",
      voiceId: "voice_123",
      socketFactory: (url) => {
        urls.push(url)
        return socket
      },
    })

    const resultPromise = client.synthesize({
      utteranceId: "utt_tts",
      text: "Hello there. General Kenobi.",
    })

    socket.emit("open")
    socket.emit("message", JSON.stringify({ audio: Buffer.from("abc").toString("base64") }))
    socket.emit("message", JSON.stringify({ audio: Buffer.from("def").toString("base64"), isFinal: true }))

    const result = await resultPromise

    expect(urls).toEqual([
      "wss://api.elevenlabs.io/v1/text-to-speech/voice_123/stream-input?model_id=eleven_flash_v2_5&output_format=pcm_16000",
    ])
    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      expect.objectContaining({ text: " ", xi_api_key: "eleven-secret" }),
      { text: "Hello there. General Kenobi.", try_trigger_generation: true },
      { text: "" },
    ])
    expect(result).toMatchObject({
      utteranceId: "utt_tts",
      modelId: "eleven_flash_v2_5",
      voiceId: "voice_123",
      chunkCount: 2,
      byteLength: 6,
      mimeType: "audio/pcm;rate=16000",
    })
    expect(Buffer.from(result.audio).toString()).toBe("abcdef")
  })

  it("rejects empty text before opening a socket", async () => {
    const client = createElevenLabsTtsClient({
      apiKey: "eleven-secret",
      voiceId: "voice_123",
      socketFactory: () => new FakeSocket(),
    })

    await expect(client.synthesize({
      utteranceId: "utt_empty_tts",
      text: "   ",
    })).rejects.toThrow("voice TTS text is empty")
  })

  it("surfaces socket errors without printing secrets", async () => {
    const socket = new FakeSocket()
    const client = createElevenLabsTtsClient({
      apiKey: "eleven-secret",
      voiceId: "voice_123",
      socketFactory: () => socket,
    })

    const resultPromise = client.synthesize({
      utteranceId: "utt_tts_error",
      text: "Hello",
    })

    socket.emit("open")
    socket.emit("error", new Error("websocket failed"))

    await expect(resultPromise).rejects.toThrow("ElevenLabs TTS failed: websocket failed")
  })
})
