export const REQUIRED_ENVELOPE_FIELDS = [
  "ts",
  "level",
  "event",
  "trace_id",
  "component",
  "message",
  "meta",
] as const

export const SENSITIVE_PATTERNS: RegExp[] = [
  /\btoken\s*[:=]/i,
  /\bapi[_-]?key\b/i,
  /\bpassword\b/i,
  /\bsecret\b/i,
  /\bauthorization\b/i,
]

export function eventKey(component: string, event: string): string {
  return `${component}:${event}`
}
