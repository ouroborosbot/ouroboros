import * as crypto from "node:crypto"
import * as fs from "fs/promises"
import * as http from "http"
import * as path from "path"
import type { Duplex } from "node:stream"
import { WebSocket, WebSocketServer, type RawData } from "ws"
import { emitNervesEvent } from "../../nerves/runtime"
import { writeVoicePlaybackArtifact } from "./playback"
import { buildVoiceTranscript } from "./transcript"
import { runVoiceLoopbackTurn, type VoiceLoopbackTurnResult, type VoiceRunSenseTurn } from "./turn"
import type { VoiceTranscript, VoiceTranscriber, VoiceTtsService } from "./types"

export const DEFAULT_TWILIO_PHONE_PORT = 18910
export const DEFAULT_TWILIO_RECORD_TIMEOUT_SECONDS = 1
export const DEFAULT_TWILIO_RECORD_MAX_LENGTH_SECONDS = 30
export const DEFAULT_TWILIO_GREETING_PREBUFFER_MS = 3_500
export const TWILIO_PHONE_WEBHOOK_BASE_PATH = "/voice/twilio"
export const DEFAULT_TWILIO_PHONE_PLAYBACK_MODE = "stream"
export const DEFAULT_TWILIO_PHONE_TRANSPORT_MODE = "record-play"
export const DEFAULT_TWILIO_MEDIA_SPEECH_RMS_THRESHOLD = 650
export const DEFAULT_TWILIO_MEDIA_SILENCE_END_MS = 650
export const DEFAULT_TWILIO_MEDIA_MIN_SPEECH_MS = 160
export const DEFAULT_TWILIO_MEDIA_MAX_UTTERANCE_MS = 15_000

const TWILIO_STREAM_FAILURE_SILENCE_MP3 = Buffer.from(
  "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYyLjMuMTAwAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAsAAAUuADc3Nzc3Nzc3N0tLS0tLS0tLS19fX19fX19fX3Nzc3Nzc3Nzc4eHh4eHh4eHh5ubm5ubm5ubm6+vr6+vr6+vr8PDw8PDw8PDw9fX19fX19fX1+vr6+vr6+vr6////////////wAAAABMYXZjNjIuMTEAAAAAAAAAAAAAAAAkBC8AAAAAAAAFLpJQTFMAAAAAAP/7EMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVV//sQxCmDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVX/+xDEUwPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVf/7EMR8g8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVV//sQxKYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVX/+xDEz4PAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMTWA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxNYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xDE1gPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMTWA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxNYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=",
  "base64",
)

export type TwilioPhonePlaybackMode = "stream" | "buffered"
export type TwilioPhoneTransportMode = "record-play" | "media-stream"

export interface TwilioSignatureInput {
  authToken: string
  url: string
  params: Record<string, string>
}

export interface TwilioPhoneBridgeRequest {
  method: string
  path: string
  headers: Record<string, string | string[] | undefined>
  body?: string | Uint8Array
}

export interface TwilioPhoneBridgeResponse {
  statusCode: number
  headers: Record<string, string>
  body: string | Uint8Array | AsyncIterable<Uint8Array>
}

export interface TwilioRecordingDownloadRequest {
  recordingUrl: string
  accountSid?: string
  authToken?: string
}

export type TwilioRecordingDownloader = (request: TwilioRecordingDownloadRequest) => Promise<Uint8Array>

export interface TwilioPhoneBridgeOptions {
  agentName: string
  publicBaseUrl: string
  outputDir: string
  basePath?: string
  transcriber: VoiceTranscriber
  tts: VoiceTtsService
  runSenseTurn?: VoiceRunSenseTurn
  twilioAccountSid?: string
  twilioAuthToken?: string
  defaultFriendId?: string
  recordTimeoutSeconds?: number
  recordMaxLengthSeconds?: number
  greetingPrebufferMs?: number
  transportMode?: TwilioPhoneTransportMode
  mediaSpeechRmsThreshold?: number
  mediaSilenceEndMs?: number
  mediaMinSpeechMs?: number
  mediaMaxUtteranceMs?: number
  downloadRecording?: TwilioRecordingDownloader
  playbackMode?: TwilioPhonePlaybackMode
}

export interface TwilioPhoneBridge {
  handle(request: TwilioPhoneBridgeRequest): Promise<TwilioPhoneBridgeResponse>
  handleUpgrade?(request: http.IncomingMessage, socket: Duplex, head: Buffer): boolean
  close?(): Promise<void>
}

export interface TwilioPhoneBridgeServer {
  bridge: TwilioPhoneBridge
  server: http.Server
  localUrl: string
}

export interface StartTwilioPhoneBridgeServerOptions extends TwilioPhoneBridgeOptions {
  port?: number
  host?: string
}

interface RecordingCallbackParams {
  callSid: string
  recordingSid: string
  recordingUrl: string
  from: string
  to: string
}

function bodyText(body: string | Uint8Array | undefined): string {
  if (body === undefined) return ""
  if (typeof body === "string") return body
  return Buffer.from(body).toString("utf8")
}

function formParams(rawBody: string): Record<string, string> {
  const parsed = new URLSearchParams(rawBody)
  const params: Record<string, string> = {}
  for (const [key, value] of parsed) {
    params[key] = value
  }
  return params
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) continue
    if (Array.isArray(value)) return value[0] ?? ""
    return value ?? ""
  }
  return ""
}

