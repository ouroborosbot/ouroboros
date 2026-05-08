import * as path from "path"
import * as crypto from "node:crypto"
import type { Server } from "http"
import { getAgentRoot, loadAgentConfig, type AgentConfig, type AgentProvider } from "../../heart/identity"
import { loadOrCreateMachineIdentity, type MachineIdentity } from "../../heart/machine-identity"
import { readProviderCredentialPool, refreshProviderCredentialPool } from "../../heart/provider-credentials"
import {
  readMachineRuntimeCredentialConfig,
  readRuntimeCredentialConfig,
  refreshMachineRuntimeCredentialConfig,
  refreshRuntimeCredentialConfig,
  waitForRuntimeCredentialBootstrap,
  type RuntimeCredentialConfig,
  type RuntimeCredentialConfigReadResult,
} from "../../heart/runtime-credentials"
import { emitNervesEvent } from "../../nerves/runtime"
import { createElevenLabsTtsClient } from "./elevenlabs"
import {
  DEFAULT_TWILIO_PHONE_PORT,
  DEFAULT_TWILIO_GREETING_PREBUFFER_MS,
  DEFAULT_TWILIO_RECORD_MAX_LENGTH_SECONDS,
  DEFAULT_TWILIO_RECORD_TIMEOUT_SECONDS,
  TWILIO_PHONE_WEBHOOK_BASE_PATH,
  DEFAULT_TWILIO_PHONE_PLAYBACK_MODE,
  DEFAULT_TWILIO_PHONE_TRANSPORT_MODE,
  normalizeTwilioPhoneBasePath,
  normalizeTwilioPhonePlaybackMode,
  normalizeTwilioPhoneTransportMode,
  normalizeTwilioE164PhoneNumber,
  startTwilioPhoneBridgeServer,
  createTwilioOutboundCall,
  readRecentTwilioOutboundCallJobs,
  twilioOutboundCallStatusCallbackUrl,
  twilioOutboundCallWebhookUrl,
  twilioPhoneWebhookUrl,
  updateTwilioOutboundCallJob,
  writeTwilioOutboundCallJob,
  type StartTwilioPhoneBridgeServerOptions,
  type TwilioPhonePlaybackMode,
  type TwilioPhoneTransportMode,
  type TwilioPhoneBridgeServer,
  type TwilioOutboundCallCreateRequest,
  type TwilioOutboundCallCreateResult,
} from "./twilio-phone"
import { createWhisperCppTranscriber } from "./whisper"

export interface TwilioPhoneTransportRuntimeOverrides {
  enabled?: boolean
  publicBaseUrl?: string
  basePath?: string
  port?: number
  host?: string
  outputDir?: string
  defaultFriendId?: string
  elevenLabsVoiceId?: string
  whisperCliPath?: string
  whisperModelPath?: string
  recordTimeoutSeconds?: number
  recordMaxLengthSeconds?: number
  greetingPrebufferMs?: number
  playbackMode?: TwilioPhonePlaybackMode
  transportMode?: TwilioPhoneTransportMode
  twilioFromNumber?: string
}

export interface TwilioPhoneTransportRuntimeSettings {
  agentName: string
  publicBaseUrl: string
  basePath: string
  webhookUrl: string
  outputDir: string
  port: number
  host: string
  elevenLabsApiKey: string
  elevenLabsVoiceId: string
  whisperCliPath: string
  whisperModelPath: string
  twilioAccountSid?: string
  twilioAuthToken?: string
  twilioFromNumber?: string
  defaultFriendId?: string
  recordTimeoutSeconds: number
  recordMaxLengthSeconds: number
  greetingPrebufferMs: number
  playbackMode: TwilioPhonePlaybackMode
  transportMode: TwilioPhoneTransportMode
}

export type TwilioPhoneTransportRuntimeResolution =
  | { status: "disabled"; reason: string }
  | { status: "configured"; settings: TwilioPhoneTransportRuntimeSettings }

export type TwilioPhoneTransportRuntimeState =
  | { status: "disabled"; reason: string }
  | {
    status: "started"
    settings: TwilioPhoneTransportRuntimeSettings
    bridge: TwilioPhoneBridgeServer
  }

