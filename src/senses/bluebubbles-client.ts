import { randomUUID } from "node:crypto"
import { getBlueBubblesChannelConfig, getBlueBubblesConfig } from "../heart/config"
import { emitNervesEvent } from "../nerves/runtime"
import type { BlueBubblesChatRef, BlueBubblesNormalizedEvent } from "./bluebubbles-model"

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

function buildBlueBubblesApiUrl(baseUrl: string, endpoint: string, password: string): string {
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  const url = new URL(endpoint.replace(/^\//, ""), root)
  url.searchParams.set("password", password)
  return url.toString()
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
      emitNervesEvent({
        component: "senses",
        event: "senses.bluebubbles_repair_passthrough",
        message: "bluebubbles event repair passthrough",
        meta: {
          kind: event.kind,
          requiresRepair: event.requiresRepair,
          messageGuid: event.messageGuid,
        },
      })
      return event
    },
  }
}
