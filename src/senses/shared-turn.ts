// Shared turn runner for non-interactive senses (MCP, future senses).
// Follows the CLI pattern: resolves context, constructs InboundTurnInput,
// calls handleInboundTurn, collects response text, detects ponder deferral.
//
// Does NOT refactor CLI — CLI is stable with 2280+ tests. This is a new
// code path for new senses that follows the same pipeline pattern.

import * as path from "path"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import type { ChannelCallbacks } from "../heart/core"
import { runAgent } from "../heart/core"
import { getAgentRoot } from "../heart/identity"
import { sessionPath } from "../heart/config"
import { loadSession } from "../mind/context"
import { buildSystem } from "../mind/prompt"
import { getChannelCapabilities } from "../mind/friends/channel"
import { FriendResolver } from "../mind/friends/resolver"
import { FileFriendStore } from "../mind/friends/store-file"
import { getPendingDir, drainPending } from "../mind/pending"
import { postTurn } from "../mind/context"
import { accumulateFriendTokens } from "../mind/friends/tokens"
import { enforceTrustGate } from "./trust-gate"
import { handleInboundTurn } from "./pipeline"
import type { Channel } from "../mind/friends/types"
import { emitNervesEvent } from "../nerves/runtime"

const RESPONSE_CAP = 50_000

export interface RunSenseTurnOptions {
  /** Agent name (bundle name). */
  agentName: string
  /** Channel identifier (e.g. "mcp"). */
  channel: Channel
  /** Session key for this conversation. */
  sessionKey: string
  /** Friend ID for identity resolution. */
  friendId: string
  /** The user's message text. */
  userMessage: string
}

export interface RunSenseTurnResult {
  /** The agent's text response (accumulated from onTextChunk). */
  response: string
  /** True when the agent pondered — caller should tell the user to check back. */
  ponderDeferred: boolean
}

/**
 * Run a single agent turn through the inbound pipeline.
 * Caller provides channel, session key, friend, and message;
 * this function handles all pipeline wiring.
 */
export async function runSenseTurn(options: RunSenseTurnOptions): Promise<RunSenseTurnResult> {
  const { agentName, channel, sessionKey, friendId, userMessage } = options

  emitNervesEvent({
    component: "senses",
    event: "senses.shared_turn_start",
    message: "shared turn runner starting",
    meta: { agentName, channel, sessionKey, friendId },
  })

  // Resolve context
  const agentRoot = getAgentRoot(agentName)
  const friendsPath = path.join(agentRoot, "friends")
  const friendStore = new FileFriendStore(friendsPath)
  const capabilities = getChannelCapabilities(channel)

  const resolver = new FriendResolver(friendStore, {
    provider: "local" as const,
    externalId: friendId,
    displayName: friendId,
    channel,
  })

  // Session path and loading
  const sessPath = sessionPath(friendId, channel, sessionKey)
  const existing = loadSession(sessPath)
  let sessionState = existing?.state
  const sessionMessages: ChatCompletionMessageParam[] = existing?.messages && existing.messages.length > 0
    ? existing.messages
    : [{ role: "system", content: await buildSystem(channel, {}, undefined) }]

  // Pending dir
  const pendingDir = getPendingDir(agentName, friendId, channel, sessionKey)

  // Accumulate response text via callbacks
  let responseText = ""
  const callbacks: ChannelCallbacks = {
    onModelStart: () => {},
    onModelStreamStart: () => {},
    onTextChunk: (chunk: string) => { responseText += chunk },
    onReasoningChunk: () => {},
    onToolStart: () => {},
    onToolEnd: () => {},
    onError: () => {},
  }

  // Run the pipeline
  const result = await handleInboundTurn({
    channel,
    sessionKey,
    capabilities,
    messages: [{ role: "user", content: userMessage }],
    callbacks,
    friendResolver: { resolve: () => resolver.resolve() },
    sessionLoader: {
      loadOrCreate: () => Promise.resolve({
        messages: sessionMessages,
        sessionPath: sessPath,
        state: sessionState,
      }),
    },
    pendingDir,
    friendStore,
    provider: "local",
    externalId: friendId,
    enforceTrustGate,
    drainPending,
    runAgent: (msgs, cb, ch, sig, opts) => runAgent(msgs, cb, ch, sig, opts),
    postTurn: (turnMessages, sessionPathArg, usage, hooks, state) => {
      postTurn(turnMessages, sessionPathArg, usage, hooks, state)
      sessionState = state
    },
    accumulateFriendTokens,
  })

  // Detect ponder deferral
  const ponderDeferred = result.turnOutcome === "pondered"

  // Build response
  let finalResponse: string
  if (ponderDeferred) {
    finalResponse = "the agent is pondering this — check back shortly via check_response."
  } else if (responseText.length === 0) {
    // Gate rejection or empty response
    finalResponse = ""
  } else {
    finalResponse = responseText
  }

  // Cap response length
  if (finalResponse.length > RESPONSE_CAP) {
    finalResponse = finalResponse.slice(0, RESPONSE_CAP) + "\n\n[truncated — response exceeded 50K characters]"
  }

  emitNervesEvent({
    component: "senses",
    event: "senses.shared_turn_end",
    message: "shared turn runner complete",
    meta: { agentName, channel, sessionKey, friendId, ponderDeferred, responseLength: finalResponse.length },
  })

  return { response: finalResponse, ponderDeferred }
}
