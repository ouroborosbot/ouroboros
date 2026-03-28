import { describe, expect, it, vi } from "vitest"
import { emitNervesEvent } from "../../../nerves/runtime"

vi.mock("../../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

import {
  writeDaemonTombstone,
  readDaemonTombstone,
  getTombstonePath,
  type DaemonTombstone,
} from "../../../heart/daemon/daemon-tombstone"

describe("daemon tombstone", () => {
  describe("getTombstonePath", () => {
    it("points to ~/.ouro-cli/daemon-death.json", () => {
      expect(getTombstonePath()).toMatch(/\.ouro-cli\/daemon-death\.json$/)
    })
  })

  describe("writeDaemonTombstone", () => {
    it("writes tombstone with Error details", () => {
      const writeFileSync = vi.fn()
      const mkdirSync = vi.fn()
      const now = () => new Date("2026-03-27T10:00:00.000Z")
      const error = new Error("out of memory")
      error.stack = "Error: out of memory\n    at something.ts:42"

      writeDaemonTombstone("uncaughtException", error, {
        writeFileSync,
        mkdirSync,
        pid: 12345,
        uptimeSeconds: 3600,
        now,
      })

      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(".ouro-cli"),
        { recursive: true },
      )
      expect(writeFileSync).toHaveBeenCalledTimes(1)

      const written = JSON.parse(writeFileSync.mock.calls[0][1] as string) as DaemonTombstone
      expect(written.reason).toBe("uncaughtException")
      expect(written.message).toBe("out of memory")
      expect(written.stack).toBe("Error: out of memory\n    at something.ts:42")
      expect(written.timestamp).toBe("2026-03-27T10:00:00.000Z")
      expect(written.pid).toBe(12345)
      expect(written.uptimeSeconds).toBe(3600)
    })

    it("writes tombstone with non-Error value", () => {
      const writeFileSync = vi.fn()
      const mkdirSync = vi.fn()

      writeDaemonTombstone("unhandledRejection", "string error", {
        writeFileSync,
        mkdirSync,
        pid: 1,
        uptimeSeconds: 0,
        now: () => new Date("2026-03-27T10:00:00.000Z"),
      })

      const written = JSON.parse(writeFileSync.mock.calls[0][1] as string) as DaemonTombstone
      expect(written.message).toBe("string error")
      expect(written.stack).toBeNull()
    })

    it("writes tombstone with no error (uses reason as message)", () => {
      const writeFileSync = vi.fn()
      const mkdirSync = vi.fn()

      writeDaemonTombstone("startup_failure", undefined, {
        writeFileSync,
        mkdirSync,
        pid: 1,
        uptimeSeconds: 0,
        now: () => new Date("2026-03-27T10:00:00.000Z"),
      })

      const written = JSON.parse(writeFileSync.mock.calls[0][1] as string) as DaemonTombstone
      expect(written.message).toBe("startup_failure")
      expect(written.stack).toBeNull()
    })

    it("writes tombstone with Error that has no stack", () => {
      const writeFileSync = vi.fn()
      const mkdirSync = vi.fn()
      const error = new Error("boom")
      error.stack = undefined

      writeDaemonTombstone("uncaughtException", error, {
        writeFileSync,
        mkdirSync,
        pid: 1,
        uptimeSeconds: 0,
        now: () => new Date("2026-03-27T10:00:00.000Z"),
      })

      const written = JSON.parse(writeFileSync.mock.calls[0][1] as string) as DaemonTombstone
      expect(written.stack).toBeNull()
    })

    it("emits nerves event after writing", () => {
      const writeFileSync = vi.fn()
      const mkdirSync = vi.fn()

      writeDaemonTombstone("uncaughtException", new Error("boom"), {
        writeFileSync,
        mkdirSync,
        pid: 1,
        uptimeSeconds: 0,
        now: () => new Date("2026-03-27T10:00:00.000Z"),
      })

      expect(emitNervesEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          level: "error",
          component: "daemon",
          event: "daemon.tombstone_written",
          meta: expect.objectContaining({ reason: "uncaughtException" }),
        }),
      )
    })

    it("does not throw when writeFileSync fails", () => {
      const writeFileSync = vi.fn(() => { throw new Error("ENOSPC") })
      const mkdirSync = vi.fn()

      expect(() =>
        writeDaemonTombstone("uncaughtException", new Error("boom"), {
          writeFileSync,
          mkdirSync,
          pid: 1,
          uptimeSeconds: 0,
          now: () => new Date("2026-03-27T10:00:00.000Z"),
        }),
      ).not.toThrow()
    })

    it("does not throw when mkdirSync fails", () => {
      const writeFileSync = vi.fn()
      const mkdirSync = vi.fn(() => { throw new Error("EACCES") })

      expect(() =>
        writeDaemonTombstone("uncaughtException", new Error("boom"), {
          writeFileSync,
          mkdirSync,
          pid: 1,
          uptimeSeconds: 0,
          now: () => new Date("2026-03-27T10:00:00.000Z"),
        }),
      ).not.toThrow()
    })
  })

  describe("readDaemonTombstone", () => {
    it("returns tombstone when file exists and is valid", () => {
      const tombstone: DaemonTombstone = {
        reason: "uncaughtException",
        message: "boom",
        stack: "Error: boom\n    at x.ts:1",
        timestamp: "2026-03-27T10:00:00.000Z",
        pid: 12345,
        uptimeSeconds: 100,
      }
      const existsSync = vi.fn(() => true)
      const readFileSync = vi.fn(() => JSON.stringify(tombstone))

      const result = readDaemonTombstone({ existsSync, readFileSync })
      expect(result).toEqual(tombstone)
    })

    it("returns null when file does not exist", () => {
      const existsSync = vi.fn(() => false)
      const readFileSync = vi.fn()

      const result = readDaemonTombstone({ existsSync, readFileSync })
      expect(result).toBeNull()
      expect(readFileSync).not.toHaveBeenCalled()
    })

    it("returns null when file contains invalid JSON", () => {
      const existsSync = vi.fn(() => true)
      const readFileSync = vi.fn(() => "not json")

      const result = readDaemonTombstone({ existsSync, readFileSync })
      expect(result).toBeNull()
    })

    it("returns null when file is valid JSON but missing required fields", () => {
      const existsSync = vi.fn(() => true)
      const readFileSync = vi.fn(() => JSON.stringify({ foo: "bar" }))

      const result = readDaemonTombstone({ existsSync, readFileSync })
      expect(result).toBeNull()
    })

    it("returns null when readFileSync throws", () => {
      const existsSync = vi.fn(() => true)
      const readFileSync = vi.fn(() => { throw new Error("EACCES") })

      const result = readDaemonTombstone({ existsSync, readFileSync })
      expect(result).toBeNull()
    })
  })
})
