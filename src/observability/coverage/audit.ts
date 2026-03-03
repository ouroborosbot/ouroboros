import { existsSync, readFileSync } from "fs"

import { REQUIRED_ENVELOPE_FIELDS, SENSITIVE_PATTERNS, getRequiredEventKeys } from "./contract"

export interface AuditInput {
  eventsPath: string
  logpointsPath: string
}

export interface RequiredAction {
  type: "coverage" | "logging"
  target: string
  reason: string
}

export interface EventCatalogCoverage {
  status: "pass" | "fail"
  required: number
  observed: number
  missing: string[]
}

export interface SchemaRedactionCoverage {
  status: "pass" | "fail"
  checked_events: number
  violations: string[]
}

export interface LogpointCoverage {
  status: "pass" | "fail"
  declared: number
  observed: number
  missing: string[]
}

export interface ObservabilityCoverageReport {
  overall_status: "pass" | "fail"
  required_actions: RequiredAction[]
  observability_coverage: {
    event_catalog: EventCatalogCoverage
    schema_redaction: SchemaRedactionCoverage
    logpoint_coverage: LogpointCoverage
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

interface LogpointsPayload {
  declared?: unknown
  observed?: unknown
}

function readEvents(eventsPath: string): ParsedEvent[] {
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function collectObservedEventKeys(events: ParsedEvent[]): string[] {
  const observed = new Set<string>()
  for (const entry of events) {
    if (typeof entry.component === "string" && typeof entry.event === "string") {
      observed.add(`${entry.component}:${entry.event}`)
    }
  }
  return [...observed].sort()
}

function validateSchemaAndRedaction(events: ParsedEvent[]): string[] {
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

export function auditObservabilityCoverage(input: AuditInput): ObservabilityCoverageReport {
  const events = readEvents(input.eventsPath)
  const observedEventKeys = collectObservedEventKeys(events)
  const requiredEventKeys = getRequiredEventKeys()

  const missingEvents = requiredEventKeys.filter((key) => !observedEventKeys.includes(key))
  const eventCatalogStatus: "pass" | "fail" = missingEvents.length === 0 ? "pass" : "fail"

  const schemaViolations = validateSchemaAndRedaction(events)
  const schemaStatus: "pass" | "fail" = schemaViolations.length === 0 ? "pass" : "fail"

  let declaredLogpoints: string[] = []
  let observedLogpoints: string[] = observedEventKeys

  if (existsSync(input.logpointsPath)) {
    try {
      const payload = JSON.parse(readFileSync(input.logpointsPath, "utf8")) as LogpointsPayload
      declaredLogpoints = asStringArray(payload.declared)
      const capturedObserved = asStringArray(payload.observed)
      if (capturedObserved.length > 0) {
        observedLogpoints = [...new Set([...observedEventKeys, ...capturedObserved])].sort()
      }
    } catch {
      declaredLogpoints = []
      observedLogpoints = []
    }
  }

  if (declaredLogpoints.length === 0) {
    declaredLogpoints = requiredEventKeys
  }

  const missingLogpoints = declaredLogpoints.filter((key) => !observedLogpoints.includes(key))
  const logpointStatus: "pass" | "fail" = missingLogpoints.length === 0 ? "pass" : "fail"

  const requiredActions: RequiredAction[] = []
  if (eventCatalogStatus === "fail") {
    requiredActions.push({
      type: "logging",
      target: "event-catalog",
      reason: `missing required events: ${missingEvents.slice(0, 5).join(", ")}`,
    })
  }
  if (schemaStatus === "fail") {
    requiredActions.push({
      type: "logging",
      target: "schema-redaction",
      reason: `schema/redaction violations: ${schemaViolations.slice(0, 3).join("; ")}`,
    })
  }
  if (logpointStatus === "fail") {
    requiredActions.push({
      type: "logging",
      target: "logpoint-coverage",
      reason: `missing declared logpoints: ${missingLogpoints.slice(0, 5).join(", ")}`,
    })
  }

  const overallStatus: "pass" | "fail" = requiredActions.length === 0 ? "pass" : "fail"

  return {
    overall_status: overallStatus,
    required_actions: requiredActions,
    observability_coverage: {
      event_catalog: {
        status: eventCatalogStatus,
        required: requiredEventKeys.length,
        observed: observedEventKeys.length,
        missing: missingEvents,
      },
      schema_redaction: {
        status: schemaStatus,
        checked_events: events.length,
        violations: schemaViolations,
      },
      logpoint_coverage: {
        status: logpointStatus,
        declared: declaredLogpoints.length,
        observed: observedLogpoints.length,
        missing: missingLogpoints,
      },
    },
  }
}
