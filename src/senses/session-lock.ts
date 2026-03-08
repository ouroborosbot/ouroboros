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
  existsSync: (path: string) => boolean
  pid: number
  isProcessAlive: (pid: number) => boolean
}

export interface SessionLock {
  release: () => void
}

const defaultDeps: SessionLockDeps = {
  writeFileSync: (p, d, o) => {
    const fs = require("fs") as typeof import("fs")
    fs.writeFileSync(p, d, o)
  },
  readFileSync: (p, e) => {
    const fs = require("fs") as typeof import("fs")
    return fs.readFileSync(p, e)
  },
  unlinkSync: (p) => {
    const fs = require("fs") as typeof import("fs")
    fs.unlinkSync(p)
  },
  existsSync: (p) => {
    const fs = require("fs") as typeof import("fs")
    return fs.existsSync(p)
  },
  pid: process.pid,
  isProcessAlive: (pid: number) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  },
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
