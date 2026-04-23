import { normalizeMailAddress } from "./core"

export type DelegatedMailSourceSetupStatus =
  | "not_started"
  | "blocked_by_human"
  | "pending_propagation"
  | "ready"
  | "failed_recoverable"
  | "failed_manual_repair"

export type DelegatedMailHumanGate =
  | "browser_auth"
  | "mfa_or_captcha"
  | "export_download"
  | "forwarding_confirmation"

export interface DelegatedMailSourceBackfillState {
  status: DelegatedMailSourceSetupStatus
  scanned?: number
  imported?: number
  duplicates?: number
  sourceFreshThrough?: string | null
  completedAt?: string
}

export interface DelegatedMailSourceForwardingState {
  status: DelegatedMailSourceSetupStatus
  targetAlias: string
  browserAutomationOwner: "agent"
  humanRequired: DelegatedMailHumanGate[]
  verifiedAt?: string
  lastProbeMessageId?: string
  observedRecipient?: string | null
  expectedRecipient?: string
  recoveryAction?: string
}

export interface DelegatedMailSourceState {
  schemaVersion: 1
  agentId: string
  ownerEmail: string
  source: string
  aliasAddress: string
  backfill: DelegatedMailSourceBackfillState
  forwarding: DelegatedMailSourceForwardingState
}

export interface DelegatedMailSourceIdentityInput {
  agentId: string
  ownerEmail: string
  source: string
  aliasAddress: string
}

export interface MboxBackfillCompleteInput {
  scanned: number
  imported: number
  duplicates: number
  sourceFreshThrough: string | null
  completedAt: string
}

export interface ForwardingProbeInput {
  observedRecipient: string | null
  checkedAt: string
  messageId?: string
}

const HUMAN_REQUIRED: DelegatedMailHumanGate[] = [
  "browser_auth",
  "mfa_or_captcha",
  "export_download",
  "forwarding_confirmation",
]

function normalizedSource(source: string): string {
  const value = source.trim().toLowerCase()
  return value || "hey"
}

function normalizedAgentId(agentId: string): string {
  return agentId.trim().toLowerCase()
}

export function createDelegatedMailSourceState(input: DelegatedMailSourceIdentityInput): DelegatedMailSourceState {
  const aliasAddress = normalizeMailAddress(input.aliasAddress)
  return {
    schemaVersion: 1,
    agentId: normalizedAgentId(input.agentId),
    ownerEmail: normalizeMailAddress(input.ownerEmail),
    source: normalizedSource(input.source),
    aliasAddress,
    backfill: {
      status: "not_started",
    },
    forwarding: {
      status: "blocked_by_human",
      targetAlias: aliasAddress,
      browserAutomationOwner: "agent",
      humanRequired: [...HUMAN_REQUIRED],
    },
  }
}

export function markMboxBackfillComplete(
  state: DelegatedMailSourceState,
  input: MboxBackfillCompleteInput,
): DelegatedMailSourceState {
  return {
    ...state,
    backfill: {
      status: "ready",
      scanned: input.scanned,
      imported: input.imported,
      duplicates: input.duplicates,
      sourceFreshThrough: input.sourceFreshThrough,
      completedAt: input.completedAt,
    },
  }
}

export function markForwardingProbeResult(
  state: DelegatedMailSourceState,
  input: ForwardingProbeInput,
): DelegatedMailSourceState {
  const expectedRecipient = normalizeMailAddress(state.forwarding.targetAlias)
  if (!input.observedRecipient) {
    return {
      ...state,
      forwarding: {
        ...state.forwarding,
        status: "pending_propagation",
        observedRecipient: null,
        expectedRecipient,
        recoveryAction: "Wait briefly, then have Slugger re-check the delegated source alias before asking the human to change HEY again.",
      },
    }
  }

  const observedRecipient = normalizeMailAddress(input.observedRecipient)
  if (observedRecipient !== expectedRecipient) {
    return {
      ...state,
      forwarding: {
        ...state.forwarding,
        status: "failed_recoverable",
        observedRecipient,
        expectedRecipient,
        ...(input.messageId ? { lastProbeMessageId: input.messageId } : {}),
        recoveryAction: `HEY is forwarding to ${observedRecipient}. Slugger must correct the HEY forwarding target to ${expectedRecipient}; do not import or label that probe as delegated Ari HEY mail.`,
      },
    }
  }

  return {
    ...state,
    forwarding: {
      ...state.forwarding,
      status: "ready",
      observedRecipient,
      expectedRecipient,
      verifiedAt: input.checkedAt,
      ...(input.messageId ? { lastProbeMessageId: input.messageId } : {}),
    },
  }
}

export function renderDelegatedMailSourceNextStep(state: DelegatedMailSourceState): string {
  if (state.forwarding.status === "ready") {
    return `${state.source} forwarding is verified for ${state.aliasAddress}.`
  }
  return [
    `Slugger should continue ${state.source.toUpperCase()} setup with browser automation where it is safe.`,
    "The human remains at the keyboard for login, MFA/CAPTCHA, export download, and final forwarding confirmation.",
    `Forward ${state.ownerEmail}'s ${state.source} mailbox to ${state.aliasAddress}.`,
    "Do not use the native agent mailbox as the forwarding target.",
  ].join(" ")
}
