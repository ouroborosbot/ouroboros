import * as fs from "fs"
import * as path from "path"
import { getAgentRoot } from "../../heart/identity"
import { emitNervesEvent } from "../../nerves/runtime"
import type { TaskIndex } from "./types"
import {
  TASK_CANONICAL_COLLECTIONS,
  TASK_RESERVED_DIRECTORIES,
  isCanonicalTaskFilename,
} from "./transitions"
import { parseTaskFile } from "./parser"

let scanCache: { fingerprint: string; index: TaskIndex } | null = null

export function getTaskRoot(): string {
  return path.join(getAgentRoot(), "tasks")
}

export function ensureTaskLayout(root = getTaskRoot()): void {
  const dirs = [
    root,
    ...TASK_CANONICAL_COLLECTIONS.map((collection) => path.join(root, collection)),
    path.join(root, "templates"),
    path.join(root, ".trash"),
    path.join(root, "archive"),
  ]

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function walkMarkdownFiles(dir: string, acc: string[]): void {
  if (!fs.existsSync(dir)) return

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (TASK_RESERVED_DIRECTORIES.includes(entry.name as (typeof TASK_RESERVED_DIRECTORIES)[number])) {
        continue
      }
      walkMarkdownFiles(path.join(dir, entry.name), acc)
      continue
    }

    if (entry.name.endsWith(".md")) {
      acc.push(path.join(dir, entry.name))
    }
  }
}

function buildFingerprint(paths: string[]): string {
  const segments = paths
    .map((filePath) => {
      const stat = fs.statSync(filePath)
      return `${filePath}:${stat.mtimeMs}:${stat.size}`
    })
    .sort()
  return segments.join("|")
}

export function clearTaskScanCache(): void {
  scanCache = null
}

export function scanTasks(root = getTaskRoot()): TaskIndex {
  emitNervesEvent({
    event: "mind.step_start",
    component: "mind",
    message: "scanning task files",
    meta: { root },
  })

  ensureTaskLayout(root)

  const files: string[] = []
  for (const collection of TASK_CANONICAL_COLLECTIONS) {
    walkMarkdownFiles(path.join(root, collection), files)
  }

  const fingerprint = buildFingerprint(files)
  if (scanCache && scanCache.fingerprint === fingerprint) {
    return scanCache.index
  }

  const tasks = []
  const parseErrors: string[] = []
  const invalidFilenames: string[] = []

  for (const filePath of files) {
    const base = path.basename(filePath)
    if (!isCanonicalTaskFilename(base)) {
      invalidFilenames.push(filePath)
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8")
      tasks.push(parseTaskFile(content, filePath))
    } catch (error) {
      parseErrors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const index: TaskIndex = {
    root,
    tasks,
    invalidFilenames,
    parseErrors,
    fingerprint,
  }

  scanCache = { fingerprint, index }
  return index
}
