import { describe, expect, it, vi } from "vitest"
import {
  acquireSessionLock,
  SessionLockError,
  type SessionLockDeps,
} from "../../senses/session-lock"

function makeDeps(overrides: Partial<SessionLockDeps> = {}): SessionLockDeps {
  return {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => ""),
    unlinkSync: vi.fn(),
    existsSync: vi.fn(() => false),
    pid: 12345,
    isProcessAlive: vi.fn(() => false),
    ...overrides,
  }
}

describe("session-lock", () => {
  it("acquires lock by writing pid with exclusive flag", () => {
    const deps = makeDeps()
    const lock = acquireSessionLock("/tmp/test.lock", "slugger", deps)

    expect(deps.writeFileSync).toHaveBeenCalledWith("/tmp/test.lock", "12345", { flag: "wx" })
    expect(lock.release).toBeInstanceOf(Function)
  })

  it("release removes the lock file", () => {
    const deps = makeDeps()
    const lock = acquireSessionLock("/tmp/test.lock", "slugger", deps)

    lock.release()

    expect(deps.unlinkSync).toHaveBeenCalledWith("/tmp/test.lock")
  })

  it("release is idempotent", () => {
    const deps = makeDeps()
    const lock = acquireSessionLock("/tmp/test.lock", "slugger", deps)

    lock.release()
    lock.release()

    expect(deps.unlinkSync).toHaveBeenCalledTimes(1)
  })

  it("throws SessionLockError when lock held by live process", () => {
    const deps = makeDeps({
      writeFileSync: vi.fn(() => { throw new Error("EEXIST") }),
      readFileSync: vi.fn(() => "99999"),
      isProcessAlive: vi.fn(() => true),
    })

    expect(() => acquireSessionLock("/tmp/test.lock", "slugger", deps)).toThrow(SessionLockError)
    expect(() => acquireSessionLock("/tmp/test.lock", "slugger", deps)).toThrow(
      "already chatting with slugger in another terminal",
    )
  })

  it("SessionLockError has agentName property", () => {
    const error = new SessionLockError("slugger")
    expect(error.agentName).toBe("slugger")
    expect(error.name).toBe("SessionLockError")
  })

  it("steals stale lock from dead process", () => {
    let writeCount = 0
    const deps = makeDeps({
      writeFileSync: vi.fn((_p, _d, _o) => {
        writeCount++
        if (writeCount === 1) throw new Error("EEXIST")
      }),
      readFileSync: vi.fn(() => "88888"),
      isProcessAlive: vi.fn(() => false),
    })

    const lock = acquireSessionLock("/tmp/test.lock", "slugger", deps)

    expect(deps.unlinkSync).toHaveBeenCalledWith("/tmp/test.lock")
    expect(lock.release).toBeInstanceOf(Function)
  })

  it("steals lock when pid is NaN", () => {
    let writeCount = 0
    const deps = makeDeps({
      writeFileSync: vi.fn(() => {
        writeCount++
        if (writeCount === 1) throw new Error("EEXIST")
      }),
      readFileSync: vi.fn(() => "not-a-number"),
      isProcessAlive: vi.fn(() => false),
    })

    const lock = acquireSessionLock("/tmp/test.lock", "slugger", deps)
    expect(lock.release).toBeInstanceOf(Function)
  })

  it("handles unreadable lock file by removing and retrying", () => {
    let writeCount = 0
    const deps = makeDeps({
      writeFileSync: vi.fn(() => {
        writeCount++
        if (writeCount === 1) throw new Error("EEXIST")
      }),
      readFileSync: vi.fn(() => { throw new Error("ENOENT") }),
    })

    const lock = acquireSessionLock("/tmp/test.lock", "slugger", deps)
    expect(lock.release).toBeInstanceOf(Function)
  })

  it("throws when retry after stale cleanup also fails", () => {
    const deps = makeDeps({
      writeFileSync: vi.fn(() => { throw new Error("EEXIST") }),
      readFileSync: vi.fn(() => "88888"),
      isProcessAlive: vi.fn(() => false),
    })

    expect(() => acquireSessionLock("/tmp/test.lock", "slugger", deps)).toThrow(SessionLockError)
  })

  it("throws when retry after unreadable lock also fails", () => {
    const deps = makeDeps({
      writeFileSync: vi.fn(() => { throw new Error("EEXIST") }),
      readFileSync: vi.fn(() => { throw new Error("ENOENT") }),
    })

    expect(() => acquireSessionLock("/tmp/test.lock", "slugger", deps)).toThrow(SessionLockError)
  })

  it("release tolerates unlinkSync errors", () => {
    const deps = makeDeps({
      unlinkSync: vi.fn(() => { throw new Error("ENOENT") }),
    })
    const lock = acquireSessionLock("/tmp/test.lock", "slugger", deps)

    expect(() => lock.release()).not.toThrow()
  })

  it("acquires lock using real fs deps when no deps argument is given", () => {
    const fs = require("fs") as typeof import("fs")
    const os = require("os") as typeof import("os")
    const path = require("path") as typeof import("path")
    const lockPath = path.join(os.tmpdir(), `session-lock-default-${Date.now()}.lock`)
    try {
      const lock = acquireSessionLock(lockPath, "slugger")
      expect(fs.existsSync(lockPath)).toBe(true)
      lock.release()
      expect(fs.existsSync(lockPath)).toBe(false)
    } finally {
      try { fs.unlinkSync(lockPath) } catch { /* cleanup */ }
    }
  })
})
