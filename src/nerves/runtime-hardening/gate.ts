import { existsSync, readFileSync } from "fs"

export type RuntimeHardeningActionType = "artifact" | "capacity" | "latency" | "reliability"

export interface RuntimeHardeningRequiredAction {
  type: RuntimeHardeningActionType
  target: string
  reason: string
}

export interface RuntimeHardeningLoadValidationPayload {
  schema_version: string
  target_concurrency: number
  metrics: {
    first_feedback_p95_ms: number
    simple_turn_final_p95_ms: number
    tool_turn_final_p95_ms: number
    error_rate: number
  }
}

export interface RuntimeHardeningReport {
  overall_status: "pass" | "fail"
  required_actions: RuntimeHardeningRequiredAction[]
  runtime_hardening: {
    status: "pass" | "fail"
    target_concurrency: {
      status: "pass" | "fail"
      expected_min: number
      observed: number | null
    }
    first_feedback_p95_ms: {
      status: "pass" | "fail"
      threshold_ms: number
      observed_ms: number | null
    }
    simple_turn_final_p95_ms: {
      status: "pass" | "fail"
      threshold_ms: number
      observed_ms: number | null
    }
    tool_turn_final_p95_ms: {
      status: "pass" | "fail"
      threshold_ms: number
      observed_ms: number | null
    }
    error_rate: {
      status: "pass" | "fail"
      threshold_max_exclusive: number
      observed: number | null
    }
  }
}

export interface EvaluateRuntimeHardeningInput {
  artifactPath: string
  payload?: unknown
}

const MIN_CONCURRENCY = 10
const FIRST_FEEDBACK_P95_MAX_MS = 2000
const SIMPLE_FINAL_P95_MAX_MS = 9000
const TOOL_FINAL_P95_MAX_MS = 30000
const ERROR_RATE_MAX_EXCLUSIVE = 0.01

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function parsePayload(raw: unknown): RuntimeHardeningLoadValidationPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const typed = raw as Record<string, unknown>
  const metricsRaw = typed.metrics
  if (!metricsRaw || typeof metricsRaw !== "object" || Array.isArray(metricsRaw)) return null
  const metrics = metricsRaw as Record<string, unknown>

  const payload: RuntimeHardeningLoadValidationPayload = {
    schema_version: typeof typed.schema_version === "string" ? typed.schema_version : "",
    target_concurrency: toNumber(typed.target_concurrency) ?? NaN,
    metrics: {
      first_feedback_p95_ms: toNumber(metrics.first_feedback_p95_ms) ?? NaN,
      simple_turn_final_p95_ms: toNumber(metrics.simple_turn_final_p95_ms) ?? NaN,
      tool_turn_final_p95_ms: toNumber(metrics.tool_turn_final_p95_ms) ?? NaN,
      error_rate: toNumber(metrics.error_rate) ?? NaN,
    },
  }

  const hasValidSchemaVersion = payload.schema_version.trim().length > 0
  const hasValidNumbers = Number.isFinite(payload.target_concurrency)
    && Number.isFinite(payload.metrics.first_feedback_p95_ms)
    && Number.isFinite(payload.metrics.simple_turn_final_p95_ms)
    && Number.isFinite(payload.metrics.tool_turn_final_p95_ms)
    && Number.isFinite(payload.metrics.error_rate)

  return hasValidSchemaVersion && hasValidNumbers ? payload : null
}

function artifactFailure(reason: string): RuntimeHardeningReport {
  return {
    overall_status: "fail",
    required_actions: [
      {
        type: "artifact",
        target: "load-validation-artifact",
        reason,
      },
    ],
    runtime_hardening: {
      status: "fail",
      target_concurrency: { status: "fail", expected_min: MIN_CONCURRENCY, observed: null },
      first_feedback_p95_ms: { status: "fail", threshold_ms: FIRST_FEEDBACK_P95_MAX_MS, observed_ms: null },
      simple_turn_final_p95_ms: { status: "fail", threshold_ms: SIMPLE_FINAL_P95_MAX_MS, observed_ms: null },
      tool_turn_final_p95_ms: { status: "fail", threshold_ms: TOOL_FINAL_P95_MAX_MS, observed_ms: null },
      error_rate: { status: "fail", threshold_max_exclusive: ERROR_RATE_MAX_EXCLUSIVE, observed: null },
    },
  }
}

