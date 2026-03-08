import * as fs from "fs"

export class SessionLockError extends Error {
  readonly agentName: string

  constructor(agentName: string) {
    super(`already chatting with ${agentName} in another terminal`)
    this.name = "SessionLockError"
    this.agentName = agentName
  }
}

export interface SessionLockDeps {
  writeFileSync: (path: string, data: string, options: { flag: string }) => void
  readFileSync: (path: string, encoding: "utf-8") => string
  unlinkSync: (path: string) => void
  pid: number
  isProcessAlive: (pid: number) => boolean
}

export interface SessionLock {
  release: () => void
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const defaultDeps: SessionLockDeps = {
  writeFileSync: (p, d, o) => fs.writeFileSync(p, d, o),
  readFileSync: (p, e) => fs.readFileSync(p, e),
  unlinkSync: (p) => fs.unlinkSync(p),
  pid: process.pid,
  isProcessAlive: defaultIsProcessAlive,
}

export function acquireSessionLock(lockPath: string, agentName: string, deps: SessionLockDeps = defaultDeps): SessionLock {
  const tryWrite = (): boolean => {
    try {
      deps.writeFileSync(lockPath, String(deps.pid), { flag: "wx" })
      return true
    } catch {
      return false
    }
  }

  if (!tryWrite()) {
    // Lock file exists — check if stale
    let existingPid: number
    try {
      existingPid = parseInt(deps.readFileSync(lockPath, "utf-8").trim(), 10)
    } catch {
      // Can't read lock file — try removing and retrying
      try { deps.unlinkSync(lockPath) } catch { /* ignore */ }
      if (!tryWrite()) throw new SessionLockError(agentName)
      return makeRelease(lockPath, deps)
    }

    if (Number.isNaN(existingPid) || !deps.isProcessAlive(existingPid)) {
      // Stale lock — remove and retry
      try { deps.unlinkSync(lockPath) } catch { /* ignore */ }
      if (!tryWrite()) throw new SessionLockError(agentName)
      return makeRelease(lockPath, deps)
    }

    throw new SessionLockError(agentName)
  }

  return makeRelease(lockPath, deps)
}

function makeRelease(lockPath: string, deps: SessionLockDeps): SessionLock {
  let released = false
  return {
    release: () => {
      if (released) return
      released = true
      try { deps.unlinkSync(lockPath) } catch { /* ignore */ }
    },
  }
}
