import { randomUUID } from "node:crypto"
import { getBlueBubblesChannelConfig, getBlueBubblesConfig } from "../heart/config"
import { emitNervesEvent } from "../nerves/runtime"
import { normalizeBlueBubblesEvent, type BlueBubblesChatRef, type BlueBubblesNormalizedEvent } from "./bluebubbles-model"

export interface BlueBubblesSendTextParams {
  chat: BlueBubblesChatRef
  text: string
  replyToMessageGuid?: string
}

export interface BlueBubblesSendTextResult {
  messageGuid?: string
}

export interface BlueBubblesClient {
  sendText(params: BlueBubblesSendTextParams): Promise<BlueBubblesSendTextResult>
  repairEvent(event: BlueBubblesNormalizedEvent): Promise<BlueBubblesNormalizedEvent>
}

type ClientConfig = ReturnType<typeof getBlueBubblesConfig>
type ChannelConfig = ReturnType<typeof getBlueBubblesChannelConfig>
type JsonRecord = Record<string, unknown>

function buildBlueBubblesApiUrl(baseUrl: string, endpoint: string, password: string): string {
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  const url = new URL(endpoint.replace(/^\//, ""), root)
  url.searchParams.set("password", password)
  return url.toString()
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function extractMessageGuid(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined
  const record = payload as Record<string, unknown>
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null
  const candidates = [
    record.messageGuid,
    record.messageId,
    record.guid,
    data?.messageGuid,
    data?.messageId,
    data?.guid,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }
  return undefined
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const raw = await response.text()
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function buildRepairUrl(baseUrl: string, messageGuid: string, password: string): string {
  const url = buildBlueBubblesApiUrl(baseUrl, `/api/v1/message/${encodeURIComponent(messageGuid)}`, password)
  const parsed = new URL(url)
  parsed.searchParams.set("with", "attachments,payloadData,chats,messageSummaryInfo")
  return parsed.toString()
}

function collectPreviewStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 4 || out.length >= 4) return
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed) out.push(trimmed)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectPreviewStrings(entry, out, depth + 1)
    return
  }
  const record = asRecord(value)
  if (!record) return
  const preferredKeys = ["title", "summary", "subtitle", "previewText", "siteName", "host", "url"]
  for (const key of preferredKeys) {
    if (out.length >= 4) break
    collectPreviewStrings(record[key], out, depth + 1)
  }
}

function extractLinkPreviewText(data: JsonRecord): string | undefined {
  const values: string[] = []
  collectPreviewStrings(data.payloadData, values)
  collectPreviewStrings(data.messageSummaryInfo, values)
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  if (unique.length === 0) return undefined
  return unique.slice(0, 2).join(" — ")
}

function applyRepairNotice(event: BlueBubblesNormalizedEvent, notice: string): BlueBubblesNormalizedEvent {
  return {
    ...event,
    requiresRepair: false,
    repairNotice: notice,
  }
}

function hydrateTextForAgent(event: BlueBubblesNormalizedEvent, rawData: JsonRecord): BlueBubblesNormalizedEvent {
  if (event.kind !== "message") {
    return { ...event, requiresRepair: false }
  }
  if (event.balloonBundleId !== "com.apple.messages.URLBalloonProvider") {
    return { ...event, requiresRepair: false }
  }

  const previewText = extractLinkPreviewText(rawData)
  if (!previewText) {
    return { ...event, requiresRepair: false }
  }

  const base = event.text.trim()
  const textForAgent = base
    ? `${base}\n[link preview: ${previewText}]`
    : `[link preview: ${previewText}]`

  return {
    ...event,
    textForAgent,
    requiresRepair: false,
  }
}

function extractRepairData(payload: unknown): JsonRecord | null {
  const record = asRecord(payload)
  return asRecord(record?.data) ?? record
}

