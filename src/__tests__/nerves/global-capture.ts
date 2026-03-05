import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { dirname, join } from "path"

import { registerGlobalLogSink, type LogEvent } from "../../nerves"
import { getDeclaredLogpoints } from "../../nerves/coverage/contract"

const REPO_SLUG = "ouroboros-agent-harness"

function readActiveRunDir(): string | null {
  const activePath = join(homedir(), ".agentstate", "test-runs", REPO_SLUG, ".active-run.json")
  if (!existsSync(activePath)) return null
  try {
    const parsed = JSON.parse(readFileSync(activePath, "utf8")) as { run_dir?: unknown }
    return typeof parsed.run_dir === "string" && parsed.run_dir.length > 0 ? parsed.run_dir : null
  } catch {
    return null
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function mergeLogpointFile(logpointsPath: string, observed: string[]): void {
  let existingDeclared: string[] = []
  let existingObserved: string[] = []
  if (existsSync(logpointsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(logpointsPath, "utf8")) as {
        declared?: unknown
        observed?: unknown
      }
      existingDeclared = asStringArray(parsed.declared)
      existingObserved = asStringArray(parsed.observed)
    } catch {
      existingDeclared = []
      existingObserved = []
    }
  }

  const declared = new Set<string>([...existingDeclared, ...getDeclaredLogpoints()])
  const observedSet = new Set<string>([...existingObserved, ...observed])
  writeFileSync(
    logpointsPath,
    JSON.stringify(
      {
        declared: [...declared].sort(),
        observed: [...observedSet].sort(),
      },
      null,
      2,
    ),
    "utf8",
  )
}

const CAPTURE_STATE_KEY = Symbol.for("ouroboros.nerves.capture-state")
type CaptureState = {
  runDir: string
  logpointsPath: string
  observed: Set<string>
  flushed: boolean
  unregister: () => void
}

const scope = globalThis as Record<PropertyKey, unknown>
const existingState = scope[CAPTURE_STATE_KEY] as CaptureState | undefined

const runDir = readActiveRunDir()
if (runDir && (!existingState || existingState.runDir !== runDir)) {
  existingState?.unregister()

  const eventsPath = join(runDir, "vitest-events.ndjson")
  const logpointsPath = join(runDir, "vitest-logpoints.json")
  mkdirSync(dirname(eventsPath), { recursive: true })

  const observed = new Set<string>()
  const unregister = registerGlobalLogSink((entry: LogEvent) => {
    appendFileSync(eventsPath, `${JSON.stringify(entry)}\n`, "utf8")
    observed.add(`${entry.component}:${entry.event}`)
  })

  const state: CaptureState = {
    runDir,
    logpointsPath,
    observed,
    flushed: false,
    unregister,
  }
  scope[CAPTURE_STATE_KEY] = state

  const flush = () => {
    if (state.flushed) return
    state.flushed = true
    state.unregister()
    mergeLogpointFile(state.logpointsPath, [...state.observed])
  }

  process.once("beforeExit", flush)
  process.once("exit", flush)
}
