import { existsSync, readFileSync } from "fs"

import { REQUIRED_ENVELOPE_FIELDS, SENSITIVE_PATTERNS } from "./contract"

export interface AuditInput {
  eventsPath: string
  logpointsPath: string
}

export interface RequiredAction {
  type: "coverage" | "logging"
  target: string
  reason: string
}

export interface SchemaRedactionCoverage {
  status: "pass" | "fail"
  checked_events: number
  violations: string[]
}

export interface NervesCoverageReport {
  overall_status: "pass" | "fail"
  required_actions: RequiredAction[]
  nerves_coverage: {
    schema_redaction: SchemaRedactionCoverage
  }
}

interface ParsedEvent {
  ts?: unknown
  level?: unknown
  event?: unknown
  trace_id?: unknown
  component?: unknown
  message?: unknown
  meta?: unknown
}

export function readEvents(eventsPath: string): ParsedEvent[] {
  if (!existsSync(eventsPath)) return []
  const raw = readFileSync(eventsPath, "utf8")
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean)
  const parsed: ParsedEvent[] = []

  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line) as ParsedEvent)
    } catch {
      // Keep parsing resilient for audit mode; malformed lines are handled
      // by schema violations below.
      parsed.push({})
    }
  }

  return parsed
}

export function collectObservedEventKeys(events: ParsedEvent[]): string[] {
  const observed = new Set<string>()
  for (const entry of events) {
    if (typeof entry.component === "string" && typeof entry.event === "string") {
      observed.add(`${entry.component}:${entry.event}`)
    }
  }
  return [...observed].sort()
}

export function validateSchemaAndRedaction(events: ParsedEvent[]): string[] {
  const violations: string[] = []

  events.forEach((entry, idx) => {
    for (const key of REQUIRED_ENVELOPE_FIELDS) {
      if (!(key in entry)) {
        violations.push(`event[${idx}] missing field '${key}'`)
      }
    }

    const mustBeString = ["ts", "level", "event", "trace_id", "component", "message"] as const
    for (const key of mustBeString) {
      const value = entry[key]
      if (typeof value !== "string" || value.trim().length === 0) {
        violations.push(`event[${idx}] invalid '${key}'`)
      }
    }

    if (typeof entry.meta !== "object" || entry.meta === null || Array.isArray(entry.meta)) {
      violations.push(`event[${idx}] invalid 'meta'`)
    }

    const message = typeof entry.message === "string" ? entry.message : ""
    const metaText = JSON.stringify(entry.meta ?? {})
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(message) || pattern.test(metaText)) {
        violations.push(`event[${idx}] matched redaction policy '${pattern.source}'`)
      }
    }
  })

  return violations
}

export function auditNervesCoverage(input: AuditInput): NervesCoverageReport {
  const events = readEvents(input.eventsPath)

  const schemaViolations = validateSchemaAndRedaction(events)
  const schemaStatus: "pass" | "fail" = schemaViolations.length === 0 ? "pass" : "fail"

  const requiredActions: RequiredAction[] = []
  if (schemaStatus === "fail") {
    requiredActions.push({
      type: "logging",
      target: "schema-redaction",
      reason: `schema/redaction violations: ${schemaViolations.slice(0, 3).join("; ")}`,
    })
  }

  const overallStatus: "pass" | "fail" = requiredActions.length === 0 ? "pass" : "fail"

  return {
    overall_status: overallStatus,
    required_actions: requiredActions,
    nerves_coverage: {
      schema_redaction: {
        status: schemaStatus,
        checked_events: events.length,
        violations: schemaViolations,
      },
    },
  }
}
