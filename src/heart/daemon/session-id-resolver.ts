// Pluggable session ID resolver for MCP conversations.
// Tries tool-specific methods first, falls back to UUID.
//
// Claude Code: walks parent PID chain → reads ~/.claude/sessions/{pid}.json
// Codex: reads thread_id from env
// Fallback: generates UUID
//
// Full implementation in Unit 8b; this initial version provides the
// interface and UUID fallback so send_message can work immediately.

import { randomUUID } from "crypto"
import { emitNervesEvent } from "../../nerves/runtime"

export interface SessionIdResolverOptions {
  /** Override the Claude sessions directory (for testing). */
  claudeSessionsDir?: string
}

/**
 * Resolve a session ID for the current MCP connection.
 * Returns a stable identifier that ties MCP tool calls to a conversation session.
 */
export function resolveSessionId(_options?: SessionIdResolverOptions): string {
  // Stub: UUID fallback until PID-walk is implemented in Unit 8b
  const sessionId = randomUUID()
  emitNervesEvent({
    component: "daemon",
    event: "daemon.session_id_resolved",
    message: "session ID resolved",
    meta: { sessionId, method: "uuid-fallback" },
  })
  return sessionId
}
