import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import { emitNervesEvent } from "../nerves/runtime"
import {
  buildConfirmedMailSendDecision,
  evaluateNativeMailSendPolicy,
} from "./autonomy"
import {
  normalizeMailAddress,
  type MailAutonomyPolicy,
  type MailDecisionActor,
  type MailOutboundRecord,
} from "./core"
import type { MailroomStore } from "./file-store"

export type MailOutboundTransport =
  | { kind: "local-sink"; sinkPath: string }
  | { kind: "azure-communication-services"; endpoint: string; senderAddress?: string }

export interface CreateMailDraftInput {
  store: MailroomStore
  agentId: string
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text: string
  actor: MailDecisionActor
  reason: string
  now?: () => Date
}

export interface ConfirmMailDraftSendInput {
  store: MailroomStore
  agentId: string
  draftId: string
  transport: MailOutboundTransport
  confirmation: string
  actor: MailDecisionActor
  reason: string
  autonomous?: boolean
  autonomyPolicy?: MailAutonomyPolicy
  now?: () => Date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function textField(value: Record<string, unknown>, key: string): string {
  const raw = value[key]
  return typeof raw === "string" ? raw.trim() : ""
}

function normalizeList(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeMailAddress)
}

function draftId(): string {
  return `draft_${crypto.randomBytes(12).toString("hex")}`
}

function ensureRecipients(to: string[]): void {
  if (to.length === 0) throw new Error("at least one recipient is required")
}

export function resolveOutboundTransport(config: unknown): MailOutboundTransport {
  const outbound = isRecord(config) && isRecord(config.outbound) ? config.outbound : null
  if (!outbound) {
    throw new Error("outbound mail transport is not configured; human-required: set mailroom.outbound before confirmed sends")
  }
  const transport = textField(outbound, "transport")
  if (transport === "local-sink") {
    const sinkPath = textField(outbound, "sinkPath")
    if (!sinkPath) throw new Error("outbound local-sink transport is missing sinkPath")
    return { kind: "local-sink", sinkPath }
  }
  if (transport === "azure-communication-services") {
    const endpoint = textField(outbound, "endpoint")
    if (!endpoint) throw new Error("outbound Azure Communication Services transport is missing endpoint")
    const senderAddress = textField(outbound, "senderAddress")
    return {
      kind: "azure-communication-services",
      endpoint,
      ...(senderAddress ? { senderAddress } : {}),
    }
  }
  throw new Error("outbound mail transport is not configured; human-required: choose local-sink or azure-communication-services")
}

export async function createMailDraft(input: CreateMailDraftInput): Promise<MailOutboundRecord> {
  const now = (input.now ?? (() => new Date()))().toISOString()
  const to = normalizeList(input.to)
  ensureRecipients(to)
  const record: MailOutboundRecord = {
    schemaVersion: 1,
    id: draftId(),
    agentId: input.agentId,
    status: "draft",
    mailboxRole: "agent-native-mailbox",
    sendAuthority: "agent-native",
    ownerEmail: null,
    source: null,
    from: normalizeMailAddress(input.from),
    to,
    cc: normalizeList(input.cc ?? []),
    bcc: normalizeList(input.bcc ?? []),
    subject: input.subject.trim(),
    text: input.text,
    actor: input.actor,
    reason: input.reason,
    createdAt: now,
    updatedAt: now,
  }
  await input.store.upsertMailOutbound(record)
  emitNervesEvent({
    component: "senses",
    event: "senses.mail_draft_created",
    message: "mail draft created",
    meta: { agentId: record.agentId, id: record.id, toCount: record.to.length },
  })
  return record
}

function appendLocalSink(transport: Extract<MailOutboundTransport, { kind: "local-sink" }>, record: MailOutboundRecord, sentAt: string): string {
  fs.mkdirSync(path.dirname(transport.sinkPath), { recursive: true })
  const transportMessageId = `local_${crypto.randomBytes(10).toString("hex")}`
  fs.appendFileSync(transport.sinkPath, `${JSON.stringify({
    schemaVersion: 1,
    transportMessageId,
    draftId: record.id,
    agentId: record.agentId,
    from: record.from,
    to: record.to,
    cc: record.cc,
    bcc: record.bcc,
    subject: record.subject,
    text: record.text,
    sendMode: record.sendMode,
    policyId: record.policyDecision?.policyId ?? null,
    sentAt,
  })}\n`, "utf-8")
  return transportMessageId
}

function transportSend(transport: MailOutboundTransport, record: MailOutboundRecord, sentAt: string): string {
  if (transport.kind === "local-sink") return appendLocalSink(transport, record, sentAt)
  throw new Error("Azure Communication Services outbound send is configured but not enabled on this machine; human-required setup is still needed")
}

export async function confirmMailDraftSend(input: ConfirmMailDraftSendInput): Promise<MailOutboundRecord> {
  const draft = await input.store.getMailOutbound(input.draftId)
  if (!draft || draft.agentId !== input.agentId) throw new Error(`No draft found for ${input.draftId}`)
  if (draft.status !== "draft") throw new Error(`Draft ${input.draftId} is already ${draft.status}`)

  const sentAt = (input.now ?? (() => new Date()))().toISOString()
  const recentOutbound = await input.store.listMailOutbound(input.agentId)
  const policyDecision = input.autonomous
    ? (() => {
        if (!input.autonomyPolicy) {
          throw new Error("Autonomous mail sending requires an enabled native-agent policy")
        }
        const decision = evaluateNativeMailSendPolicy({
          policy: input.autonomyPolicy,
          draft,
          recentOutbound,
          now: new Date(sentAt),
        })
        if (!decision.allowed) {
          if (decision.mode === "confirmation-required") {
            throw new Error(`Autonomous mail send ${decision.code} requires confirmation=CONFIRM_SEND: ${decision.reason}`)
          }
          throw new Error(`${decision.code}: ${decision.reason}`)
        }
        return decision
      })()
    : (() => {
        if (input.confirmation !== "CONFIRM_SEND") {
          throw new Error("mail_send requires confirmation=CONFIRM_SEND before any outbound mail leaves the agent")
        }
        return buildConfirmedMailSendDecision({
          draft,
          policy: input.autonomyPolicy,
          now: new Date(sentAt),
        })
      })()
  const pendingSent: MailOutboundRecord = {
    ...draft,
    status: "sent",
    actor: input.actor,
    reason: input.reason,
    updatedAt: sentAt,
    sendMode: input.autonomous ? "autonomous" : "confirmed",
    policyDecision,
    sentAt,
  }
  const transportMessageId = transportSend(input.transport, pendingSent, sentAt)
  const sent: MailOutboundRecord = {
    ...pendingSent,
    transport: input.transport.kind,
    transportMessageId,
  }
  await input.store.upsertMailOutbound(sent)
  emitNervesEvent({
    component: "senses",
    event: "senses.mail_draft_sent",
    message: "mail draft sent",
    meta: { agentId: sent.agentId, id: sent.id, transport: sent.transport },
  })
  return sent
}

export function listMailOutboundRecords(store: MailroomStore, agentId: string): Promise<MailOutboundRecord[]> {
  return store.listMailOutbound(agentId)
}