export interface ResolveTwilioPhoneTransportRuntimeOptions {
  agentName: string
  runtimeConfig: RuntimeCredentialConfig
  machineConfig: RuntimeCredentialConfig
  overrides?: TwilioPhoneTransportRuntimeOverrides
  defaultBasePath?: string
  requirePublicUrl?: boolean
}

export interface StartConfiguredTwilioPhoneTransportOptions {
  agentName: string
  overrides?: TwilioPhoneTransportRuntimeOverrides
  defaultBasePath?: string
  requirePublicUrl?: boolean
}

export interface TwilioPhoneTransportRuntimeDeps {
  waitForRuntimeCredentialBootstrap: typeof waitForRuntimeCredentialBootstrap
  loadMachineIdentity: () => MachineIdentity
  refreshRuntimeConfig: typeof refreshRuntimeCredentialConfig
  refreshMachineRuntimeConfig: typeof refreshMachineRuntimeCredentialConfig
  readRuntimeConfig: typeof readRuntimeCredentialConfig
  readMachineRuntimeConfig: typeof readMachineRuntimeCredentialConfig
  cacheSelectedProviderCredentials: (agentName: string) => Promise<void>
  createTranscriber: typeof createWhisperCppTranscriber
  createTts: typeof createElevenLabsTtsClient
  startBridgeServer: (options: StartTwilioPhoneBridgeServerOptions) => Promise<TwilioPhoneBridgeServer>
}

export interface PlaceConfiguredTwilioPhoneCallOptions {
  agentName: string
  friendId?: string
  to: string
  reason: string
  outboundId?: string
  now?: Date
  redialGuardMs?: number
}

export interface PlaceConfiguredTwilioPhoneCallResult {
  outboundId: string
  callSid?: string
  status?: string
  webhookUrl: string
  statusCallbackUrl: string
}

