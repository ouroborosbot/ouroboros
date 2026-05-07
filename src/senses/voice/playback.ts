import { spawn } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import { emitNervesEvent } from "../../nerves/runtime"
import type { VoiceCommandResult, VoiceCommandRunner } from "./audio-routing"
import type { VoiceTtsDelivery } from "./turn"

export type VoicePlaybackStatus = "written" | "played" | "failed"

export interface VoicePlaybackResult {
  status: VoicePlaybackStatus
  audioPath: string
  byteLength: number
  mimeType: string
  playbackAttempted: boolean
  error?: string
}

export interface VoicePlaybackRequest {
  utteranceId: string
  delivery: Extract<VoiceTtsDelivery, { status: "delivered" }>
  outputDir: string
  playAudio?: boolean
  playbackCommandPath?: string
  commandRunner?: VoiceCommandRunner
  timeoutMs?: number
  mkdir?: (dir: string, options: { recursive: true }) => Promise<unknown>
  writeFile?: (filePath: string, data: Uint8Array) => Promise<unknown>
}

function nodeCommandRunner(command: string, args: string[], options: { timeoutMs: number }): Promise<VoiceCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`command timed out after ${options.timeoutMs}ms`))
    }, options.timeoutMs)

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (exitCode) => {
      clearTimeout(timer)
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: exitCode ?? 0,
      })
    })
  })
}

function audioExtension(mimeType: string): string {
  if (mimeType === "audio/mpeg") return "mp3"
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav"
  if (mimeType.startsWith("audio/pcm")) return "pcm"
  return "audio"
}

function safeFileStem(input: string): string {
  const stem = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return stem || "utterance"
}

function commandFailureMessage(result: VoiceCommandResult): string {
  const stderr = result.stderr?.trim()
  if (stderr) return `exit ${result.exitCode ?? "unknown"}: ${stderr}`
  const stdout = result.stdout?.trim()
  if (stdout) return `exit ${result.exitCode ?? "unknown"}: ${stdout}`
  return `exit ${result.exitCode ?? "unknown"}`
}

export async function writeVoicePlaybackArtifact(request: VoicePlaybackRequest): Promise<VoicePlaybackResult> {
  const mkdir = request.mkdir ?? fs.mkdir
  const writeFile = request.writeFile ?? fs.writeFile
  const commandRunner = request.commandRunner ?? nodeCommandRunner
  const timeoutMs = request.timeoutMs ?? 30_000
  const playbackCommandPath = request.playbackCommandPath ?? "afplay"
  const audioPath = path.join(
    request.outputDir,
    `${safeFileStem(request.utteranceId)}.${audioExtension(request.delivery.mimeType)}`,
  )

  await mkdir(request.outputDir, { recursive: true })
  await writeFile(audioPath, request.delivery.audio)

  emitNervesEvent({
    component: "senses",
    event: "senses.voice_playback_artifact_written",
    message: "voice playback artifact written",
    meta: {
      utteranceId: request.utteranceId,
      audioPath,
      byteLength: request.delivery.byteLength,
      mimeType: request.delivery.mimeType,
    },
  })

  if (request.playAudio !== true) {
    return {
      status: "written",
      audioPath,
      byteLength: request.delivery.byteLength,
      mimeType: request.delivery.mimeType,
      playbackAttempted: false,
    }
  }

  emitNervesEvent({
    component: "senses",
    event: "senses.voice_playback_start",
    message: "starting voice playback",
    meta: { utteranceId: request.utteranceId, audioPath, playbackCommandPath },
  })

  try {
    const result = await commandRunner(playbackCommandPath, [audioPath], { timeoutMs })
    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      throw new Error(commandFailureMessage(result))
    }

    emitNervesEvent({
      component: "senses",
      event: "senses.voice_playback_end",
      message: "finished voice playback",
      meta: { utteranceId: request.utteranceId, audioPath },
    })

    return {
      status: "played",
      audioPath,
      byteLength: request.delivery.byteLength,
      mimeType: request.delivery.mimeType,
      playbackAttempted: true,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitNervesEvent({
      level: "error",
      component: "senses",
      event: "senses.voice_playback_error",
      message: "voice playback failed",
      meta: { utteranceId: request.utteranceId, audioPath, error: message },
    })

    return {
      status: "failed",
      audioPath,
      byteLength: request.delivery.byteLength,
      mimeType: request.delivery.mimeType,
      playbackAttempted: true,
      error: message,
    }
  }
}
