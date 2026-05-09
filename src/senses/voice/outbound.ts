import * as fs from "fs"
import * as path from "path"
import { isTrustedLevel, type FriendRecord } from "../../mind/friends/types"
import { normalizeTwilioE164PhoneNumber } from "./phone"
import type { VoiceCallAudioRequest } from "../../repertoire/tools-base"

export interface VoiceOutboundCallRequest {
  agentName: string
  agentRoot: string
  friendId: string
  reason: string
  phoneNumber?: string
  initialAudio?: VoiceCallAudioRequest
}

export type VoiceOutboundCallResult =
  | {
    status: "placed"
    detail: string
    friendId: string
    phoneNumber: string
    outboundId: string
    callSid?: string
    callStatus?: string
  }
  | {
    status: "blocked" | "failed"
    detail: string
  }

export function readVoiceOutboundFriendRecordById(friendsDir: string, friendId: string): FriendRecord | null {
  const recordPath = path.join(friendsDir, `${friendId}.json`)
  if (!fs.existsSync(recordPath)) return null
  try {
    return JSON.parse(fs.readFileSync(recordPath, "utf-8")) as FriendRecord
  } catch {
    return null
  }
}

function externalIdMatches(externalId: string, wanted: string, wantedPhone: string | undefined): boolean {
  const normalized = externalId.trim().toLowerCase()
  if (normalized === wanted) return true
  const phone = normalizeTwilioE164PhoneNumber(externalId)
  return Boolean(wantedPhone && phone === wantedPhone)
}

export function findVoiceOutboundFriendRecord(friendsDir: string, friendId: string): FriendRecord | null {
  const byId = readVoiceOutboundFriendRecordById(friendsDir, friendId)
  if (byId) return byId
  const normalized = friendId.trim().toLowerCase()
  if (!normalized) return null
  const normalizedPhone = normalizeTwilioE164PhoneNumber(friendId)
  try {
    const records = fs.readdirSync(friendsDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(friendsDir, file), "utf-8")) as FriendRecord
        } catch {
          return null
        }
      })
      .filter((record): record is FriendRecord => Boolean(record))

    return records.find((record) =>
      record.id === friendId
      || record.name?.toLowerCase() === normalized
      || record.externalIds?.some((externalId) => externalIdMatches(externalId.externalId, normalized, normalizedPhone))
    ) ?? records.find((record) => record.name?.toLowerCase().startsWith(normalized)) ?? null
  } catch {
    return null
  }
}

export function voiceOutboundPhoneNumberForFriend(friend: FriendRecord | null, explicitPhoneNumber?: string): string | undefined {
  const explicit = normalizeTwilioE164PhoneNumber(explicitPhoneNumber)
  if (explicit) return explicit
  for (const externalId of friend?.externalIds ?? []) {
    if (externalId.provider !== "imessage-handle") continue
    const phoneNumber = normalizeTwilioE164PhoneNumber(externalId.externalId)
    if (phoneNumber) return phoneNumber
  }
  return undefined
}

export async function placeTrustedFriendVoiceOutboundCall(
  request: VoiceOutboundCallRequest,
): Promise<VoiceOutboundCallResult> {
  const friendsDir = path.join(request.agentRoot, "friends")
  const friend = findVoiceOutboundFriendRecord(friendsDir, request.friendId)
  if (!friend) {
    return { status: "blocked", detail: "voice call requires a known friend record" }
  }
  if (!isTrustedLevel(friend.trustLevel)) {
    return { status: "blocked", detail: "voice calls are limited to trusted friends" }
  }
  const phoneNumber = voiceOutboundPhoneNumberForFriend(friend, request.phoneNumber)
  if (!phoneNumber) {
    return { status: "blocked", detail: "no phone number is available for voice call" }
  }

  try {
    const { placeConfiguredTwilioPhoneCall } = await import("./twilio-phone-runtime")
    const call = await placeConfiguredTwilioPhoneCall({
      agentName: request.agentName,
      friendId: friend.id,
      to: phoneNumber,
      reason: request.reason,
      ...(request.initialAudio ? { initialAudio: request.initialAudio } : {}),
    })
    return {
      status: "placed",
      detail: `voice call initiated${call.status ? ` (${call.status})` : ""}`,
      friendId: friend.id,
      phoneNumber,
      outboundId: call.outboundId,
      ...(call.callSid ? { callSid: call.callSid } : {}),
      ...(call.status ? { callStatus: call.status } : {}),
    }
  } catch (error) {
    return {
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}
