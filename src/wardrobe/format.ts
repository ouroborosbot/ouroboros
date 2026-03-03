// Shared formatting functions for tool results, kicks, and errors.
// Used by both CLI and Teams adapters for consistent output.

export function formatToolResult(name: string, summary: string, success: boolean): string {
  if (success) {
    return "\u2713 " + name + (summary ? " (" + summary + ")" : "")
  }
  return "\u2717 " + name + ": " + summary
}

export function formatKick(): string {
  return "\u21BB kick"
}

export function formatError(error: Error): string {
  return "Error: " + error.message
}
