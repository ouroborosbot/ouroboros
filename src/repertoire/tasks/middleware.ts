import { emitNervesEvent } from "../../nerves/runtime"
import { parseTaskFile } from "./parser"
import type {
  SpawnValidation,
  TaskFile,
  ValidationResult,
} from "./types"
import {
  TASK_REQUIRED_TEMPLATE_FIELDS,
  isCanonicalTaskFilename,
  validateTransition,
} from "./transitions"

export function validateTemplate(task: TaskFile): ValidationResult {
  const required = TASK_REQUIRED_TEMPLATE_FIELDS[task.type]
  const missing = required.filter((field) => !(field in task.frontmatter))

  if (missing.length > 0) {
    return { ok: false, reason: "missing required fields", missingFields: missing }
  }

  return { ok: true }
}

export function validateWrite(filePath: string, content: string): ValidationResult {
  emitNervesEvent({
    event: "mind.step_start",
    component: "mind",
    message: "validating task write",
    meta: { filePath },
  })

  const base = filePath.split(/[/\\]/).pop() ?? ""
  if (!isCanonicalTaskFilename(base)) {
    return { ok: false, reason: "non-canonical filename" }
  }

  try {
    const parsed = parseTaskFile(content, filePath)
    return validateTemplate(parsed)
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

export function validateSpawn(task: TaskFile, spawnType: string): SpawnValidation {
  if (task.status === "done") {
    return { ok: false, reason: "spawn-completed-path" }
  }

  const pipelineStage = String(task.frontmatter.pipeline_stage ?? "")
  if (task.status === "drafting" && pipelineStage && pipelineStage !== "quality-gates") {
    return { ok: false, reason: "spawn-coding-pipeline-stage" }
  }

  if (spawnType === "coding") {
    if (task.status !== "processing" && task.status !== "collaborating") {
      return { ok: false, reason: "spawn-coding-task-status" }
    }

    const hasScope = /(^|\n)##\s*scope\b/i.test(task.body)
    if (!hasScope) {
      return { ok: false, reason: "spawn-coding-scope-missing" }
    }
  }

  return { ok: true }
}

export function validateStatusTransition(from: TaskFile, toStatus: TaskFile["status"]): ValidationResult {
  const transition = validateTransition(from.status, toStatus)
  if (!transition.ok) {
    return { ok: false, reason: transition.reason }
  }
  return { ok: true }
}
