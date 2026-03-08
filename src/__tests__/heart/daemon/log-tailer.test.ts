import { describe, expect, it, vi } from "vitest"
import {
  discoverLogFiles,
  readLastLines,
  formatLogLine,
  tailLogs,
} from "../../../heart/daemon/log-tailer"

describe("log-tailer", () => {
  describe("discoverLogFiles", () => {
    it("returns ndjson files from log directory", () => {
      const files = discoverLogFiles({
        homeDir: "/home/test",
        existsSync: (p) => p.includes("logs"),
        readdirSync: () => ["daemon.ndjson", "agent-slugger.ndjson", "notes.txt"],
      })

      expect(files).toHaveLength(2)
      expect(files[0]).toContain("agent-slugger.ndjson")
      expect(files[1]).toContain("daemon.ndjson")
    })

    it("returns empty when log dir does not exist", () => {
      const files = discoverLogFiles({
        homeDir: "/home/test",
        existsSync: () => false,
        readdirSync: () => [],
      })

      expect(files).toEqual([])
    })

    it("filters by agent name", () => {
      const files = discoverLogFiles({
        homeDir: "/home/test",
        existsSync: () => true,
        readdirSync: () => ["daemon.ndjson", "agent-slugger.ndjson", "agent-ouroboros.ndjson"],
        agentFilter: "slugger",
      })

      expect(files).toHaveLength(1)
      expect(files[0]).toContain("slugger")
    })
  })

  describe("readLastLines", () => {
    it("returns last N non-empty lines", () => {
      const readFileSync = vi.fn(() => "line1\nline2\nline3\nline4\nline5\n")
      const lines = readLastLines("/test/file.ndjson", 3, readFileSync)

      expect(lines).toEqual(["line3", "line4", "line5"])
    })

    it("returns all lines when fewer than N", () => {
      const readFileSync = vi.fn(() => "line1\nline2\n")
      const lines = readLastLines("/test/file.ndjson", 10, readFileSync)

      expect(lines).toEqual(["line1", "line2"])
    })

    it("returns empty on read error", () => {
      const readFileSync = vi.fn(() => { throw new Error("ENOENT") })
      const lines = readLastLines("/test/missing.ndjson", 10, readFileSync)

      expect(lines).toEqual([])
    })
  })

  describe("formatLogLine", () => {
    it("formats valid NDJSON log entry with color", () => {
      const entry = JSON.stringify({
        ts: "2026-03-07T12:00:00.000Z",
        level: "info",
        event: "test.event",
        trace_id: "abc",
        component: "daemon",
        message: "test message",
        meta: {},
      })

      const formatted = formatLogLine(entry)
      expect(formatted).toContain("INFO")
      expect(formatted).toContain("[daemon]")
      expect(formatted).toContain("test message")
      expect(formatted).toContain("\x1b[36m") // info color
    })

    it("returns raw line for invalid JSON", () => {
      expect(formatLogLine("not-json")).toBe("not-json")
    })

    it("uses warn color for warn level", () => {
      const entry = JSON.stringify({
        ts: "2026-03-07T12:00:00.000Z",
        level: "warn",
        event: "test",
        trace_id: "abc",
        component: "daemon",
        message: "warning",
        meta: {},
      })

      expect(formatLogLine(entry)).toContain("\x1b[33m")
    })
  })

  describe("tailLogs", () => {
    it("writes initial lines to writer", () => {
      const output: string[] = []
      const writer = (text: string) => { output.push(text) }

      tailLogs({
        homeDir: "/home/test",
        existsSync: (p) => p.includes("logs"),
        readdirSync: () => ["daemon.ndjson"],
        readFileSync: () => JSON.stringify({
          ts: "2026-03-07T12:00:00.000Z",
          level: "info",
          event: "test",
          trace_id: "abc",
          component: "daemon",
          message: "startup",
          meta: {},
        }) + "\n",
        writer,
        lines: 10,
      })

      expect(output.length).toBeGreaterThan(0)
      expect(output[0]).toContain("startup")
    })

    it("returns no-op cleanup when not following", () => {
      const cleanup = tailLogs({
        homeDir: "/home/test",
        existsSync: () => false,
        readdirSync: () => [],
        readFileSync: () => "",
      })

      expect(typeof cleanup).toBe("function")
      expect(() => cleanup()).not.toThrow()
    })

    it("sets up file watchers in follow mode", () => {
      const watched: string[] = []
      const unwatched: string[] = []
      const output: string[] = []

      const cleanup = tailLogs({
        homeDir: "/home/test",
        existsSync: (p) => p.includes("logs"),
        readdirSync: () => ["daemon.ndjson"],
        readFileSync: () => "",
        writer: (text: string) => { output.push(text) },
        follow: true,
        watchFile: (target) => { watched.push(target) },
        unwatchFile: (target) => { unwatched.push(target) },
      })

      expect(watched).toHaveLength(1)
      expect(watched[0]).toContain("daemon.ndjson")

      cleanup()
      expect(unwatched).toHaveLength(1)
    })

    it("streams new lines when file changes in follow mode", () => {
      const output: string[] = []
      let fileContent = ""
      let watchCallback: (() => void) | null = null

      tailLogs({
        homeDir: "/home/test",
        existsSync: (p) => p.includes("logs"),
        readdirSync: () => ["daemon.ndjson"],
        readFileSync: () => fileContent,
        writer: (text: string) => { output.push(text) },
        follow: true,
        watchFile: (_target, listener) => { watchCallback = listener },
        unwatchFile: () => {},
      })

      // Simulate new content
      const newEntry = JSON.stringify({
        ts: "2026-03-07T12:01:00.000Z",
        level: "info",
        event: "test",
        trace_id: "abc",
        component: "daemon",
        message: "new event",
        meta: {},
      })
      fileContent = `${newEntry}\n`
      watchCallback?.()

      expect(output.some((line) => line.includes("new event"))).toBe(true)
    })

    it("handles read errors during follow mode gracefully", () => {
      let readCount = 0
      let watchCallback: (() => void) | null = null

      tailLogs({
        homeDir: "/home/test",
        existsSync: (p) => p.includes("logs"),
        readdirSync: () => ["daemon.ndjson"],
        readFileSync: () => {
          readCount++
          if (readCount > 1) throw new Error("ENOENT")
          return ""
        },
        writer: () => {},
        follow: true,
        watchFile: (_target, listener) => { watchCallback = listener },
        unwatchFile: () => {},
      })

      expect(() => watchCallback?.()).not.toThrow()
    })

    it("uses defaults when options are minimal", () => {
      const cleanup = tailLogs({})
      expect(typeof cleanup).toBe("function")
    })
  })
})
