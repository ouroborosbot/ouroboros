// Shared formatting functions for tool results, kicks, and errors.
// Used by both CLI and Teams adapters for consistent output.

import { emitNervesEvent } from "../nerves/runtime"

function compactSummary(summary: string): string {
  const oneLine = summary.replace(/\s+/g, " ").trim()
  if (oneLine.length <= 120) return oneLine
  return oneLine.slice(0, 120) + "..."
}

export function formatToolResult(name: string, summary: string, success: boolean): string {
  const compacted = compactSummary(summary)
  emitNervesEvent({
    event: "channel.message_sent",
    component: "channels",
    message: "formatted tool result for channel output",
    meta: {
      kind: "tool_result",
      name,
      success,
      has_summary: compacted.length > 0,
    },
  })

  if (success) {
    return "\u2713 " + name + (compacted ? " (" + compacted + ")" : "")
  }
  return "\u2717 " + name + ": " + compacted
}

export function formatKick(): string {
  emitNervesEvent({
    event: "channel.message_sent",
    component: "channels",
    message: "formatted kick message for channel output",
    meta: {
      kind: "kick",
    },
  })
  return "\u21BB kick"
}

export function formatError(error: Error): string {
  emitNervesEvent({
    level: "error",
    event: "channel.error",
    component: "channels",
    message: "formatted channel error message",
    meta: {
      kind: "error",
      error_message: error.message,
    },
  })

  return "Error: " + error.message
}