function xmlResponse(body: string): TwilioPhoneBridgeResponse {
  return {
    statusCode: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
    body: `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
  }
}

function textResponse(statusCode: number, body: string): TwilioPhoneBridgeResponse {
  return {
    statusCode,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body,
  }
}

function binaryResponse(body: Uint8Array, contentType: string): TwilioPhoneBridgeResponse {
  return {
    statusCode: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=300",
    },
    body,
  }
}

function streamResponse(body: AsyncIterable<Uint8Array>, contentType: string): TwilioPhoneBridgeResponse {
  return {
    statusCode: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
    body,
  }
}

function isAsyncIterableBody(body: TwilioPhoneBridgeResponse["body"]): body is AsyncIterable<Uint8Array> {
  return typeof body === "object"
    && body !== null
    && Symbol.asyncIterator in body
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function routeUrl(publicBaseUrl: string, route: string): string {
  return new URL(route, publicBaseUrl).toString()
}

export function normalizeTwilioPhoneBasePath(value: string | undefined = TWILIO_PHONE_WEBHOOK_BASE_PATH): string {
  const trimmed = value.trim()
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "")
  if (!withoutTrailingSlash || withoutTrailingSlash === "/") {
    throw new Error("Twilio phone webhook base path is empty")
  }
  if (!/^\/[A-Za-z0-9._~/-]+$/.test(withoutTrailingSlash) || withoutTrailingSlash.includes("//")) {
    throw new Error(`invalid Twilio phone webhook base path: ${value}`)
  }
  return withoutTrailingSlash
}

export function normalizeTwilioPhonePlaybackMode(value: string | undefined): TwilioPhonePlaybackMode {
  const normalized = (value ?? DEFAULT_TWILIO_PHONE_PLAYBACK_MODE).trim().toLowerCase()
  if (normalized === "stream" || normalized === "buffered") return normalized
  throw new Error(`invalid Twilio phone playback mode: ${value}`)
}

export function normalizeTwilioPhoneTransportMode(value: string | undefined): TwilioPhoneTransportMode {
  const normalized = (value ?? DEFAULT_TWILIO_PHONE_TRANSPORT_MODE).trim().toLowerCase()
  if (normalized === "record-play" || normalized === "media-stream") return normalized
  throw new Error(`invalid Twilio phone transport mode: ${value}`)
}

export function twilioPhoneWebhookUrl(
  publicBaseUrl: string,
  basePath: string | undefined = TWILIO_PHONE_WEBHOOK_BASE_PATH,
): string {
  return routeUrl(publicBaseUrl, `${normalizeTwilioPhoneBasePath(basePath)}/incoming`)
}

function requestPublicUrl(publicBaseUrl: string, requestPath: string): string {
  return routeUrl(publicBaseUrl, requestPath)
}

function recordTwiml(options: {
  publicBaseUrl: string
  basePath: string
  timeoutSeconds: number
  maxLengthSeconds: number
}): string {
  return `<Record action="${escapeXml(routeUrl(options.publicBaseUrl, `${options.basePath}/recording`))}" method="POST" playBeep="false" timeout="${options.timeoutSeconds}" maxLength="${options.maxLengthSeconds}" trim="trim-silence" />`
}

function redirectTwiml(publicBaseUrl: string, basePath: string): string {
  return `<Redirect method="POST">${escapeXml(routeUrl(publicBaseUrl, `${basePath}/listen`))}</Redirect>`
}

function sayTwiml(message: string): string {
  return `<Say>${escapeXml(message)}</Say>`
}

function playTwiml(url: string): string {
  return `<Play>${escapeXml(url)}</Play>`
}

function parameterTwiml(name: string, value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return ""
  return `<Parameter name="${escapeXml(name)}" value="${escapeXml(trimmed)}" />`
}

function websocketRouteUrl(publicBaseUrl: string, route: string): string {
  const url = new URL(route, publicBaseUrl)
  if (url.protocol !== "https:") {
    throw new Error("Twilio Media Streams require an https public voice URL")
  }
  url.protocol = "wss:"
  return url.toString()
}

function mediaStreamTwiml(
  options: TwilioPhoneBridgeOptions,
  basePath: string,
  params: Record<string, string>,
  greetingJobId?: string,
): string {
  const streamUrl = websocketRouteUrl(options.publicBaseUrl, `${basePath}/media-stream`)
  return [
    `<Connect><Stream url="${escapeXml(streamUrl)}">`,
    parameterTwiml("From", params.From),
    parameterTwiml("To", params.To),
    parameterTwiml("Agent", options.agentName),
    parameterTwiml("GreetingJobId", greetingJobId),
    `</Stream></Connect>`,
  ].join("")
}

function safeSegment(input: string): string {
  const cleaned = input.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return cleaned || "unknown"
}

function decodeSafeSegment(input: string): string | null {
  try {
    const decoded = decodeURIComponent(input)
    if (!/^[A-Za-z0-9._-]+$/.test(decoded)) return null
    if (decoded === "." || decoded === "..") return null
    return decoded
  } catch {
    return null
  }
}

function contentTypeForAudio(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  if (ext === ".mp3") return "audio/mpeg"
  if (ext === ".wav") return "audio/wav"
  if (ext === ".pcm") return "audio/pcm"
  return "application/octet-stream"
}

function friendIdFromCaller(from: string, callSid: string): string {
  const phoneish = from.replace(/[^0-9A-Za-z]+/g, "")
  return phoneish ? `twilio-${phoneish}` : `twilio-${safeSegment(callSid)}`
}

function voiceFriendId(options: TwilioPhoneBridgeOptions, from: string, callSid: string): string {
  return options.defaultFriendId?.trim() || friendIdFromCaller(from, callSid)
}

function phoneIdentitySegment(input: string): string {
  const phoneish = input.replace(/[^0-9A-Za-z]+/g, "")
  return phoneish || safeSegment(input)
}

export function twilioPhoneVoiceSessionKey(options: {
  defaultFriendId?: string
  from?: string
  to?: string
  callSid?: string
}): string {
  const friendSegment = options.defaultFriendId?.trim()
    ? safeSegment(options.defaultFriendId)
    : options.from?.trim()
      ? phoneIdentitySegment(options.from)
      : ""
  const lineSegment = options.to?.trim() ? phoneIdentitySegment(options.to) : ""
  if (friendSegment && lineSegment) return `twilio-phone-${friendSegment}-via-${lineSegment}`
  if (friendSegment) return `twilio-phone-${friendSegment}`
  if (lineSegment) return `twilio-phone-line-${lineSegment}`
  return `twilio-phone-${safeSegment(options.callSid ?? "incoming")}`
}

function callConnectedPrompt(params: Record<string, string>): string {
  const from = params.From?.trim()
  const to = params.To?.trim()
  return [
    "A Twilio phone voice call just connected.",
    "This is the first audible turn in the call.",
    from ? `Twilio caller ID: ${from}.` : "Twilio did not provide caller ID.",
    to ? `Dialed line: ${to}.` : "Twilio did not provide the dialed line.",
    "Respond through the voice channel as yourself. Greet the caller naturally and briefly, then invite them to speak.",
  ].join("\n")
}

function noSpeechPrompt(): string {
  return [
    "The last Twilio phone recording contained no intelligible speech.",
    "The caller is still on the line.",
    "Respond through the voice channel as yourself. Briefly ask them to try again or check whether they are there.",
  ].join("\n")
}

function isNoSpeechTranscript(text: string): boolean {
  const normalized = text.trim().replace(/[.!?]+$/g, "").toUpperCase()
  return normalized === "[BLANK_AUDIO]"
    || normalized === "BLANK_AUDIO"
    || normalized === "[NO_SPEECH]"
    || normalized === "NO_SPEECH"
}

function isNoSpeechTranscriptionError(error: unknown): boolean {
  const normalized = errorMessage(error).toLowerCase()
  return normalized.includes("empty whisper.cpp transcript")
    || normalized.includes("voice transcript text is empty")
}

function buildNoSpeechTranscript(utteranceId: string): VoiceTranscript {
  return buildVoiceTranscript({
    utteranceId: `${utteranceId}-nospeech`,
    text: noSpeechPrompt(),
    source: "loopback",
  })
}

interface TwilioMediaStreamStart {
  streamSid?: unknown
  callSid?: unknown
  customParameters?: unknown
}

interface TwilioMediaPayload {
  payload?: unknown
}

interface TwilioMediaMark {
  name?: unknown
}

interface TwilioMediaStreamMessage {
  event?: unknown
  streamSid?: unknown
  start?: TwilioMediaStreamStart
  media?: TwilioMediaPayload
  mark?: TwilioMediaMark
}

function parseTwilioMediaStreamMessage(raw: RawData): TwilioMediaStreamMessage | null {
  const text = Buffer.isBuffer(raw)
    ? raw.toString("utf8")
    : Array.isArray(raw)
      ? Buffer.concat(raw).toString("utf8")
      : Buffer.from(raw as ArrayBuffer).toString("utf8")
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === "object" ? parsed as TwilioMediaStreamMessage : null
  } catch {
    return null
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function customParameter(start: TwilioMediaStreamStart | undefined, name: string): string {
  const params = start?.customParameters
  if (!params || typeof params !== "object" || Array.isArray(params)) return ""
  return stringField((params as Record<string, unknown>)[name])
}

function mulawByteToPcm16(value: number): number {
  const decoded = (~value) & 0xff
  let sample = ((decoded & 0x0f) << 3) + 0x84
  sample <<= (decoded & 0x70) >> 4
  return (decoded & 0x80) ? 0x84 - sample : sample - 0x84
}

function mulawFrameRms(frame: Uint8Array): number {
  if (frame.byteLength === 0) return 0
  let sumSquares = 0
  for (const byte of frame) {
    const sample = mulawByteToPcm16(byte)
    sumSquares += sample * sample
  }
  return Math.sqrt(sumSquares / frame.byteLength)
}

function pcm16WavHeader(dataByteLength: number, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + dataByteLength, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataByteLength, 40)
  return header
}

function mulawFramesToPcm16Wav(frames: Uint8Array[], sampleRate = 16_000): Buffer {
  const sampleCount = frames.reduce((sum, frame) => sum + frame.byteLength, 0) * 2
  const pcm = Buffer.alloc(sampleCount * 2)
  let offset = 0
  for (const frame of frames) {
    for (const byte of frame) {
      const sample = mulawByteToPcm16(byte)
      pcm.writeInt16LE(sample, offset)
      offset += 2
      pcm.writeInt16LE(sample, offset)
      offset += 2
    }
  }
  return Buffer.concat([pcm16WavHeader(pcm.byteLength, sampleRate), pcm])
}

function frameLimitForMs(ms: number, frameMs = 20): number {
  return Math.max(1, Math.ceil(ms / frameMs))
}

async function transcribeRecordingOrNoSpeech(options: {
  transcriber: VoiceTranscriber
  utteranceId: string
  inputPath: string
}): Promise<VoiceTranscript> {
  try {
    const transcript = await options.transcriber.transcribe({
      utteranceId: options.utteranceId,
      audioPath: options.inputPath,
    })
    return isNoSpeechTranscript(transcript.text)
      ? buildNoSpeechTranscript(options.utteranceId)
      : transcript
  } catch (error) {
    if (isNoSpeechTranscriptionError(error)) {
      return buildNoSpeechTranscript(options.utteranceId)
    }
    throw error
  }
}

interface TwilioMediaStreamUtterance {
  utteranceId: string
  frames: Buffer[]
  wasBargeIn: boolean
}

class TwilioMediaStreamSession {
  private streamSid = ""
  private callSid = "media-stream"
  private from = ""
  private to = ""
  private friendId = ""
  private sessionKey = ""
  private callDir = ""
  private utteranceIndex = 0
  private playbackGeneration = 0
  private playbackActive = false
  private closed = false
  private inSpeech = false
  private currentFrames: Buffer[] = []
  private preRollFrames: Buffer[] = []
  private currentVoicedFrames = 0
  private currentSilenceFrames = 0
  private currentWasBargeIn = false
  private turnQueue: Promise<void> = Promise.resolve()
  private readonly playbackBytesByGeneration = new Map<number, number>()
  private readonly speechRmsThreshold: number
  private readonly preRollLimitFrames = frameLimitForMs(200)
  private readonly silenceEndFrames: number
  private readonly minSpeechFrames: number
  private readonly maxUtteranceFrames: number

  constructor(
    private readonly ws: WebSocket,
    private readonly options: TwilioPhoneBridgeOptions,
    private readonly mediaGreetingJobs: TwilioAudioStreamJobStore,
  ) {
    this.speechRmsThreshold = options.mediaSpeechRmsThreshold ?? DEFAULT_TWILIO_MEDIA_SPEECH_RMS_THRESHOLD
    this.silenceEndFrames = frameLimitForMs(options.mediaSilenceEndMs ?? DEFAULT_TWILIO_MEDIA_SILENCE_END_MS)
    this.minSpeechFrames = frameLimitForMs(options.mediaMinSpeechMs ?? DEFAULT_TWILIO_MEDIA_MIN_SPEECH_MS)
    this.maxUtteranceFrames = frameLimitForMs(options.mediaMaxUtteranceMs ?? DEFAULT_TWILIO_MEDIA_MAX_UTTERANCE_MS)
  }

  attach(): void {
    this.ws.on("message", (raw) => this.handleRawMessage(raw))
    this.ws.on("close", () => this.close())
    this.ws.on("error", (error) => {
      emitNervesEvent({
        level: "error",
        component: "senses",
        event: "senses.voice_twilio_media_socket_error",
        message: "Twilio Media Stream socket failed",
        meta: { agentName: this.options.agentName, callSid: safeSegment(this.callSid), error: errorMessage(error) },
      })
    })
  }

  private handleRawMessage(raw: RawData): void {
    const message = parseTwilioMediaStreamMessage(raw)
    if (!message) {
      emitNervesEvent({
        level: "warn",
        component: "senses",
        event: "senses.voice_twilio_media_message_rejected",
        message: "Twilio Media Stream message was not valid JSON",
        meta: { agentName: this.options.agentName, callSid: safeSegment(this.callSid) },
      })
      return
    }

    const event = stringField(message.event)
    if (event === "start") {
      void this.handleStart(message.start)
      return
    }
    if (event === "media") {
      this.handleMedia(message.media)
      return
    }
    if (event === "mark") {
      this.handleMark(message.mark)
      return
    }
    if (event === "stop") {
      this.close()
    }
  }

  private async handleStart(start: TwilioMediaStreamStart | undefined): Promise<void> {
    this.streamSid = stringField(start?.streamSid)
    this.callSid = stringField(start?.callSid) || this.callSid
    this.from = customParameter(start, "From")
    this.to = customParameter(start, "To")
    this.friendId = voiceFriendId(this.options, this.from, this.callSid)
    this.sessionKey = twilioPhoneVoiceSessionKey({
      defaultFriendId: this.options.defaultFriendId,
      from: this.from,
      to: this.to,
      callSid: this.callSid,
    })
    this.callDir = path.join(this.options.outputDir, safeSegment(this.callSid))
    await fs.mkdir(this.callDir, { recursive: true })

    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_media_start",
      message: "Twilio Media Stream started",
      meta: {
        agentName: this.options.agentName,
        callSid: safeSegment(this.callSid),
        streamSid: safeSegment(this.streamSid || "stream"),
        sessionKey: this.sessionKey,
      },
    })

    const greetingJobId = customParameter(start, "GreetingJobId")
    const greetingJob = greetingJobId
      ? this.mediaGreetingJobs.get(safeSegment(this.callSid), greetingJobId)
      : null
    if (greetingJob) {
      this.enqueueGreetingJob(greetingJobId, greetingJob)
    } else {
      this.enqueuePrompt({
        utteranceId: `twilio-${safeSegment(this.callSid)}-connected`,
        promptText: callConnectedPrompt({ From: this.from, To: this.to }),
        wasBargeIn: false,
      })
    }
  }

  private handleMedia(media: TwilioMediaPayload | undefined): void {
    const payload = stringField(media?.payload)
    if (!payload) return
    const frame = Buffer.from(payload, "base64")
    if (frame.byteLength === 0) return
    const voiced = mulawFrameRms(frame) >= this.speechRmsThreshold
    const bargeIn = voiced && this.interruptPlayback()

    if (!this.inSpeech) {
      if (voiced) {
        this.inSpeech = true
        this.currentFrames = [...this.preRollFrames, frame]
        this.preRollFrames = []
        this.currentVoicedFrames = 1
        this.currentSilenceFrames = 0
        this.currentWasBargeIn = bargeIn
      } else {
        this.preRollFrames.push(frame)
        if (this.preRollFrames.length > this.preRollLimitFrames) {
          this.preRollFrames.shift()
        }
      }
      return
    }

    this.currentFrames.push(frame)
    if (voiced) {
      this.currentVoicedFrames += 1
      this.currentSilenceFrames = 0
      this.currentWasBargeIn = this.currentWasBargeIn || bargeIn
    } else {
      this.currentSilenceFrames += 1
    }

    if (this.currentSilenceFrames >= this.silenceEndFrames || this.currentFrames.length >= this.maxUtteranceFrames) {
      this.finishCurrentUtterance()
    }
  }

  private handleMark(mark: TwilioMediaMark | undefined): void {
    const name = stringField(mark?.name)
    if (!name || !name.startsWith(`voice-${this.playbackGeneration}-`)) return
    this.playbackActive = false
    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_media_playback_mark",
      message: "Twilio Media Stream playback mark reached",
      meta: { agentName: this.options.agentName, callSid: safeSegment(this.callSid), mark: name },
    })
  }

  private close(): void {
    if (this.closed) return
    this.closed = true
    if (this.inSpeech) this.finishCurrentUtterance()
    this.playbackGeneration += 1
    this.playbackActive = false
    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_media_stop",
      message: "Twilio Media Stream stopped",
      meta: { agentName: this.options.agentName, callSid: safeSegment(this.callSid) },
    })
  }

  private finishCurrentUtterance(): void {
    const frames = this.currentFrames
    const voicedFrames = this.currentVoicedFrames
    const wasBargeIn = this.currentWasBargeIn
    this.inSpeech = false
    this.currentFrames = []
    this.currentVoicedFrames = 0
    this.currentSilenceFrames = 0
    this.currentWasBargeIn = false

    if (voicedFrames < this.minSpeechFrames) return

    this.utteranceIndex += 1
    this.enqueueUtterance({
      utteranceId: `twilio-${safeSegment(this.callSid)}-${this.utteranceIndex}`,
      frames,
      wasBargeIn,
    })
  }

  private enqueuePrompt(input: { utteranceId: string; promptText: string; wasBargeIn: boolean }): void {
    const transcript = buildVoiceTranscript({
      utteranceId: input.utteranceId,
      text: input.promptText,
      source: "loopback",
    })
    this.enqueueTurn(transcript, input.wasBargeIn)
  }

  private enqueueUtterance(utterance: TwilioMediaStreamUtterance): void {
    this.turnQueue = this.turnQueue
      .catch(() => undefined)
      .then(() => this.processUtterance(utterance))
      .catch((error) => {
        emitNervesEvent({
          level: "error",
          component: "senses",
          event: "senses.voice_twilio_media_turn_error",
          message: "Twilio Media Stream voice turn failed",
          meta: {
            agentName: this.options.agentName,
            callSid: safeSegment(this.callSid),
            utteranceId: utterance.utteranceId,
            error: errorMessage(error),
          },
        })
      })
  }

  private enqueueGreetingJob(jobId: string, job: TwilioAudioStreamJob): void {
    this.turnQueue = this.turnQueue
      .catch(() => undefined)
      .then(() => this.streamGreetingJob(jobId, job))
      .catch((error) => {
        emitNervesEvent({
          level: "error",
          component: "senses",
          event: "senses.voice_twilio_media_turn_error",
          message: "Twilio Media Stream greeting playback failed",
          meta: {
            agentName: this.options.agentName,
            callSid: safeSegment(this.callSid),
            utteranceId: jobId,
            error: errorMessage(error),
          },
        })
      })
  }

  private enqueueTurn(transcript: VoiceTranscript, wasBargeIn: boolean): void {
    this.turnQueue = this.turnQueue
      .catch(() => undefined)
      .then(() => this.runTranscriptTurn(transcript, wasBargeIn))
      .catch((error) => {
        emitNervesEvent({
          level: "error",
          component: "senses",
          event: "senses.voice_twilio_media_turn_error",
          message: "Twilio Media Stream voice turn failed",
          meta: {
            agentName: this.options.agentName,
            callSid: safeSegment(this.callSid),
            utteranceId: transcript.utteranceId,
            error: errorMessage(error),
          },
        })
      })
  }

  private async processUtterance(utterance: TwilioMediaStreamUtterance): Promise<void> {
    await fs.mkdir(this.callDir, { recursive: true })
    const inputPath = path.join(this.callDir, `${safeSegment(utterance.utteranceId)}.wav`)
    await fs.writeFile(inputPath, mulawFramesToPcm16Wav(utterance.frames))
    const transcript = await transcribeRecordingOrNoSpeech({
      transcriber: this.options.transcriber,
      utteranceId: utterance.utteranceId,
      inputPath,
    })
    const turnTranscript = utterance.wasBargeIn
      ? buildVoiceTranscript({
          utteranceId: transcript.utteranceId,
          text: [
            "The caller spoke while my previous voice output was still playing.",
            "Treat this as an interruption or follow-up, acknowledge it first, and do not repeat the interrupted answer unless it is still useful.",
            `Caller said: ${transcript.text}`,
          ].join("\n"),
          audioPath: transcript.audioPath ?? undefined,
          language: transcript.language ?? undefined,
          source: transcript.source,
        })
      : transcript
    await this.runTranscriptTurn(turnTranscript, utterance.wasBargeIn)
  }

  private async runTranscriptTurn(transcript: VoiceTranscript, wasBargeIn: boolean): Promise<void> {
    if (this.closed || !this.streamSid) return
    const generation = this.startPlayback()
    const turn = await runVoiceLoopbackTurn({
      agentName: this.options.agentName,
      friendId: this.friendId || voiceFriendId(this.options, this.from, this.callSid),
      sessionKey: this.sessionKey || twilioPhoneVoiceSessionKey({
        defaultFriendId: this.options.defaultFriendId,
        from: this.from,
        to: this.to,
        callSid: this.callSid,
      }),
      transcript,
      tts: this.options.tts,
      runSenseTurn: this.options.runSenseTurn,
      onAudioChunk: (chunk) => this.sendAudioChunk(chunk, generation),
    })

    if (generation !== this.playbackGeneration || this.closed) return
    const deliveries = deliveredSegments(turn)
    if ((this.playbackBytesByGeneration.get(generation) ?? 0) === 0) {
      for (const delivery of deliveries) {
        this.sendAudioChunk(delivery.audio, generation)
      }
    }
    if (deliveries.length === 0) {
      this.playbackActive = false
      return
    }
    this.sendMark(generation, transcript.utteranceId)
    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_media_turn_end",
      message: "Twilio Media Stream voice turn delivered playback",
      meta: {
        agentName: this.options.agentName,
        callSid: safeSegment(this.callSid),
        utteranceId: transcript.utteranceId,
        bargeIn: String(wasBargeIn),
        segmentCount: String(turn.speechSegments.length),
      },
    })
  }

  private async streamGreetingJob(jobId: string, job: TwilioAudioStreamJob): Promise<void> {
    if (this.closed || !this.streamSid) return
    const generation = this.startPlayback()
    try {
      for await (const chunk of job.stream()) {
        if (generation !== this.playbackGeneration || this.closed) return
        this.sendAudioChunk(chunk, generation)
      }
    } catch (error) {
      if (generation === this.playbackGeneration) this.playbackActive = false
      emitNervesEvent({
        level: "error",
        component: "senses",
        event: "senses.voice_twilio_media_greeting_error",
        message: "Twilio Media Stream prebuffered greeting failed",
        meta: { agentName: this.options.agentName, callSid: safeSegment(this.callSid), utteranceId: jobId, error: errorMessage(error) },
      })
      return
    }

    if (generation !== this.playbackGeneration || this.closed) return
    if ((this.playbackBytesByGeneration.get(generation) ?? 0) === 0) {
      this.playbackActive = false
      return
    }
    this.sendMark(generation, jobId)
    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_media_greeting_end",
      message: "Twilio Media Stream prebuffered greeting delivered playback",
      meta: {
        agentName: this.options.agentName,
        callSid: safeSegment(this.callSid),
        utteranceId: jobId,
        byteLength: String(this.playbackBytesByGeneration.get(generation) ?? 0),
      },
    })
  }

  private startPlayback(): number {
    this.playbackGeneration += 1
    this.playbackActive = true
    return this.playbackGeneration
  }

  private sendAudioChunk(chunk: Uint8Array, generation: number): void {
    if (this.closed || generation !== this.playbackGeneration || !this.streamSid || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      event: "media",
      streamSid: this.streamSid,
      media: { payload: Buffer.from(chunk).toString("base64") },
    }))
    this.playbackBytesByGeneration.set(
      generation,
      (this.playbackBytesByGeneration.get(generation) ?? 0) + chunk.byteLength,
    )
  }

  private sendMark(generation: number, utteranceId: string): void {
    if (this.closed || generation !== this.playbackGeneration || !this.streamSid || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      event: "mark",
      streamSid: this.streamSid,
      mark: { name: `voice-${generation}-${safeSegment(utteranceId)}` },
    }))
  }

  private interruptPlayback(): boolean {
    if (!this.playbackActive || !this.streamSid || this.ws.readyState !== WebSocket.OPEN) return false
    this.playbackGeneration += 1
    this.playbackActive = false
    this.ws.send(JSON.stringify({ event: "clear", streamSid: this.streamSid }))
    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_media_barge_in",
      message: "caller interrupted Twilio Media Stream playback",
      meta: { agentName: this.options.agentName, callSid: safeSegment(this.callSid) },
    })
    return true
  }
}

function parseRecordingParams(params: Record<string, string>): RecordingCallbackParams | null {
  const callSid = params.CallSid?.trim()
  const recordingSid = params.RecordingSid?.trim()
  const recordingUrl = params.RecordingUrl?.trim()
  if (!callSid || !recordingSid || !recordingUrl) return null
  return {
    callSid,
    recordingSid,
    recordingUrl,
    from: params.From?.trim() ?? "",
    to: params.To?.trim() ?? "",
  }
}

function recordAgainResponse(options: TwilioPhoneBridgeOptions, basePath: string, message: string): TwilioPhoneBridgeResponse {
  return xmlResponse(`${sayTwiml(message)}${recordTwiml({
    publicBaseUrl: options.publicBaseUrl,
    basePath,
    timeoutSeconds: options.recordTimeoutSeconds ?? DEFAULT_TWILIO_RECORD_TIMEOUT_SECONDS,
    maxLengthSeconds: options.recordMaxLengthSeconds ?? DEFAULT_TWILIO_RECORD_MAX_LENGTH_SECONDS,
  })}`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function nextInputTwiml(
  options: TwilioPhoneBridgeOptions,
  basePath: string,
  mode: "record" | "redirect",
): string {
  if (mode === "redirect") return redirectTwiml(options.publicBaseUrl, basePath)
  return recordTwiml({
    publicBaseUrl: options.publicBaseUrl,
    basePath,
    timeoutSeconds: options.recordTimeoutSeconds ?? DEFAULT_TWILIO_RECORD_TIMEOUT_SECONDS,
    maxLengthSeconds: options.recordMaxLengthSeconds ?? DEFAULT_TWILIO_RECORD_MAX_LENGTH_SECONDS,
  })
}

class TwilioAudioStreamJob {
  private readonly chunks: Buffer[] = []
  private readonly waiters = new Set<() => void>()
  private status: "pending" | "completed" | "failed" = "pending"
  private failure: string | null = null
  byteLength = 0

  constructor(
    readonly callSid: string,
    readonly jobId: string,
    readonly mimeType: string,
  ) {}

  append(chunk: Uint8Array): void {
    /* v8 ignore next -- append is only called while pending with non-empty chunks in bridge flow @preserve */
    if (this.status !== "pending" || chunk.byteLength === 0) return
    const buffered = Buffer.from(chunk)
    this.chunks.push(buffered)
    this.byteLength += buffered.byteLength
    this.notify()
  }

  complete(): void {
    /* v8 ignore next -- completion is single-shot inside startTwilioPlaybackStreamJob @preserve */
    if (this.status !== "pending") return
    this.status = "completed"
    this.notify()
  }

  fail(error: unknown): void {
    /* v8 ignore next -- failure is single-shot inside startTwilioPlaybackStreamJob @preserve */
    if (this.status !== "pending") return
    if (this.byteLength === 0) {
      this.append(TWILIO_STREAM_FAILURE_SILENCE_MP3)
    }
    this.status = "failed"
    this.failure = errorMessage(error)
    this.notify()
  }

  waitForFirstChunk(timeoutMs: number): Promise<"ready" | "completed" | "failed" | "timeout"> {
    if (this.byteLength > 0) return Promise.resolve("ready")
    if (this.status === "completed") return Promise.resolve("completed")
    if (this.status === "failed") return Promise.resolve("failed")
    if (timeoutMs <= 0) return Promise.resolve("timeout")

    return new Promise((resolve) => {
      let settled = false
      let timeout: ReturnType<typeof setTimeout> | undefined
      const finish = (state: "ready" | "completed" | "failed" | "timeout"): void => {
        if (settled) return
        settled = true
        if (timeout) clearTimeout(timeout)
        this.waiters.delete(waiter)
        resolve(state)
      }
      const waiter = (): void => {
        if (this.byteLength > 0) {
          finish("ready")
        } else if (this.status === "completed") {
          finish("completed")
        } else if (this.status === "failed") {
          finish("failed")
        }
      }
      this.waiters.add(waiter)
      timeout = setTimeout(() => finish("timeout"), timeoutMs)
      timeout.unref?.()
    })
  }

  async *stream(): AsyncIterable<Uint8Array> {
    let index = 0
    let yielded = false
    for (;;) {
      while (index < this.chunks.length) {
        yielded = true
        yield this.chunks[index++]!
      }
      if (this.status === "completed") return
      if (this.status === "failed") {
        if (yielded) return
        throw new Error(this.failure!)
      }
      await new Promise<void>((resolve) => {
        this.waiters.add(resolve)
      })
    }
  }

  private notify(): void {
    const waiters = [...this.waiters]
    this.waiters.clear()
    for (const waiter of waiters) waiter()
  }
}

class TwilioAudioStreamJobStore {
  private readonly jobs = new Map<string, TwilioAudioStreamJob>()

  create(callSid: string, jobId: string, mimeType = "audio/mpeg"): TwilioAudioStreamJob {
    const key = this.key(callSid, jobId)
    const job = new TwilioAudioStreamJob(callSid, jobId, mimeType)
    this.jobs.set(key, job)
    return job
  }

  get(callSid: string, jobId: string): TwilioAudioStreamJob | null {
    return this.jobs.get(this.key(callSid, jobId)) ?? null
  }

  /* v8 ignore start -- stream job cleanup is delayed beyond request-scope tests @preserve */
  delete(callSid: string, jobId: string): void {
    this.jobs.delete(this.key(callSid, jobId))
  }
  /* v8 ignore stop */

  private key(callSid: string, jobId: string): string {
    return `${callSid}/${jobId}`
  }
}

function deliveredSegments(turn: VoiceLoopbackTurnResult): Array<Extract<VoiceLoopbackTurnResult["speechSegments"][number]["tts"], { status: "delivered" }>> {
  return turn.speechSegments.map((segment) => segment.tts)
}

async function writeVoiceTurnPlaybackArtifacts(options: {
  bridgeOptions: TwilioPhoneBridgeOptions
  basePath: string
  callDir: string
  safeCallSid: string
  baseUtteranceId: string
  turn: VoiceLoopbackTurnResult
}): Promise<string[]> {
  const urls: string[] = []
  for (const segment of options.turn.speechSegments) {
    const playback = await writeVoicePlaybackArtifact({
      utteranceId: segment.utteranceId,
      delivery: segment.tts,
      outputDir: options.callDir,
    })
    urls.push(routeUrl(
      options.bridgeOptions.publicBaseUrl,
      `${options.basePath}/audio/${encodeURIComponent(options.safeCallSid)}/${encodeURIComponent(path.basename(playback.audioPath))}`,
    ))
  }
  return urls
}

function playManyTwiml(urls: string[]): string {
  return urls.map(playTwiml).join("")
}

function streamAudioUrl(
  options: TwilioPhoneBridgeOptions,
  basePath: string,
  safeCallSid: string,
  jobId: string,
): string {
  return routeUrl(
    options.publicBaseUrl,
    `${basePath}/audio-stream/${encodeURIComponent(safeCallSid)}/${encodeURIComponent(`${jobId}.mp3`)}`,
  )
}

function scheduleJobCleanup(jobs: TwilioAudioStreamJobStore, safeCallSid: string, jobId: string): void {
  /* v8 ignore start -- stream job cleanup is delayed beyond request-scope tests @preserve */
  const cleanup = setTimeout(() => {
    jobs.delete(safeCallSid, jobId)
  }, 5 * 60_000)
  cleanup.unref?.()
  /* v8 ignore stop */
}

function startTwilioPlaybackStreamJob(options: {
  jobs: TwilioAudioStreamJobStore
  bridgeOptions: TwilioPhoneBridgeOptions
  basePath: string
  callDir: string
  safeCallSid: string
  jobId: string
  baseUtteranceId: string
  runTurn: (onAudioChunk: (chunk: Uint8Array) => void) => Promise<VoiceLoopbackTurnResult>
  meta: Record<string, string>
}): TwilioAudioStreamJob {
  const job = options.jobs.create(options.safeCallSid, options.jobId)
  void (async () => {
    try {
      const turn = await options.runTurn((chunk) => job.append(chunk))
      const deliveries = deliveredSegments(turn)
      if (job.byteLength === 0 && deliveries.length > 0) {
        for (const delivery of deliveries) job.append(delivery.audio)
      }
      if (deliveries.length === 0) {
        /* v8 ignore next -- runVoiceLoopbackTurn cannot return delivered TTS with zero speech segments @preserve */
        if (turn.tts.status === "failed") throw new Error(turn.tts.error)
        /* v8 ignore next -- runVoiceLoopbackTurn emits a speech segment whenever TTS is delivered @preserve */
        throw new Error("voice turn produced no audio")
      }

      try {
        await writeVoiceTurnPlaybackArtifacts({
          bridgeOptions: options.bridgeOptions,
          basePath: options.basePath,
          callDir: options.callDir,
          safeCallSid: options.safeCallSid,
          baseUtteranceId: options.baseUtteranceId,
          turn,
        })
      } catch (artifactError) {
        emitNervesEvent({
          level: "warn",
          component: "senses",
          event: "senses.voice_twilio_stream_artifact_error",
          message: "Twilio stream audio was delivered but artifact persistence failed",
          meta: { ...options.meta, error: errorMessage(artifactError) },
        })
      }

      job.complete()
      emitNervesEvent({
        component: "senses",
        event: "senses.voice_twilio_stream_end",
        message: "finished Twilio streaming voice playback job",
        meta: { ...options.meta, byteLength: String(job.byteLength), segmentCount: String(deliveries.length) },
      })
    } catch (error) {
      job.fail(error)
      emitNervesEvent({
        level: "error",
        component: "senses",
        event: "senses.voice_twilio_stream_error",
        message: "Twilio streaming voice playback job failed",
        meta: { ...options.meta, error: errorMessage(error) },
      })
    } finally {
      scheduleJobCleanup(options.jobs, options.safeCallSid, options.jobId)
    }
  })()
  return job
}

async function runPhonePromptTurn(options: {
  bridgeOptions: TwilioPhoneBridgeOptions
  basePath: string
  callDir: string
  safeCallSid: string
  utteranceId: string
  friendId: string
  sessionKey: string
  promptText: string
  afterPlayback: "record" | "redirect"
}): Promise<TwilioPhoneBridgeResponse> {
  const transcript = buildVoiceTranscript({
    utteranceId: options.utteranceId,
    text: options.promptText,
    source: "loopback",
  })
  const turn = await runVoiceLoopbackTurn({
    agentName: options.bridgeOptions.agentName,
    friendId: options.friendId,
    sessionKey: options.sessionKey,
    transcript,
    tts: options.bridgeOptions.tts,
    runSenseTurn: options.bridgeOptions.runSenseTurn,
  })
  const after = nextInputTwiml(options.bridgeOptions, options.basePath, options.afterPlayback)

  if (turn.tts.status !== "delivered") {
    return xmlResponse(`${sayTwiml("voice output failed after the text response was captured.")}${after}`)
  }

  const audioUrls = await writeVoiceTurnPlaybackArtifacts({
    bridgeOptions: options.bridgeOptions,
    basePath: options.basePath,
    callDir: options.callDir,
    safeCallSid: options.safeCallSid,
    baseUtteranceId: options.utteranceId,
    turn,
  })

  return xmlResponse(`${playManyTwiml(audioUrls)}${after}`)
}

export function computeTwilioSignature(input: TwilioSignatureInput): string {
  const payload = input.url + Object.keys(input.params)
    .sort()
    .map((key) => `${key}${input.params[key]}`)
    .join("")
  return crypto.createHmac("sha1", input.authToken).update(payload).digest("base64")
}

export function validateTwilioSignature(input: TwilioSignatureInput & { signature: string }): boolean {
  if (!input.authToken.trim()) return true
  if (!input.signature.trim()) return false
  const expected = Buffer.from(computeTwilioSignature(input))
  const actual = Buffer.from(input.signature)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

export function twilioRecordingMediaUrl(recordingUrl: string): string {
  const url = new URL(recordingUrl)
  if (!/\.[A-Za-z0-9]+$/.test(url.pathname)) {
    url.pathname = `${url.pathname}.wav`
  }
  return url.toString()
}

export async function defaultTwilioRecordingDownloader(request: TwilioRecordingDownloadRequest): Promise<Uint8Array> {
  const headers: Record<string, string> = {}
  if (request.accountSid && request.authToken) {
    headers.Authorization = `Basic ${Buffer.from(`${request.accountSid}:${request.authToken}`).toString("base64")}`
  }

  const response = await fetch(request.recordingUrl, { headers })
  if (!response.ok) {
    throw new Error(`Twilio recording download failed: ${response.status} ${response.statusText}`.trim())
  }
  return Buffer.from(await response.arrayBuffer())
}

function verifyRequest(options: TwilioPhoneBridgeOptions, request: TwilioPhoneBridgeRequest, params: Record<string, string>): boolean {
  const authToken = options.twilioAuthToken?.trim()
  if (!authToken) return true
  return validateTwilioSignature({
    authToken,
    url: requestPublicUrl(options.publicBaseUrl, request.path),
    params,
    signature: headerValue(request.headers, "x-twilio-signature"),
  })
}

async function handleIncoming(
  options: TwilioPhoneBridgeOptions,
  basePath: string,
  params: Record<string, string>,
  jobs: TwilioAudioStreamJobStore,
): Promise<TwilioPhoneBridgeResponse> {
  const callSid = params.CallSid?.trim() || "incoming"
  const safeCallSid = safeSegment(callSid)
  const callDir = path.join(options.outputDir, safeCallSid)
  const utteranceId = `twilio-${safeCallSid}-connected`
  const friendId = voiceFriendId(options, params.From?.trim() ?? "", callSid)
  const sessionKey = twilioPhoneVoiceSessionKey({
    defaultFriendId: options.defaultFriendId,
    from: params.From?.trim() ?? "",
    to: params.To?.trim() ?? "",
    callSid,
  })
  emitNervesEvent({
    component: "senses",
    event: "senses.voice_twilio_incoming",
    message: "Twilio voice call connected",
    meta: { agentName: options.agentName, callSid: safeCallSid, sessionKey },
  })

  if (normalizeTwilioPhoneTransportMode(options.transportMode) === "media-stream") {
    try {
      await fs.mkdir(callDir, { recursive: true })
      const transcript = buildVoiceTranscript({
        utteranceId,
        text: callConnectedPrompt(params),
        source: "loopback",
      })
      const greetingJobId = safeSegment(utteranceId)
      const job = startTwilioPlaybackStreamJob({
        jobs,
        bridgeOptions: options,
        basePath,
        callDir,
        safeCallSid,
        jobId: greetingJobId,
        baseUtteranceId: utteranceId,
        runTurn: (onAudioChunk) => runVoiceLoopbackTurn({
          agentName: options.agentName,
          friendId,
          sessionKey,
          transcript,
          tts: options.tts,
          runSenseTurn: options.runSenseTurn,
          onAudioChunk,
        }),
        meta: { agentName: options.agentName, callSid: safeCallSid, utteranceId, transportMode: "media-stream" },
      })
      const prebufferState = await job.waitForFirstChunk(options.greetingPrebufferMs ?? DEFAULT_TWILIO_GREETING_PREBUFFER_MS)
      emitNervesEvent({
        component: "senses",
        event: "senses.voice_twilio_greeting_prebuffer",
        message: "Twilio Media Stream greeting prebuffer completed",
        meta: { agentName: options.agentName, callSid: safeCallSid, utteranceId, state: prebufferState, transportMode: "media-stream" },
      })
      emitNervesEvent({
        component: "senses",
        event: "senses.voice_twilio_media_connect",
        message: "answering Twilio call with a bidirectional Media Stream",
        meta: { agentName: options.agentName, callSid: safeCallSid, sessionKey, greetingJob: prebufferState },
      })
      return xmlResponse(mediaStreamTwiml(
        options,
        basePath,
        params,
        prebufferState === "failed" ? undefined : greetingJobId,
      ))
    } catch (error) {
      emitNervesEvent({
        level: "error",
        component: "senses",
        event: "senses.voice_twilio_incoming_error",
        message: "Twilio incoming media-stream greeting turn failed",
        meta: { agentName: options.agentName, callSid: safeCallSid, error: errorMessage(error), transportMode: "media-stream" },
      })
      return xmlResponse(mediaStreamTwiml(options, basePath, params))
    }
  }

  try {
    await fs.mkdir(callDir, { recursive: true })
    if (normalizeTwilioPhonePlaybackMode(options.playbackMode) === "stream") {
      const transcript = buildVoiceTranscript({
        utteranceId,
        text: callConnectedPrompt(params),
        source: "loopback",
      })
      const jobId = safeSegment(utteranceId)
      const job = startTwilioPlaybackStreamJob({
        jobs,
        bridgeOptions: options,
        basePath,
        callDir,
        safeCallSid,
        jobId,
        baseUtteranceId: utteranceId,
        runTurn: (onAudioChunk) => runVoiceLoopbackTurn({
          agentName: options.agentName,
          friendId,
          sessionKey,
          transcript,
          tts: options.tts,
          runSenseTurn: options.runSenseTurn,
          onAudioChunk,
        }),
        meta: { agentName: options.agentName, callSid: safeCallSid, utteranceId },
      })
      const prebufferState = await job.waitForFirstChunk(options.greetingPrebufferMs ?? DEFAULT_TWILIO_GREETING_PREBUFFER_MS)
      emitNervesEvent({
        component: "senses",
        event: "senses.voice_twilio_greeting_prebuffer",
        message: "Twilio greeting prebuffer completed",
        meta: { agentName: options.agentName, callSid: safeCallSid, utteranceId, state: prebufferState },
      })
      if (prebufferState === "failed") {
        return xmlResponse(recordTwiml({
          publicBaseUrl: options.publicBaseUrl,
          basePath,
          timeoutSeconds: options.recordTimeoutSeconds ?? DEFAULT_TWILIO_RECORD_TIMEOUT_SECONDS,
          maxLengthSeconds: options.recordMaxLengthSeconds ?? DEFAULT_TWILIO_RECORD_MAX_LENGTH_SECONDS,
        }))
      }
      return xmlResponse(`${playTwiml(streamAudioUrl(options, basePath, safeCallSid, jobId))}${nextInputTwiml(options, basePath, "record")}`)
    }

    return await runPhonePromptTurn({
      bridgeOptions: options,
      basePath,
      callDir,
      safeCallSid,
      utteranceId,
      friendId,
      sessionKey,
      promptText: callConnectedPrompt(params),
      afterPlayback: "record",
    })
  } catch (error) {
    emitNervesEvent({
      level: "error",
      component: "senses",
      event: "senses.voice_twilio_incoming_error",
      message: "Twilio incoming voice greeting turn failed",
      meta: { agentName: options.agentName, callSid: safeCallSid, error: errorMessage(error) },
    })
    return xmlResponse(recordTwiml({
      publicBaseUrl: options.publicBaseUrl,
      basePath,
      timeoutSeconds: options.recordTimeoutSeconds ?? DEFAULT_TWILIO_RECORD_TIMEOUT_SECONDS,
      maxLengthSeconds: options.recordMaxLengthSeconds ?? DEFAULT_TWILIO_RECORD_MAX_LENGTH_SECONDS,
    }))
  }
}

async function handleListen(options: TwilioPhoneBridgeOptions, basePath: string): Promise<TwilioPhoneBridgeResponse> {
  return xmlResponse(recordTwiml({
    publicBaseUrl: options.publicBaseUrl,
    basePath,
    timeoutSeconds: options.recordTimeoutSeconds ?? DEFAULT_TWILIO_RECORD_TIMEOUT_SECONDS,
    maxLengthSeconds: options.recordMaxLengthSeconds ?? DEFAULT_TWILIO_RECORD_MAX_LENGTH_SECONDS,
  }))
}

async function handleRecording(
  options: TwilioPhoneBridgeOptions,
  basePath: string,
  params: Record<string, string>,
  jobs: TwilioAudioStreamJobStore,
): Promise<TwilioPhoneBridgeResponse> {
  const recording = parseRecordingParams(params)
  if (!recording) {
    emitNervesEvent({
      level: "warn",
      component: "senses",
      event: "senses.voice_twilio_recording_rejected",
      message: "Twilio recording callback was missing required fields",
      meta: { agentName: options.agentName },
    })
    return recordAgainResponse(options, basePath, "I did not receive audio. Please try again.")
  }

  const safeCallSid = safeSegment(recording.callSid)
  const safeRecordingSid = safeSegment(recording.recordingSid)
  const callDir = path.join(options.outputDir, safeCallSid)
  const inputPath = path.join(callDir, `${safeRecordingSid}.wav`)
  const utteranceId = `twilio-${safeCallSid}-${safeRecordingSid}`
  const downloadRecording = options.downloadRecording ?? defaultTwilioRecordingDownloader
  const friendId = voiceFriendId(options, recording.from, recording.callSid)
  const sessionKey = twilioPhoneVoiceSessionKey({
    defaultFriendId: options.defaultFriendId,
    from: recording.from,
    to: recording.to,
    callSid: recording.callSid,
  })

  emitNervesEvent({
    component: "senses",
    event: "senses.voice_twilio_turn_start",
    message: "starting Twilio voice turn",
    meta: { agentName: options.agentName, callSid: safeCallSid, recordingSid: safeRecordingSid, sessionKey },
  })

  try {
    if (normalizeTwilioPhonePlaybackMode(options.playbackMode) === "stream") {
      const jobId = safeSegment(utteranceId)
      startTwilioPlaybackStreamJob({
        jobs,
        bridgeOptions: options,
        basePath,
        callDir,
        safeCallSid,
        jobId,
        baseUtteranceId: utteranceId,
        runTurn: async (onAudioChunk) => {
          await fs.mkdir(callDir, { recursive: true })
          const mediaUrl = twilioRecordingMediaUrl(recording.recordingUrl)
          const audio = await downloadRecording({
            recordingUrl: mediaUrl,
            accountSid: options.twilioAccountSid?.trim() || undefined,
            authToken: options.twilioAuthToken?.trim() || undefined,
          })
          await fs.writeFile(inputPath, audio)
          const turnTranscript = await transcribeRecordingOrNoSpeech({
            transcriber: options.transcriber,
            utteranceId,
            inputPath,
          })
          return runVoiceLoopbackTurn({
            agentName: options.agentName,
            friendId,
            sessionKey,
            transcript: turnTranscript,
            tts: options.tts,
            runSenseTurn: options.runSenseTurn,
            onAudioChunk,
          })
        },
        meta: { agentName: options.agentName, callSid: safeCallSid, recordingSid: safeRecordingSid, utteranceId },
      })
      return xmlResponse(`${playTwiml(streamAudioUrl(options, basePath, safeCallSid, jobId))}${redirectTwiml(options.publicBaseUrl, basePath)}`)
    }

    await fs.mkdir(callDir, { recursive: true })
    const mediaUrl = twilioRecordingMediaUrl(recording.recordingUrl)
    const audio = await downloadRecording({
      recordingUrl: mediaUrl,
      accountSid: options.twilioAccountSid?.trim() || undefined,
      authToken: options.twilioAuthToken?.trim() || undefined,
    })
    await fs.writeFile(inputPath, audio)

    const transcript = await transcribeRecordingOrNoSpeech({
      transcriber: options.transcriber,
      utteranceId,
      inputPath,
    })

    if (transcript.utteranceId === `${utteranceId}-nospeech`) {
      return await runPhonePromptTurn({
        bridgeOptions: options,
        basePath,
        callDir,
        safeCallSid,
        utteranceId: `${utteranceId}-nospeech`,
        friendId,
        sessionKey,
        promptText: noSpeechPrompt(),
        afterPlayback: "redirect",
      })
    }

    const turn = await runVoiceLoopbackTurn({
      agentName: options.agentName,
      friendId,
      sessionKey,
      transcript,
      tts: options.tts,
      runSenseTurn: options.runSenseTurn,
    })

    if (turn.tts.status !== "delivered") {
      return xmlResponse(`${sayTwiml("voice output failed after the text response was captured.")}${redirectTwiml(options.publicBaseUrl, basePath)}`)
    }

    const audioUrls = await writeVoiceTurnPlaybackArtifacts({
      bridgeOptions: options,
      basePath,
      callDir,
      safeCallSid,
      baseUtteranceId: utteranceId,
      turn,
    })

    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_turn_end",
      message: "finished Twilio voice turn",
      meta: { agentName: options.agentName, callSid: safeCallSid, recordingSid: safeRecordingSid, playbackCount: audioUrls.length },
    })

    return xmlResponse(`${playManyTwiml(audioUrls)}${redirectTwiml(options.publicBaseUrl, basePath)}`)
  } catch (error) {
    emitNervesEvent({
      level: "error",
      component: "senses",
      event: "senses.voice_twilio_turn_error",
      message: "Twilio voice turn failed",
      meta: {
        agentName: options.agentName,
        callSid: safeCallSid,
        recordingSid: safeRecordingSid,
        error: errorMessage(error),
      },
    })
    return xmlResponse(`${sayTwiml("I could not process that audio. Please try again.")}${redirectTwiml(options.publicBaseUrl, basePath)}`)
  }
}

async function handleAudio(options: TwilioPhoneBridgeOptions, basePath: string, requestPath: string): Promise<TwilioPhoneBridgeResponse> {
  const prefix = `${basePath}/audio/`
  const pathOnly = requestPath.split("?")[0]!
  const rest = pathOnly.slice(prefix.length)
  const parts = rest.split("/")
  if (parts.length !== 2) return textResponse(404, "not found")
  const [callSidPart, fileNamePart] = parts as [string, string]
  const callSid = decodeSafeSegment(callSidPart)
  const fileName = decodeSafeSegment(fileNamePart)
  if (!callSid || !fileName) return textResponse(404, "not found")

  const baseDir = path.resolve(options.outputDir, callSid)
  const audioPath = path.resolve(baseDir, fileName)

  try {
    const audio = await fs.readFile(audioPath)
    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_audio_served",
      message: "served Twilio voice audio artifact",
      meta: { agentName: options.agentName, callSid, fileName },
    })
    return binaryResponse(audio, contentTypeForAudio(fileName))
  } catch {
    return textResponse(404, "not found")
  }
}

async function handleAudioStream(
  options: TwilioPhoneBridgeOptions,
  basePath: string,
  requestPath: string,
  jobs: TwilioAudioStreamJobStore,
): Promise<TwilioPhoneBridgeResponse> {
  const prefix = `${basePath}/audio-stream/`
  const pathOnly = requestPath.split("?")[0]!
  const rest = pathOnly.slice(prefix.length)
  const parts = rest.split("/")
  if (parts.length !== 2) return textResponse(404, "not found")
  const [callSidPart, fileNamePart] = parts as [string, string]
  const callSid = decodeSafeSegment(callSidPart)
  const fileName = decodeSafeSegment(fileNamePart)
  if (!callSid || !fileName) return textResponse(404, "not found")
  const jobId = fileName.replace(/\.[A-Za-z0-9]+$/, "")
  const job = jobs.get(callSid, jobId)
  if (!job) return textResponse(404, "not found")

  emitNervesEvent({
    component: "senses",
    event: "senses.voice_twilio_stream_served",
    message: "served Twilio voice streaming audio job",
    meta: { agentName: options.agentName, callSid, jobId },
  })
  return streamResponse(job.stream(), job.mimeType)
}

export function createTwilioPhoneBridge(options: TwilioPhoneBridgeOptions): TwilioPhoneBridge {
  new URL(options.publicBaseUrl)
  const basePath = normalizeTwilioPhoneBasePath(options.basePath)
  const jobs = new TwilioAudioStreamJobStore()
  const mediaStreams = new WebSocketServer({ noServer: true })

  mediaStreams.on("connection", (ws) => {
    const session = new TwilioMediaStreamSession(ws, options, jobs)
    session.attach()
  })

  return {
    async handle(request): Promise<TwilioPhoneBridgeResponse> {
      const method = request.method.toUpperCase()
      const requestPath = request.path.startsWith("/") ? request.path : `/${request.path}`
      const routePath = requestPath.split("?")[0]!
      if (method === "GET" && requestPath.startsWith(`${basePath}/audio/`)) {
        return handleAudio(options, basePath, requestPath)
      }
      if (method === "GET" && requestPath.startsWith(`${basePath}/audio-stream/`)) {
        return handleAudioStream(options, basePath, requestPath, jobs)
      }
      if (method === "GET" && routePath === `${basePath}/health`) {
        return textResponse(200, "ok")
      }
      if (method !== "POST") return textResponse(405, "method not allowed")

      const params = formParams(bodyText(request.body))
      if (!verifyRequest(options, { ...request, path: requestPath }, params)) {
        emitNervesEvent({
          level: "warn",
          component: "senses",
          event: "senses.voice_twilio_signature_rejected",
          message: "rejected Twilio webhook with invalid signature",
          meta: { agentName: options.agentName, path: requestPath },
        })
        return textResponse(403, "invalid Twilio signature")
      }

      if (routePath === `${basePath}/incoming`) return handleIncoming(options, basePath, params, jobs)
      if (routePath === `${basePath}/listen`) return handleListen(options, basePath)
      if (routePath === `${basePath}/recording`) return handleRecording(options, basePath, params, jobs)
      return textResponse(404, "not found")
    },
    handleUpgrade(request, socket, head): boolean {
      const requestPath = request.url?.startsWith("/") ? request.url : `/${request.url ?? ""}`
      const routePath = requestPath.split("?")[0]!
      if (
        routePath !== `${basePath}/media-stream`
        || normalizeTwilioPhoneTransportMode(options.transportMode) !== "media-stream"
      ) {
        return false
      }

      mediaStreams.handleUpgrade(request, socket, head, (ws) => {
        mediaStreams.emit("connection", ws, request)
      })
      emitNervesEvent({
        component: "senses",
        event: "senses.voice_twilio_media_upgrade",
        message: "accepted Twilio Media Stream WebSocket upgrade",
        meta: { agentName: options.agentName, path: routePath },
      })
      return true
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        mediaStreams.close((error?: Error) => error ? reject(error) : resolve())
      })
    },
  }
}

function readRequestBody(req: http.IncomingMessage, limitBytes = 1_000_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let byteLength = 0
    req.on("data", (chunk: Buffer) => {
      byteLength += chunk.byteLength
      if (byteLength > limitBytes) {
        reject(new Error("request body too large"))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

/* v8 ignore start -- HTTP backpressure is platform-dependent in unit tests @preserve */
function waitForDrain(res: http.ServerResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      res.off("drain", onDrain)
      res.off("error", onError)
      res.off("close", onClose)
    }
    const onDrain = (): void => {
      cleanup()
      resolve()
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const onClose = (): void => {
      cleanup()
      const error = new Error("response closed before drain")
      ;(error as Error & { code?: string }).code = "ERR_STREAM_PREMATURE_CLOSE"
      reject(error)
    }
    res.once("drain", onDrain)
    res.once("error", onError)
    res.once("close", onClose)
  })
}
/* v8 ignore stop */

function isClientDisconnectError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : ""
  if (code === "ECONNRESET" || code === "EPIPE" || code === "ERR_STREAM_DESTROYED" || code === "ERR_STREAM_PREMATURE_CLOSE") {
    return true
  }
  const message = errorMessage(error).toLowerCase()
  return message.includes("aborted")
    || message.includes("socket hang up")
    || message.includes("premature close")
    || message.includes("stream destroyed")
    || message.includes("write after end")
    || message.includes("response closed before drain")
}

async function writeResponseBody(res: http.ServerResponse, body: TwilioPhoneBridgeResponse["body"]): Promise<void> {
  if (!isAsyncIterableBody(body)) {
    res.end(body)
    return
  }

  try {
    for await (const chunk of body) {
      if (res.destroyed || res.writableEnded) return
      /* v8 ignore next -- exercised only when Node reports socket backpressure @preserve */
      if (!res.write(chunk)) {
        await waitForDrain(res)
      }
    }
  } catch (error) {
    if (isClientDisconnectError(error)) return
    throw error
  }
  if (!res.destroyed && !res.writableEnded) {
    res.end()
  }
}

export async function startTwilioPhoneBridgeServer(
  options: StartTwilioPhoneBridgeServerOptions,
): Promise<TwilioPhoneBridgeServer> {
  const port = options.port ?? DEFAULT_TWILIO_PHONE_PORT
  const host = options.host ?? "127.0.0.1"
  const bridge = createTwilioPhoneBridge(options)
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readRequestBody(req)
      const response = await bridge.handle({
        method: req.method as string,
        path: req.url as string,
        headers: req.headers,
        body,
      })
      res.writeHead(response.statusCode, response.headers)
      await writeResponseBody(res, response.body)
    } catch (error) {
      emitNervesEvent({
        level: "error",
        component: "senses",
        event: "senses.voice_twilio_server_error",
        message: "Twilio voice bridge server failed a request",
        meta: { agentName: options.agentName, error: errorMessage(error) },
      })
      /* v8 ignore next -- defensive path for async stream failures after headers @preserve */
      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : new Error(String(error)))
      } else {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
        res.end("internal server error")
      }
    }
  })
  server.on("upgrade", (req, socket, head) => {
    const handled = bridge.handleUpgrade?.(req, socket, head) ?? false
    if (!handled) {
      socket.destroy()
    }
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off("error", onError)
      resolve()
    }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(port, host)
  })

  emitNervesEvent({
    component: "senses",
    event: "senses.voice_twilio_server_start",
    message: "Twilio voice bridge server started",
    meta: { agentName: options.agentName, host, port, publicBaseUrl: options.publicBaseUrl },
  })

  const actualPort = (server.address() as { port: number }).port

  return {
    bridge,
    server,
    localUrl: `http://${host}:${actualPort}`,
  }
}
