import { describe, it, expect, vi, beforeEach } from "vitest"
import { emitNervesEvent } from "../../../nerves/runtime"

// Mock diary module — shared functions the service layer reuses
vi.mock("../../../mind/diary", () => ({
  readDiaryEntries: vi.fn(() => []),
  searchDiaryEntries: vi.fn(async () => []),
  resolveDiaryRoot: vi.fn((p: string) => p),
}))

vi.mock("../../../heart/identity", () => ({
  getAgentRoot: vi.fn((agent: string) => `/mock/agents/${agent}.ouro`),
}))

vi.mock("fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ""),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

import * as fs from "fs"
import { readDiaryEntries, searchDiaryEntries } from "../../../mind/diary"

describe("agent-service handlers", () => {
  beforeEach(() => {
    vi.mocked(readDiaryEntries).mockReturnValue([])
    vi.mocked(searchDiaryEntries).mockResolvedValue([])
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue("")
    vi.mocked(fs.readdirSync).mockReturnValue([])
    emitNervesEvent({ component: "daemon", event: "daemon.agent_service_test_start", message: "test starting", meta: {} })
  })

  describe("handleAgentStatus", () => {
    it("returns status with no memory or sessions", async () => {
      const { handleAgentStatus } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentStatus({ agent: "test", friendId: "f1" })
      expect(r.ok).toBe(true)
      expect(r.data).toMatchObject({ agent: "test", hasMemory: false, sessionCount: 0 })
    })

    it("reports memory when diary entries exist", async () => {
      vi.mocked(readDiaryEntries).mockReturnValue([
        { id: "1", text: "fact one", source: "test", createdAt: "2026-01-01", embedding: [] },
      ])
      const { handleAgentStatus } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentStatus({ agent: "test", friendId: "f1" })
      expect(r.data).toMatchObject({ hasMemory: true, factCount: 1 })
    })

    it("reads inner dialog status", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).includes("runtime.json"))
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes("runtime.json")) return JSON.stringify({ status: "thinking", lastCompletedAt: "2026-03-26T01:00:00Z" })
        return ""
      })
      const { handleAgentStatus } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentStatus({ agent: "test", friendId: "f1" })
      expect(r.data).toMatchObject({ innerStatus: "thinking" })
    })
  })

  describe("handleAgentAsk", () => {
    it("returns error when question is missing", async () => {
      const { handleAgentAsk } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentAsk({ agent: "test", friendId: "f1" })
      expect(r.ok).toBe(false)
    })

    it("delegates to searchDiaryEntries (same as recall tool)", async () => {
      vi.mocked(searchDiaryEntries).mockResolvedValue([
        { id: "1", text: "ouroboros is an agent runtime", source: "test", createdAt: "2026-01-01", embedding: [] },
      ])
      const { handleAgentAsk } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentAsk({ agent: "test", friendId: "f1", question: "what is ouroboros?" })
      expect(r.ok).toBe(true)
      expect(r.message).toContain("ouroboros is an agent runtime")
      expect(searchDiaryEntries).toHaveBeenCalledWith("what is ouroboros?", expect.any(Array))
    })

    it("returns no-matches message when search finds nothing", async () => {
      const { handleAgentAsk } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentAsk({ agent: "test", friendId: "f1", question: "unknown" })
      expect(r.message).toContain("No relevant memories found")
    })
  })

  describe("handleAgentSearchMemory", () => {
    it("returns error when query is missing", async () => {
      const { handleAgentSearchMemory } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentSearchMemory({ agent: "test", friendId: "f1" })
      expect(r.ok).toBe(false)
    })

    it("formats results like the recall tool ([diary] prefix)", async () => {
      vi.mocked(searchDiaryEntries).mockResolvedValue([
        { id: "1", text: "MCP server bridge", source: "tool:diary_write", createdAt: "2026-03-26", embedding: [] },
      ])
      const { handleAgentSearchMemory } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentSearchMemory({ agent: "test", friendId: "f1", query: "MCP" })
      expect(r.ok).toBe(true)
      const matches = (r.data as { matches: string[] }).matches
      expect(matches[0]).toContain("[diary]")
      expect(matches[0]).toContain("MCP server bridge")
      expect(matches[0]).toContain("source=tool:diary_write")
    })
  })

  describe("handleAgentCatchup", () => {
    it("returns no recent activity when empty", async () => {
      const { handleAgentCatchup } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentCatchup({ agent: "test", friendId: "f1" })
      expect(r.ok).toBe(true)
      expect(r.message).toContain("No recent sessions")
    })

    it("includes inner dialog status", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).includes("runtime.json"))
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes("runtime.json")) return JSON.stringify({ status: "idle", lastCompletedAt: "2026-03-26T10:00:00Z" })
        return ""
      })
      const { handleAgentCatchup } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentCatchup({ agent: "test", friendId: "f1" })
      expect(r.message).toContain("Inner dialog: idle")
    })
  })

  describe("handleAgentGetContext", () => {
    it("uses searchDiaryEntries when query is provided", async () => {
      vi.mocked(searchDiaryEntries).mockResolvedValue([
        { id: "1", text: "relevant", source: "test", createdAt: "2026-01-01", embedding: [] },
      ])
      const { handleAgentGetContext } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentGetContext({ agent: "test", friendId: "f1", query: "context" })
      expect((r.data as Record<string, unknown>).memorySummary).toContain("relevant")
      expect(searchDiaryEntries).toHaveBeenCalled()
    })
  })

  describe("handleAgentCheckGuidance", () => {
    it("returns error when topic is missing", async () => {
      const { handleAgentCheckGuidance } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentCheckGuidance({ agent: "test", friendId: "f1" })
      expect(r.ok).toBe(false)
    })

    it("uses searchDiaryEntries for guidance", async () => {
      vi.mocked(searchDiaryEntries).mockResolvedValue([
        { id: "1", text: "always use explicit types", source: "test", createdAt: "2026-01-01", embedding: [] },
      ])
      const { handleAgentCheckGuidance } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentCheckGuidance({ agent: "test", friendId: "f1", topic: "types" })
      expect(r.message).toContain("always use explicit types")
    })
  })

  describe("handleAgentDelegate", () => {
    it("returns error when task is missing", async () => {
      const { handleAgentDelegate } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentDelegate({ agent: "test", friendId: "f1" })
      expect(r.ok).toBe(false)
    })

    it("queues task", async () => {
      const { handleAgentDelegate } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentDelegate({ agent: "test", friendId: "f1", task: "fix bug" })
      expect(r.ok).toBe(true)
      expect(r.message).toContain("fix bug")
    })
  })

  describe("handleAgentGetTask", () => {
    it("returns no tasks when empty", async () => {
      const { handleAgentGetTask } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentGetTask({ agent: "test", friendId: "f1" })
      expect(r.message).toContain("No active tasks")
    })
  })

  describe("handleAgentCheckScope", () => {
    it("returns error when item is missing", async () => {
      const { handleAgentCheckScope } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentCheckScope({ agent: "test", friendId: "f1" })
      expect(r.ok).toBe(false)
    })
  })

  describe("handleAgentRequestDecision", () => {
    it("returns error when topic is missing", async () => {
      const { handleAgentRequestDecision } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentRequestDecision({ agent: "test", friendId: "f1" })
      expect(r.ok).toBe(false)
    })
  })

  describe("report handlers", () => {
    it("reportProgress errors without summary", async () => {
      const { handleAgentReportProgress } = await import("../../../heart/daemon/agent-service")
      expect((await handleAgentReportProgress({ agent: "t", friendId: "f" })).ok).toBe(false)
    })

    it("reportProgress succeeds", async () => {
      const { handleAgentReportProgress } = await import("../../../heart/daemon/agent-service")
      expect((await handleAgentReportProgress({ agent: "t", friendId: "f", summary: "done" })).ok).toBe(true)
    })

    it("reportBlocker errors without blocker", async () => {
      const { handleAgentReportBlocker } = await import("../../../heart/daemon/agent-service")
      expect((await handleAgentReportBlocker({ agent: "t", friendId: "f" })).ok).toBe(false)
    })

    it("reportComplete errors without summary", async () => {
      const { handleAgentReportComplete } = await import("../../../heart/daemon/agent-service")
      expect((await handleAgentReportComplete({ agent: "t", friendId: "f" })).ok).toBe(false)
    })

    it("reportComplete succeeds", async () => {
      const { handleAgentReportComplete } = await import("../../../heart/daemon/agent-service")
      const r = await handleAgentReportComplete({ agent: "t", friendId: "f", summary: "all done" })
      expect(r.ok).toBe(true)
      expect(r.message).toContain("all done")
    })
  })
})
