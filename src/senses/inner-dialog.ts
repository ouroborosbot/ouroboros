import type OpenAI from "openai"
import * as fs from "fs"
import * as path from "path"
import { sessionPath } from "../config"
import { runAgent, type ChannelCallbacks } from "../heart/core"
import { getAgentRoot } from "../identity"
import { loadSession, postTurn, type UsageData } from "../mind/context"
import { captureTurnMemories } from "../mind/memory-capture"
import { buildSystem } from "../mind/prompt"
import { createTraceId } from "../nerves"
import { emitNervesEvent } from "../nerves/runtime"

export interface InnerDialogInstinct {
  id: string
  prompt: string
  enabled?: boolean
}

export interface InnerDialogState {
  cycleCount: number
  resting?: boolean
  lastHeartbeatAt?: string
}

export interface RunInnerDialogTurnOptions {
  reason?: "boot" | "heartbeat" | "instinct"
  instincts?: InnerDialogInstinct[]
  now?: () => Date
  signal?: AbortSignal
}

export interface InnerDialogTurnResult {
  messages: OpenAI.ChatCompletionMessageParam[]
  usage?: UsageData
  sessionPath: string
}

const DEFAULT_INNER_DIALOG_INSTINCTS: InnerDialogInstinct[] = [
  {
    id: "heartbeat_checkin",
    prompt: "Heartbeat instinct: check what changed, review priorities, and decide whether to keep resting or act.",
    enabled: true,
  },
]

function readAspirations(agentRoot: string): string {
  try {
    return fs.readFileSync(path.join(agentRoot, "psyche", "ASPIRATIONS.md"), "utf8").trim()
  } catch {
    return ""
  }
}

function instinctsPath(agentRoot: string): string {
  return path.join(agentRoot, "psyche", "inner-dialog-instincts.json")
}

export function loadInnerDialogInstincts(agentRoot = getAgentRoot()): InnerDialogInstinct[] {
  try {
    const raw = fs.readFileSync(instinctsPath(agentRoot), "utf8").trim()
    if (!raw) return [...DEFAULT_INNER_DIALOG_INSTINCTS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_INNER_DIALOG_INSTINCTS]
    const cleaned = parsed
      .filter((item): item is InnerDialogInstinct => Boolean(item && typeof item.id === "string" && typeof item.prompt === "string"))
      .filter((item) => item.enabled !== false)
    return cleaned.length > 0 ? cleaned : [...DEFAULT_INNER_DIALOG_INSTINCTS]
  } catch {
    return [...DEFAULT_INNER_DIALOG_INSTINCTS]
  }
}

export function buildInnerDialogBootstrapMessage(aspirations: string, stateSummary: string): string {
  const aspirationText = aspirations || "No explicit aspirations file found. Reflect and define what matters next."
  return [
    "Inner dialog boot.",
    "",
    "## aspirations",
    aspirationText,
    "",
    "## current state",
    stateSummary,
    "",
    "Orient yourself, decide what to do next, and make meaningful progress.",
  ].join("\n")
}

export function buildInstinctUserMessage(
  instincts: InnerDialogInstinct[],
  reason: "boot" | "heartbeat" | "instinct",
  state: InnerDialogState,
): string {
  const active = instincts.find((instinct) => instinct.enabled !== false) ?? DEFAULT_INNER_DIALOG_INSTINCTS[0]
  return [
    active.prompt,
    `reason: ${reason}`,
    `cycle: ${state.cycleCount}`,
    `resting: ${state.resting ? "yes" : "no"}`,
  ].join("\n")
}

function createInnerDialogCallbacks(): ChannelCallbacks {
  return {
    onModelStart: () => {},
    onModelStreamStart: () => {},
    onTextChunk: () => {},
    onReasoningChunk: () => {},
    onToolStart: () => {},
    onToolEnd: () => {},
    onError: () => {},
  }
}

export function innerDialogSessionPath(): string {
  return sessionPath("self", "inner", "dialog")
}

export async function runInnerDialogTurn(options?: RunInnerDialogTurnOptions): Promise<InnerDialogTurnResult> {
  const now = options?.now ?? (() => new Date())
  const reason = options?.reason ?? "heartbeat"
  const sessionFilePath = innerDialogSessionPath()
  const loaded = loadSession(sessionFilePath)
  const messages = loaded?.messages ? [...loaded.messages] : []
  const instincts = options?.instincts ?? loadInnerDialogInstincts()
  const state: InnerDialogState = {
    cycleCount: 1,
    resting: false,
    lastHeartbeatAt: now().toISOString(),
  }

  if (messages.length === 0) {
    const systemPrompt = await buildSystem("cli", { toolChoiceRequired: true })
    messages.push({ role: "system", content: systemPrompt })
    const aspirations = readAspirations(getAgentRoot())
    const bootstrapMessage = buildInnerDialogBootstrapMessage(aspirations, "No prior inner dialog session found.")
    messages.push({ role: "user", content: bootstrapMessage })
  } else {
    const assistantTurns = messages.filter((message) => message.role === "assistant").length
    state.cycleCount = assistantTurns + 1
    const instinctPrompt = buildInstinctUserMessage(instincts, reason, state)
    messages.push({ role: "user", content: instinctPrompt })
  }

  const callbacks = createInnerDialogCallbacks()
  const traceId = createTraceId()
  const result = await runAgent(messages, callbacks, "cli", options?.signal, {
    traceId,
    toolChoiceRequired: true,
    skipConfirmation: true,
  })

  postTurn(messages, sessionFilePath, result.usage, {
    beforeTrim: (snapshot) => captureTurnMemories(snapshot, "inner-dialog", now),
  })

  emitNervesEvent({
    component: "senses",
    event: "senses.inner_dialog_turn",
    message: "inner dialog turn completed",
    meta: { reason, session: sessionFilePath },
  })

  return {
    messages,
    usage: result.usage,
    sessionPath: sessionFilePath,
  }
}

