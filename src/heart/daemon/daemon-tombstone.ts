import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { emitNervesEvent } from "../../nerves/runtime"

export interface DaemonTombstone {
  reason: string
  message: string
  stack: string | null
  timestamp: string
  pid: number
  uptimeSeconds: number
}

export function getTombstonePath(): string {
  return path.join(os.homedir(), ".ouro-cli", "daemon-death.json")
}

export function writeDaemonTombstone(
  reason: string,
  error?: Error | unknown,
  deps: {
    writeFileSync?: typeof fs.writeFileSync
    mkdirSync?: typeof fs.mkdirSync
    pid?: number
    uptimeSeconds?: number
    now?: () => Date
  } = {},
): void {
  const writeFileSync = deps.writeFileSync ?? fs.writeFileSync
  const mkdirSync = deps.mkdirSync ?? fs.mkdirSync
  const pid = deps.pid ?? process.pid
  const uptimeSeconds = deps.uptimeSeconds ?? process.uptime()
  const now = deps.now ?? (() => new Date())

  const tombstonePath = getTombstonePath()
  const tombstone: DaemonTombstone = {
    reason,
    message: error instanceof Error ? error.message : String(error ?? reason),
    stack: error instanceof Error ? (error.stack ?? null) : null,
    timestamp: now().toISOString(),
    pid,
    uptimeSeconds,
  }

  try {
    mkdirSync(path.dirname(tombstonePath), { recursive: true })
    writeFileSync(tombstonePath, JSON.stringify(tombstone, null, 2) + "\n", "utf-8")
  } catch {
    // Synchronous write failed — nothing more we can do during a crash.
  }

  emitNervesEvent({
    level: "error",
    component: "daemon",
    event: "daemon.tombstone_written",
    message: "wrote daemon death tombstone",
    meta: { reason, tombstonePath },
  })
}

export function readDaemonTombstone(
  deps: {
    readFileSync?: typeof fs.readFileSync
    existsSync?: typeof fs.existsSync
  } = {},
): DaemonTombstone | null {
  const readFileSync = deps.readFileSync ?? fs.readFileSync
  const existsSync = deps.existsSync ?? fs.existsSync
  const tombstonePath = getTombstonePath()

  if (!existsSync(tombstonePath)) return null

  try {
    const raw = readFileSync(tombstonePath, "utf-8")
    const parsed = JSON.parse(raw) as DaemonTombstone
    if (typeof parsed.reason !== "string" || typeof parsed.timestamp !== "string") return null
    return parsed
  } catch {
    return null
  }
}