export function createBlueBubblesClient(
  config: ClientConfig = getBlueBubblesConfig(),
  channelConfig: ChannelConfig = getBlueBubblesChannelConfig(),
): BlueBubblesClient {
  return {
    async sendText(params: BlueBubblesSendTextParams): Promise<BlueBubblesSendTextResult> {
      const trimmedText = params.text.trim()
      if (!trimmedText) {
        throw new Error("BlueBubbles send requires non-empty text.")
      }
      if (!params.chat.chatGuid) {
        throw new Error("BlueBubbles send currently requires chat.chatGuid from the inbound event.")
      }

      const url = buildBlueBubblesApiUrl(config.serverUrl, "/api/v1/message/text", config.password)
      const body: Record<string, unknown> = {
        chatGuid: params.chat.chatGuid,
        tempGuid: randomUUID(),
        message: trimmedText,
      }
      if (params.replyToMessageGuid?.trim()) {
        body.method = "private-api"
        body.selectedMessageGuid = params.replyToMessageGuid.trim()
        body.partIndex = 0
      }

      emitNervesEvent({
        component: "senses",
        event: "senses.bluebubbles_send_start",
        message: "sending bluebubbles message",
        meta: {
          chatGuid: params.chat.chatGuid,
          hasReplyTarget: Boolean(params.replyToMessageGuid?.trim()),
        },
      })

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(channelConfig.requestTimeoutMs),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        emitNervesEvent({
          level: "error",
          component: "senses",
          event: "senses.bluebubbles_send_error",
          message: "bluebubbles send failed",
          meta: {
            status: response.status,
            reason: errorText || "unknown",
          },
        })
        throw new Error(`BlueBubbles send failed (${response.status}): ${errorText || "unknown"}`)
      }

      const payload = await parseJsonBody(response)
      const messageGuid = extractMessageGuid(payload)

      emitNervesEvent({
        component: "senses",
        event: "senses.bluebubbles_send_end",
        message: "bluebubbles message sent",
        meta: {
          chatGuid: params.chat.chatGuid,
          messageGuid: messageGuid ?? null,
        },
      })

      return { messageGuid }
    },

    async repairEvent(event: BlueBubblesNormalizedEvent): Promise<BlueBubblesNormalizedEvent> {
      if (!event.requiresRepair) {
        emitNervesEvent({
          component: "senses",
          event: "senses.bluebubbles_repair_skipped",
          message: "bluebubbles event repair skipped",
          meta: {
            kind: event.kind,
            messageGuid: event.messageGuid,
          },
        })
        return event
      }

      emitNervesEvent({
        component: "senses",
        event: "senses.bluebubbles_repair_start",
        message: "repairing bluebubbles event by guid",
        meta: {
          kind: event.kind,
          messageGuid: event.messageGuid,
          eventType: event.eventType,
        },
      })

      const url = buildRepairUrl(config.serverUrl, event.messageGuid, config.password)

      try {
        const response = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(channelConfig.requestTimeoutMs),
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => "")
          const repaired = applyRepairNotice(
            event,
            `BlueBubbles repair failed: ${errorText || `HTTP ${response.status}`}`,
          )
          emitNervesEvent({
            level: "warn",
            component: "senses",
            event: "senses.bluebubbles_repair_error",
            message: "bluebubbles repair request failed",
            meta: {
              messageGuid: event.messageGuid,
              status: response.status,
              reason: errorText || "unknown",
            },
          })
          return repaired
        }

        const payload = await parseJsonBody(response)
        const data = extractRepairData(payload)
        if (!data || typeof data.guid !== "string") {
          const repaired = applyRepairNotice(event, "BlueBubbles repair failed: invalid message payload")
          emitNervesEvent({
            level: "warn",
            component: "senses",
            event: "senses.bluebubbles_repair_error",
            message: "bluebubbles repair returned unusable payload",
            meta: {
              messageGuid: event.messageGuid,
            },
          })
          return repaired
        }

        const normalized = normalizeBlueBubblesEvent({
          type: event.eventType,
          data,
        })
        const hydrated = hydrateTextForAgent(normalized, data)
        emitNervesEvent({
          component: "senses",
          event: "senses.bluebubbles_repair_end",
          message: "bluebubbles event repaired",
          meta: {
            kind: hydrated.kind,
            messageGuid: hydrated.messageGuid,
            repairedFrom: event.kind,
          },
        })
        return hydrated
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        emitNervesEvent({
          level: "warn",
          component: "senses",
          event: "senses.bluebubbles_repair_error",
          message: "bluebubbles repair threw",
          meta: {
            messageGuid: event.messageGuid,
            reason,
          },
        })
        return applyRepairNotice(event, `BlueBubbles repair failed: ${reason}`)
      }

    },
  }
}
