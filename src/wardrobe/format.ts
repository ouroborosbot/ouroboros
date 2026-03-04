// Shared formatting functions for tool results, kicks, and errors.
// Used by both CLI and Teams adapters for consistent output.

import { emitNervesEvent } from "../nerves/runtime"

export function formatToolResult(name: string, summary: string, success: boolean): string {
  emitNervesEvent({
    event: "channel.message_sent",
    component: "channels",
    message: "formatted tool result for channel output",
    meta: {
      kind: "tool_result",
      name,
      success,
      has_summary: summary.length > 0,
    },
  })

  if (success) {
    return "\u2713 " + name + (summary ? " (" + summary + ")" : "")
  }
  return "\u2717 " + name + ": " + summary
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