export interface TwilioPhoneOutboundCallRuntimeDeps {
  waitForRuntimeCredentialBootstrap: typeof waitForRuntimeCredentialBootstrap
  loadMachineIdentity: () => MachineIdentity
  refreshRuntimeConfig: typeof refreshRuntimeCredentialConfig
  refreshMachineRuntimeConfig: typeof refreshMachineRuntimeCredentialConfig
  readRuntimeConfig: typeof readRuntimeCredentialConfig
  readMachineRuntimeConfig: typeof readMachineRuntimeCredentialConfig
  createOutboundCall: (request: TwilioOutboundCallCreateRequest) => Promise<TwilioOutboundCallCreateResult>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function configString(config: RuntimeCredentialConfig, dottedPath: string): string | undefined {
  let cursor: unknown = config
  for (const segment of dottedPath.split(".")) {
    const record = asRecord(cursor)
    if (!record) return undefined
    cursor = record[segment]
  }
  return typeof cursor === "string" && cursor.trim() ? cursor.trim() : undefined
}

function configNumber(config: RuntimeCredentialConfig, dottedPath: string): number | undefined {
  let cursor: unknown = config
  for (const segment of dottedPath.split(".")) {
    const record = asRecord(cursor)
    if (!record) return undefined
    cursor = record[segment]
  }
  if (typeof cursor === "number" && Number.isFinite(cursor)) return cursor
  if (typeof cursor === "string" && cursor.trim()) {
    const parsed = Number(cursor)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function configBoolean(config: RuntimeCredentialConfig, dottedPath: string): boolean | undefined {
  let cursor: unknown = config
  for (const segment of dottedPath.split(".")) {
    const record = asRecord(cursor)
    if (!record) return undefined
    cursor = record[segment]
  }
  if (typeof cursor === "boolean") return cursor
  if (typeof cursor === "string") {
    const normalized = cursor.trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }
  return undefined
}

function requireConfig(result: RuntimeCredentialConfigReadResult, label: string): RuntimeCredentialConfig {
  if (result.ok) return result.config
  throw new Error(`${label} unavailable: ${result.error}`)
}

function required(value: string | undefined, guidance: string): string {
  if (value) return value
  throw new Error(guidance)
}

function selectedAgentProviders(config: AgentConfig): AgentProvider[] {
  const providers = new Set<AgentProvider>()
  providers.add(config.humanFacing.provider)
  providers.add(config.agentFacing.provider)
  if (config.provider) providers.add(config.provider)
  return [...providers]
}

async function cacheSelectedProviderCredentials(agentName: string): Promise<void> {
  const providers = selectedAgentProviders(loadAgentConfig())
  const cached = readProviderCredentialPool(agentName)
  if (cached.ok && providers.every((provider) => cached.pool.providers[provider])) return
  const pool = await refreshProviderCredentialPool(agentName, { providers })
  if (!pool.ok) {
    throw new Error(`provider credentials unavailable for phone voice: ${pool.error}`)
  }
  const missing = providers.filter((provider) => !pool.pool.providers[provider])
  if (missing.length > 0) {
    throw new Error(`missing provider credentials for phone voice: ${missing.join(", ")}`)
  }
}

function agentPathSegment(agentName: string): string {
  return agentName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "agent"
}

function trimOptional(value: string | undefined): string | undefined {
  return value?.trim() || undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function agentScopedTwilioPhoneBasePath(agentName: string): string {
  return `/voice/agents/${agentPathSegment(agentName)}/twilio`
}

export function resolveTwilioPhoneTransportRuntime(
  options: ResolveTwilioPhoneTransportRuntimeOptions,
): TwilioPhoneTransportRuntimeResolution {
  const overrides = options.overrides ?? {}
  const configuredPublicBaseUrl = trimOptional(overrides.publicBaseUrl)
    ?? configString(options.machineConfig, "voice.twilioPublicUrl")
  const explicitEnabled = overrides.enabled ?? configBoolean(options.machineConfig, "voice.twilioEnabled")
  if (!configuredPublicBaseUrl && options.requirePublicUrl) {
    throw new Error("missing voice.twilioPublicUrl in this machine's runtime config")
  }
  const enabled = explicitEnabled ?? !!configuredPublicBaseUrl
  if (!enabled) {
    return { status: "disabled", reason: "voice.twilioPublicUrl is not configured" }
  }
  if (!configuredPublicBaseUrl) {
    throw new Error("missing voice.twilioPublicUrl in this machine's runtime config")
  }

  const publicUrl = new URL(configuredPublicBaseUrl)
  if (publicUrl.protocol !== "https:") {
    throw new Error("voice.twilioPublicUrl must be an https URL")
  }
  const publicBaseUrl = publicUrl.toString()
  const basePath = normalizeTwilioPhoneBasePath(
    overrides.basePath
      ?? configString(options.machineConfig, "voice.twilioBasePath")
      ?? options.defaultBasePath
      ?? TWILIO_PHONE_WEBHOOK_BASE_PATH,
  )
  const elevenLabsApiKey = required(
    configString(options.runtimeConfig, "integrations.elevenLabsApiKey"),
    "missing integrations.elevenLabsApiKey; run 'ouro connect voice --agent <agent>' for setup guidance",
  )
  const elevenLabsVoiceId = required(
    trimOptional(overrides.elevenLabsVoiceId)
      ?? configString(options.runtimeConfig, "integrations.elevenLabsVoiceId")
      ?? configString(options.runtimeConfig, "voice.elevenLabsVoiceId"),
    "missing integrations.elevenLabsVoiceId; save the ElevenLabs voice ID before starting phone voice",
  )
  const whisperCliPath = required(
    trimOptional(overrides.whisperCliPath)
      ?? configString(options.machineConfig, "voice.whisperCliPath"),
    "missing voice.whisperCliPath in this machine's runtime config",
  )
  const whisperModelPath = required(
    trimOptional(overrides.whisperModelPath)
      ?? configString(options.machineConfig, "voice.whisperModelPath"),
    "missing voice.whisperModelPath in this machine's runtime config",
  )
  const outputDir = trimOptional(overrides.outputDir)
    ?? configString(options.machineConfig, "voice.twilioOutputDir")
    ?? path.join(getAgentRoot(options.agentName), "state", "voice", "twilio-phone")
  const settings: TwilioPhoneTransportRuntimeSettings = {
    agentName: options.agentName,
    publicBaseUrl,
    basePath,
    webhookUrl: twilioPhoneWebhookUrl(publicBaseUrl, basePath),
    outputDir,
    port: overrides.port
      ?? configNumber(options.machineConfig, "voice.twilioPort")
      ?? DEFAULT_TWILIO_PHONE_PORT,
    host: trimOptional(overrides.host)
      ?? configString(options.machineConfig, "voice.twilioHost")
      ?? "127.0.0.1",
    elevenLabsApiKey,
    elevenLabsVoiceId,
    whisperCliPath,
    whisperModelPath,
    twilioAccountSid: configString(options.runtimeConfig, "voice.twilioAccountSid"),
    twilioAuthToken: configString(options.runtimeConfig, "voice.twilioAuthToken"),
    twilioFromNumber: trimOptional(overrides.twilioFromNumber)
      ?? configString(options.runtimeConfig, "voice.twilioFromNumber")
      ?? configString(options.machineConfig, "voice.twilioFromNumber"),
    defaultFriendId: trimOptional(overrides.defaultFriendId)
      ?? configString(options.machineConfig, "voice.twilioDefaultFriendId"),
    recordTimeoutSeconds: overrides.recordTimeoutSeconds
      ?? configNumber(options.machineConfig, "voice.twilioRecordTimeoutSeconds")
      ?? DEFAULT_TWILIO_RECORD_TIMEOUT_SECONDS,
    recordMaxLengthSeconds: overrides.recordMaxLengthSeconds
      ?? configNumber(options.machineConfig, "voice.twilioRecordMaxLengthSeconds")
      ?? DEFAULT_TWILIO_RECORD_MAX_LENGTH_SECONDS,
    greetingPrebufferMs: overrides.greetingPrebufferMs
      ?? configNumber(options.machineConfig, "voice.twilioGreetingPrebufferMs")
      ?? DEFAULT_TWILIO_GREETING_PREBUFFER_MS,
    playbackMode: overrides.playbackMode
      ?? normalizeTwilioPhonePlaybackMode(configString(options.machineConfig, "voice.twilioPlaybackMode") ?? DEFAULT_TWILIO_PHONE_PLAYBACK_MODE),
    transportMode: overrides.transportMode
      ?? normalizeTwilioPhoneTransportMode(configString(options.machineConfig, "voice.twilioTransportMode") ?? DEFAULT_TWILIO_PHONE_TRANSPORT_MODE),
  }
  return { status: "configured", settings }
}

const defaultTwilioPhoneTransportRuntimeDeps: TwilioPhoneTransportRuntimeDeps = {
  waitForRuntimeCredentialBootstrap,
  loadMachineIdentity: loadOrCreateMachineIdentity,
  refreshRuntimeConfig: refreshRuntimeCredentialConfig,
  refreshMachineRuntimeConfig: refreshMachineRuntimeCredentialConfig,
  readRuntimeConfig: readRuntimeCredentialConfig,
  readMachineRuntimeConfig: readMachineRuntimeCredentialConfig,
  cacheSelectedProviderCredentials,
  createTranscriber: createWhisperCppTranscriber,
  createTts: createElevenLabsTtsClient,
  startBridgeServer: startTwilioPhoneBridgeServer,
}

const defaultTwilioPhoneOutboundCallRuntimeDeps: TwilioPhoneOutboundCallRuntimeDeps = {
  waitForRuntimeCredentialBootstrap,
  loadMachineIdentity: loadOrCreateMachineIdentity,
  refreshRuntimeConfig: refreshRuntimeCredentialConfig,
  refreshMachineRuntimeConfig: refreshMachineRuntimeCredentialConfig,
  readRuntimeConfig: readRuntimeCredentialConfig,
  readMachineRuntimeConfig: readMachineRuntimeCredentialConfig,
  createOutboundCall: createTwilioOutboundCall,
}

async function readFreshRuntimeSettings(
  agentName: string,
  overrides: TwilioPhoneTransportRuntimeOverrides | undefined,
  defaultBasePath: string | undefined,
  requirePublicUrl: boolean | undefined,
  deps: Pick<TwilioPhoneOutboundCallRuntimeDeps, "waitForRuntimeCredentialBootstrap" | "loadMachineIdentity" | "refreshRuntimeConfig" | "refreshMachineRuntimeConfig" | "readRuntimeConfig" | "readMachineRuntimeConfig">,
): Promise<TwilioPhoneTransportRuntimeSettings> {
  const bootstrapped = await deps.waitForRuntimeCredentialBootstrap(agentName)
  const hasBootstrappedConfig = bootstrapped
    && deps.readRuntimeConfig(agentName).ok
    && deps.readMachineRuntimeConfig(agentName).ok
  if (!hasBootstrappedConfig) {
    const machine = deps.loadMachineIdentity()
    await Promise.all([
      deps.refreshRuntimeConfig(agentName, { preserveCachedOnFailure: true }).catch(() => undefined),
      deps.refreshMachineRuntimeConfig(agentName, machine.machineId, { preserveCachedOnFailure: true }).catch(() => undefined),
    ])
  }
  const runtimeConfig = requireConfig(deps.readRuntimeConfig(agentName), "portable runtime/config")
  const machineConfig = requireConfig(deps.readMachineRuntimeConfig(agentName), "machine runtime config")
  const resolution = resolveTwilioPhoneTransportRuntime({
    agentName,
    runtimeConfig,
    machineConfig,
    overrides,
    defaultBasePath,
    requirePublicUrl,
  })
  if (resolution.status === "disabled") {
    throw new Error(`Twilio phone voice transport is disabled: ${resolution.reason}`)
  }
  return resolution.settings
}

export async function startConfiguredTwilioPhoneTransport(
  options: StartConfiguredTwilioPhoneTransportOptions,
  deps: TwilioPhoneTransportRuntimeDeps = defaultTwilioPhoneTransportRuntimeDeps,
): Promise<TwilioPhoneTransportRuntimeState> {
  let settings: TwilioPhoneTransportRuntimeSettings
  try {
    settings = await readFreshRuntimeSettings(
      options.agentName,
      options.overrides,
      options.defaultBasePath,
      options.requirePublicUrl,
      deps,
    )
  } catch (error) {
    if (!errorMessage(error).startsWith("Twilio phone voice transport is disabled:")) throw error
    const reason = errorMessage(error).replace(/^Twilio phone voice transport is disabled: /, "")
    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_transport_disabled",
      message: "Twilio phone voice transport is not attached on this machine",
      meta: { agentName: options.agentName, reason },
    })
    return { status: "disabled", reason }
  }

  await deps.cacheSelectedProviderCredentials(options.agentName)
  const transcriber = deps.createTranscriber({
    whisperCliPath: settings.whisperCliPath,
    modelPath: settings.whisperModelPath,
  })
  const tts = deps.createTts({
    apiKey: settings.elevenLabsApiKey,
    voiceId: settings.elevenLabsVoiceId,
    outputFormat: settings.transportMode === "media-stream" ? "ulaw_8000" : "mp3_44100_128",
  })
  const bridge = await deps.startBridgeServer({
    agentName: settings.agentName,
    publicBaseUrl: settings.publicBaseUrl,
    basePath: settings.basePath,
    outputDir: settings.outputDir,
    transcriber,
    tts,
    port: settings.port,
    host: settings.host,
    twilioAccountSid: settings.twilioAccountSid,
    twilioAuthToken: settings.twilioAuthToken,
    twilioFromNumber: settings.twilioFromNumber,
    defaultFriendId: settings.defaultFriendId,
    recordTimeoutSeconds: settings.recordTimeoutSeconds,
    recordMaxLengthSeconds: settings.recordMaxLengthSeconds,
    greetingPrebufferMs: settings.greetingPrebufferMs,
    transportMode: settings.transportMode,
    playbackMode: settings.playbackMode,
  })

  emitNervesEvent({
    component: "senses",
    event: "senses.voice_twilio_transport_ready",
    message: "Twilio phone voice transport is ready",
    meta: {
      agentName: settings.agentName,
      localUrl: bridge.localUrl,
      publicBaseUrl: settings.publicBaseUrl,
      basePath: settings.basePath,
      webhookUrl: settings.webhookUrl,
      transportMode: settings.transportMode,
    },
  })

  return { status: "started", settings, bridge }
}

function createOutboundId(now: Date): string {
  const timestamp = now.toISOString().replace(/[^0-9A-Za-z]+/g, "").slice(0, 15)
  return `outbound-${timestamp}-${crypto.randomUUID().slice(0, 8)}`
}

function terminalOutboundStatus(status: string | undefined): boolean {
  const normalized = status?.trim().toLowerCase()
  return normalized === "completed"
    || normalized === "busy"
    || normalized === "no-answer"
    || normalized === "failed"
    || normalized === "canceled"
}

export async function placeConfiguredTwilioPhoneCall(
  options: PlaceConfiguredTwilioPhoneCallOptions,
  deps: TwilioPhoneOutboundCallRuntimeDeps = defaultTwilioPhoneOutboundCallRuntimeDeps,
): Promise<PlaceConfiguredTwilioPhoneCallResult> {
  const settings = await readFreshRuntimeSettings(
    options.agentName,
    undefined,
    agentScopedTwilioPhoneBasePath(options.agentName),
    true,
    deps,
  )
  const to = normalizeTwilioE164PhoneNumber(options.to)
  const from = normalizeTwilioE164PhoneNumber(settings.twilioFromNumber)
  if (!to) throw new Error("outbound voice call target must be an E.164 phone number")
  if (!from) throw new Error("missing voice.twilioFromNumber; save the Twilio caller number before outbound phone calls")
  if (!settings.twilioAccountSid?.trim()) throw new Error("missing voice.twilioAccountSid; save Twilio credentials before outbound phone calls")
  if (!settings.twilioAuthToken?.trim()) throw new Error("missing voice.twilioAuthToken; save Twilio credentials before outbound phone calls")
  const accountSid = settings.twilioAccountSid.trim()
  const authToken = settings.twilioAuthToken.trim()
  const now = options.now ?? new Date()
  const recent = await readRecentTwilioOutboundCallJobs({
    outputDir: settings.outputDir,
    to,
    friendId: options.friendId,
    sinceMs: options.redialGuardMs ?? 120_000,
    now: now.getTime(),
  })
  const activeRecent = recent.find((job) => !terminalOutboundStatus(job.status))
  if (activeRecent) {
    throw new Error("outbound voice call suppressed: a recent call to this friend/number is still active")
  }

  const outboundId = options.outboundId?.trim() || createOutboundId(now)
  const webhookUrl = twilioOutboundCallWebhookUrl(settings.publicBaseUrl, settings.basePath, outboundId)
  const statusCallbackUrl = twilioOutboundCallStatusCallbackUrl(settings.publicBaseUrl, settings.basePath, outboundId)
  await writeTwilioOutboundCallJob(settings.outputDir, {
    schemaVersion: 1,
    outboundId,
    agentName: options.agentName,
    ...(options.friendId?.trim() ? { friendId: options.friendId.trim() } : {}),
    to,
    from,
    reason: options.reason.trim(),
    createdAt: now.toISOString(),
    status: "requested",
  })

  try {
    const call = await deps.createOutboundCall({
      accountSid,
      authToken,
      to,
      from,
      twimlUrl: webhookUrl,
      statusCallbackUrl,
    })
    await updateTwilioOutboundCallJob(settings.outputDir, outboundId, {
      transportCallSid: call.callSid,
      status: call.status ?? "queued",
      events: [{ at: new Date().toISOString(), status: call.status ?? "queued", ...(call.callSid ? { callSid: call.callSid } : {}) }],
    })
    emitNervesEvent({
      component: "senses",
      event: "senses.voice_twilio_outbound_call_requested",
      message: "Twilio outbound voice call requested",
      meta: {
        agentName: options.agentName,
        outboundId: outboundId.replace(/[^A-Za-z0-9._-]+/g, "-"),
        callSid: call.callSid?.replace(/[^A-Za-z0-9._-]+/g, "-") ?? "unknown",
        status: call.status ?? "queued",
      },
    })
    return {
      outboundId,
      callSid: call.callSid,
      status: call.status,
      webhookUrl,
      statusCallbackUrl,
    }
  } catch (error) {
    await updateTwilioOutboundCallJob(settings.outputDir, outboundId, {
      status: "failed",
      error: errorMessage(error),
    })
    throw error
  }
}

export function closeTwilioPhoneBridgeServer(server: TwilioPhoneBridgeServer): Promise<void> {
  return Promise.all([
    server.bridge.close?.() ?? Promise.resolve(),
    new Promise<void>((resolve, reject) => {
      ;(server.server as Server).close((error?: Error) => error ? reject(error) : resolve())
    }),
  ]).then(() => undefined)
}