export function evaluateRuntimeHardening(input: EvaluateRuntimeHardeningInput): RuntimeHardeningReport {
  let parsedPayload: RuntimeHardeningLoadValidationPayload | null = null

  if (input.payload !== undefined) {
    parsedPayload = parsePayload(input.payload)
    if (!parsedPayload) {
      return artifactFailure("invalid runtime hardening payload shape")
    }
  } else {
    if (!existsSync(input.artifactPath)) {
      return artifactFailure(`missing runtime hardening artifact: ${input.artifactPath}`)
    }
    try {
      const filePayload = JSON.parse(readFileSync(input.artifactPath, "utf8")) as unknown
      parsedPayload = parsePayload(filePayload)
    } catch {
      return artifactFailure(`unreadable runtime hardening artifact: ${input.artifactPath}`)
    }
    if (!parsedPayload) {
      return artifactFailure(`invalid runtime hardening artifact schema: ${input.artifactPath}`)
    }
  }

  const actions: RuntimeHardeningRequiredAction[] = []
  const concurrencyPass = parsedPayload.target_concurrency >= MIN_CONCURRENCY
  if (!concurrencyPass) {
    actions.push({
      type: "capacity",
      target: "target-concurrency",
      reason: `observed ${parsedPayload.target_concurrency}, expected at least ${MIN_CONCURRENCY}`,
    })
  }

  const firstFeedbackPass = parsedPayload.metrics.first_feedback_p95_ms <= FIRST_FEEDBACK_P95_MAX_MS
  if (!firstFeedbackPass) {
    actions.push({
      type: "latency",
      target: "first-feedback-p95",
      reason: `observed ${parsedPayload.metrics.first_feedback_p95_ms}ms exceeds ${FIRST_FEEDBACK_P95_MAX_MS}ms`,
    })
  }

  const simpleFinalPass = parsedPayload.metrics.simple_turn_final_p95_ms <= SIMPLE_FINAL_P95_MAX_MS
  if (!simpleFinalPass) {
    actions.push({
      type: "latency",
      target: "simple-turn-final-p95",
      reason: `observed ${parsedPayload.metrics.simple_turn_final_p95_ms}ms exceeds ${SIMPLE_FINAL_P95_MAX_MS}ms`,
    })
  }

  const toolFinalPass = parsedPayload.metrics.tool_turn_final_p95_ms <= TOOL_FINAL_P95_MAX_MS
  if (!toolFinalPass) {
    actions.push({
      type: "latency",
      target: "tool-turn-final-p95",
      reason: `observed ${parsedPayload.metrics.tool_turn_final_p95_ms}ms exceeds ${TOOL_FINAL_P95_MAX_MS}ms`,
    })
  }

  const errorRatePass = parsedPayload.metrics.error_rate < ERROR_RATE_MAX_EXCLUSIVE
  if (!errorRatePass) {
    actions.push({
      type: "reliability",
      target: "error-rate",
      reason: `observed ${parsedPayload.metrics.error_rate} must be < ${ERROR_RATE_MAX_EXCLUSIVE}`,
    })
  }

  const status = actions.length === 0 ? "pass" : "fail"

  return {
    overall_status: status,
    required_actions: actions,
    runtime_hardening: {
      status,
      target_concurrency: {
        status: concurrencyPass ? "pass" : "fail",
        expected_min: MIN_CONCURRENCY,
        observed: parsedPayload.target_concurrency,
      },
      first_feedback_p95_ms: {
        status: firstFeedbackPass ? "pass" : "fail",
        threshold_ms: FIRST_FEEDBACK_P95_MAX_MS,
        observed_ms: parsedPayload.metrics.first_feedback_p95_ms,
      },
      simple_turn_final_p95_ms: {
        status: simpleFinalPass ? "pass" : "fail",
        threshold_ms: SIMPLE_FINAL_P95_MAX_MS,
        observed_ms: parsedPayload.metrics.simple_turn_final_p95_ms,
      },
      tool_turn_final_p95_ms: {
        status: toolFinalPass ? "pass" : "fail",
        threshold_ms: TOOL_FINAL_P95_MAX_MS,
        observed_ms: parsedPayload.metrics.tool_turn_final_p95_ms,
      },
      error_rate: {
        status: errorRatePass ? "pass" : "fail",
        threshold_max_exclusive: ERROR_RATE_MAX_EXCLUSIVE,
        observed: parsedPayload.metrics.error_rate,
      },
    },
  }
}
