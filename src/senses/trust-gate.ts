import * as fs from "fs"
import * as path from "path"
import { getAgentRoot } from "../heart/identity"
import { emitNervesEvent } from "../nerves/runtime"
import type { Channel, FriendRecord, IdentityProvider, SenseOpenness } from "../mind/friends/types"

export const STRANGER_AUTO_REPLY = "I'm sorry, I'm not allowed to talk to strangers"

interface StrangerRepliesState {
  [externalKey: string]: string
}

export interface TrustGateInput {
  friend: FriendRecord
  provider: IdentityProvider
  externalId: string
  tenantId?: string
  channel: Channel
  senseOpenness?: SenseOpenness
  bundleRoot?: string
  now?: () => Date
}

export type TrustGateResult =
  | { allowed: true }
  | { allowed: true; restricted: true }
  | { allowed: false; reason: "stranger_first_reply"; autoReply: string }
  | { allowed: false; reason: "stranger_silent_drop" }

function buildExternalKey(provider: IdentityProvider, externalId: string, tenantId?: string): string {
  return `${provider}:${tenantId ?? ""}:${externalId}`
}

function loadRepliesState(repliesPath: string): StrangerRepliesState {
  try {
    if (!fs.existsSync(repliesPath)) return {}
    const raw = fs.readFileSync(repliesPath, "utf8").trim()
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as StrangerRepliesState
  } catch {
    return {}
  }
}

function persistRepliesState(repliesPath: string, state: StrangerRepliesState): void {
  fs.writeFileSync(repliesPath, JSON.stringify(state, null, 2) + "\n", "utf8")
}

function appendPrimaryNotification(
  bundleRoot: string,
  provider: IdentityProvider,
  externalId: string,
  tenantId: string | undefined,
  nowIso: string,
): void {
  const inboxDir = path.join(bundleRoot, "inbox")
  const notificationsPath = path.join(inboxDir, "primary-notifications.jsonl")
  const message = `Unknown contact tried to message me. Want to add them? Use ouro link <agent> --friend <id> --provider ${provider} --external-id ${externalId}.`

  const payload = {
    type: "stranger_contact",
    at: nowIso,
    provider,
    externalId,
    tenantId: tenantId ?? null,
    message,
  }

  fs.mkdirSync(inboxDir, { recursive: true })
  fs.appendFileSync(notificationsPath, `${JSON.stringify(payload)}\n`, "utf8")
}

export function enforceTrustGate(input: TrustGateInput): TrustGateResult {
  const trustLevel = input.friend.trustLevel ?? "friend"
  if (trustLevel !== "stranger") {
    return { allowed: true }
  }

  // Closed senses allow strangers through with restricted tools
  const openness = input.senseOpenness ?? "open"
  if (openness === "closed") {
    emitNervesEvent({
      component: "senses",
      event: "senses.trust_gate",
      message: "stranger allowed on closed sense with restriction",
      meta: {
        channel: input.channel,
        provider: input.provider,
      },
    })
    return { allowed: true, restricted: true }
  }

  // Open senses hard-reject strangers
  const bundleRoot = input.bundleRoot ?? getAgentRoot()
  const repliesPath = path.join(bundleRoot, "stranger-replies.json")
  const nowIso = (input.now ?? (() => new Date()))().toISOString()
  const externalKey = buildExternalKey(input.provider, input.externalId, input.tenantId)

  const state = loadRepliesState(repliesPath)
  if (state[externalKey]) {
    emitNervesEvent({
      level: "warn",
      component: "senses",
      event: "senses.trust_gate",
      message: "stranger message silently dropped",
      meta: {
        channel: input.channel,
        provider: input.provider,
      },
    })
    return {
      allowed: false,
      reason: "stranger_silent_drop",
    }
  }

  state[externalKey] = nowIso

  try {
    persistRepliesState(repliesPath, state)
  } catch (error) {
    emitNervesEvent({
      level: "error",
      component: "senses",
      event: "senses.trust_gate_error",
      message: "failed to persist stranger reply state",
      meta: {
        reason: error instanceof Error ? error.message : String(error),
      },
    })
  }

  try {
    appendPrimaryNotification(bundleRoot, input.provider, input.externalId, input.tenantId, nowIso)
  } catch (error) {
    emitNervesEvent({
      level: "error",
      component: "senses",
      event: "senses.trust_gate_error",
      message: "failed to persist primary stranger notification",
      meta: {
        reason: error instanceof Error ? error.message : String(error),
      },
    })
  }

  emitNervesEvent({
    level: "warn",
    component: "senses",
    event: "senses.trust_gate",
    message: "stranger message blocked before model invocation",
    meta: {
      channel: input.channel,
      provider: input.provider,
    },
  })

  return {
    allowed: false,
    reason: "stranger_first_reply",
    autoReply: STRANGER_AUTO_REPLY,
  }
}
