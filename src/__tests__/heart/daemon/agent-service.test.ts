import { describe, it, expect, vi, beforeEach } from "vitest"
import { emitNervesEvent } from "../../../nerves/runtime"

// Mock fs
vi.mock("fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ""),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

// Mock identity
vi.mock("../../../heart/identity", () => ({
  getAgentRoot: vi.fn(() => "/mock/agent-root"),
  getAgentStateRoot: vi.fn(() => "/mock/agent-root/state"),
  getAgentName: vi.fn(() => "test-agent"),
  getRepoRoot: vi.fn(() => "/mock/repo"),
}))

import * as fs from "fs"

// Helper: build a JSONL facts file from an array of partial fact objects
function buildFactsJsonl(facts: Array<{ text: string; source?: string; id?: string; createdAt?: string; embedding?: number[] }>): string {
  return facts.map((f) => JSON.stringify({
    id: f.id ?? "fact-1",
    text: f.text,
    source: f.source ?? "test",
    createdAt: f.createdAt ?? "2026-03-26T00:00:00Z",
    embedding: f.embedding ?? [0.1, 0.2, 0.3],
    about: "test-agent",
  })).join("\n") + "\n"
}

describe("agent-service", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset()
    vi.mocked(fs.readFileSync).mockReset()
    vi.mocked(fs.readdirSync).mockReset()
    vi.mocked(fs.statSync).mockReset()

    // Default: nothing exists
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as ReturnType<typeof fs.statSync>)

    emitNervesEvent({
      component: "daemon",
      event: "daemon.agent_service_test_start",
      message: "agent service test starting",
      meta: {},
    })
  })

  describe("handleAgentStatus", () => {
    it("returns status with agent name and zero counts when no state exists", async () => {
      const { handleAgentStatus } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentStatus({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      const data = result.data as Record<string, unknown>
      expect(data.agent).toBe("test-agent")
      expect(data.innerStatus).toBe("unknown")
      expect(data.sessionCount).toBe(0)
      expect(data.hasMemory).toBe(false)
      expect(data.factCount).toBe(0)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentStatus test complete",
        meta: {},
      })
    })

    it("reads facts.jsonl and reports factCount and hasMemory", async () => {
      const factsContent = buildFactsJsonl([
        { text: "I like deployment automation", id: "f1" },
        { text: "My owner is Ari", id: "f2" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentStatus } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentStatus({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      const data = result.data as Record<string, unknown>
      expect(data.hasMemory).toBe(true)
      expect(data.factCount).toBe(2)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentStatus with facts test complete",
        meta: {},
      })
    })

    it("counts sessions by enumerating state/sessions/ directories", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.endsWith("state/sessions")) return true
        if (s.endsWith("session.json")) return true
        return false
      })
      vi.mocked(fs.readdirSync).mockImplementation((p) => {
        const s = String(p)
        if (s.endsWith("state/sessions")) return ["alice", "bob"] as unknown as ReturnType<typeof fs.readdirSync>
        if (s.endsWith("alice")) return ["cli"] as unknown as ReturnType<typeof fs.readdirSync>
        if (s.endsWith("bob")) return ["teams"] as unknown as ReturnType<typeof fs.readdirSync>
        if (s.endsWith("cli") || s.endsWith("teams")) return ["default"] as unknown as ReturnType<typeof fs.readdirSync>
        return [] as unknown as ReturnType<typeof fs.readdirSync>
      })
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ lastUsage: "2026-03-26T10:00:00Z", messages: [] }))

      const { handleAgentStatus } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentStatus({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      const data = result.data as Record<string, unknown>
      expect(data.sessionCount).toBe(2)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentStatus sessions test complete",
        meta: {},
      })
    })

    it("reads inner dialog runtime status", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("runtime.json")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ status: "thinking", lastCompletedAt: "2026-03-26T09:00:00Z" }))

      const { handleAgentStatus } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentStatus({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      const data = result.data as Record<string, unknown>
      expect(data.innerStatus).toBe("thinking")
      expect(data.lastThoughtAt).toBe("2026-03-26T09:00:00Z")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentStatus inner dialog test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentAsk", () => {
    it("returns matching fact text when facts exist", async () => {
      const factsContent = buildFactsJsonl([
        { text: "I work on deployment automation", id: "f1" },
        { text: "My favorite color is blue", id: "f2" },
        { text: "Deployment schedule is weekly", id: "f3" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentAsk } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentAsk({
        agent: "test-agent",
        friendId: "friend-1",
        question: "What do you work on with deployment?",
      })

      expect(result.ok).toBe(true)
      expect(result.message).toContain("deployment automation")
      expect(result.message).toContain("Deployment schedule")
      // Must NOT contain embedding data
      expect(result.message).not.toContain("0.1")
      expect(result.message).not.toContain("embedding")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentAsk with matches test complete",
        meta: {},
      })
    })

    it("returns no-match message when no facts match the question", async () => {
      const factsContent = buildFactsJsonl([
        { text: "I work on deployment automation", id: "f1" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentAsk } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentAsk({
        agent: "test-agent",
        friendId: "friend-1",
        question: "What is your favorite color?",
      })

      expect(result.ok).toBe(true)
      expect(result.message).toBe("No relevant memories found for: What is your favorite color?")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentAsk no match test complete",
        meta: {},
      })
    })

    it("returns no-match message when no memory files exist", async () => {
      const { handleAgentAsk } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentAsk({
        agent: "test-agent",
        friendId: "friend-1",
        question: "What are you working on?",
      })

      expect(result.ok).toBe(true)
      expect(result.message).toContain("No relevant memories found for:")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentAsk no memory test complete",
        meta: {},
      })
    })

    it("returns error when question is missing", async () => {
      const { handleAgentAsk } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentAsk({
        agent: "test-agent",
        friendId: "friend-1",
      })

      expect(result.ok).toBe(false)
      expect(result.error).toContain("question")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentAsk missing question test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentCatchup", () => {
    it("returns no-activity message when no state exists", async () => {
      const { handleAgentCatchup } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentCatchup({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      expect(result.message).toBeDefined()

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentCatchup empty test complete",
        meta: {},
      })
    })

    it("includes recent sessions sorted by lastUsage", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.endsWith("state/sessions")) return true
        if (s.endsWith("session.json")) return true
        return false
      })
      vi.mocked(fs.readdirSync).mockImplementation((p) => {
        const s = String(p)
        if (s.endsWith("state/sessions")) return ["alice"] as unknown as ReturnType<typeof fs.readdirSync>
        if (s.endsWith("alice")) return ["cli"] as unknown as ReturnType<typeof fs.readdirSync>
        if (s.endsWith("cli")) return ["default"] as unknown as ReturnType<typeof fs.readdirSync>
        return [] as unknown as ReturnType<typeof fs.readdirSync>
      })
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ lastUsage: "2026-03-26T10:00:00Z", messages: [] }))

      const { handleAgentCatchup } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentCatchup({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      expect(result.message).toContain("alice/cli/default")
      const data = result.data as Record<string, unknown>
      const recentSessions = data.recentSessions as Array<Record<string, string>>
      expect(recentSessions).toHaveLength(1)
      expect(recentSessions[0].friendId).toBe("alice")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentCatchup with sessions test complete",
        meta: {},
      })
    })

    it("includes inner dialog status when present", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("runtime.json")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ status: "idle", lastCompletedAt: "2026-03-26T08:00:00Z" }))

      const { handleAgentCatchup } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentCatchup({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      expect(result.message).toContain("Inner dialog: idle")
      const data = result.data as Record<string, unknown>
      const innerStatus = data.innerStatus as Record<string, string>
      expect(innerStatus.status).toBe("idle")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentCatchup inner dialog test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentDelegate", () => {
    it("accepts a task delegation", async () => {
      const { handleAgentDelegate } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentDelegate({
        agent: "test-agent",
        friendId: "friend-1",
        task: "Fix the build",
        context: "CI is failing",
      })

      expect(result.ok).toBe(true)
      expect(result.message).toContain("delegate")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentDelegate test complete",
        meta: {},
      })
    })

    it("returns error when task is missing", async () => {
      const { handleAgentDelegate } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentDelegate({
        agent: "test-agent",
        friendId: "friend-1",
      })

      expect(result.ok).toBe(false)
      expect(result.error).toContain("task")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentDelegate missing task test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentGetContext", () => {
    it("returns context with zero counts when no state exists", async () => {
      const { handleAgentGetContext } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentGetContext({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      const data = result.data as Record<string, unknown>
      expect(data.hasMemory).toBe(false)
      expect(data.factCount).toBe(0)
      expect(data.taskCount).toBe(0)
      expect(data.sessionCount).toBe(0)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentGetContext test complete",
        meta: {},
      })
    })

    it("filters facts by query keyword when a query param is provided", async () => {
      const factsContent = buildFactsJsonl([
        { text: "Deployment automation is my specialty", id: "f1" },
        { text: "Testing requires node 20", id: "f2" },
        { text: "Deployment schedule is weekly", id: "f3" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentGetContext } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentGetContext({
        agent: "test-agent",
        friendId: "friend-1",
        query: "deployment",
      })

      expect(result.ok).toBe(true)
      const data = result.data as Record<string, unknown>
      expect(data.hasMemory).toBe(true)
      expect(data.factCount).toBe(3)
      const summary = data.memorySummary as string
      expect(summary).toContain("Deployment automation")
      expect(summary).toContain("Deployment schedule")
      expect(summary).not.toContain("node 20")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentGetContext with query test complete",
        meta: {},
      })
    })

    it("returns no-match memory summary when query does not match any facts", async () => {
      const factsContent = buildFactsJsonl([
        { text: "Agent context details here", id: "f1" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentGetContext } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentGetContext({
        agent: "test-agent",
        friendId: "friend-1",
        question: "favorite color",
      })

      expect(result.ok).toBe(true)
      const data = result.data as Record<string, unknown>
      expect(data.memorySummary).toBe("No relevant memories found for: favorite color")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentGetContext no match test complete",
        meta: {},
      })
    })

    it("returns last 10 facts as summary when no query is provided", async () => {
      const factsContent = buildFactsJsonl([
        { text: "Fact one about something", id: "f1" },
        { text: "Fact two about another", id: "f2" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentGetContext } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentGetContext({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      const data = result.data as Record<string, unknown>
      const summary = data.memorySummary as string
      expect(summary).toContain("Fact one")
      expect(summary).toContain("Fact two")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentGetContext summary test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentSearchMemory", () => {
    it("returns formatted matches from facts.jsonl", async () => {
      const factsContent = buildFactsJsonl([
        { text: "Deployment process uses Docker", id: "f1", source: "conversation", createdAt: "2026-03-25T10:00:00Z" },
        { text: "Testing requires node 20", id: "f2", source: "inner-dialog", createdAt: "2026-03-25T11:00:00Z" },
        { text: "Deployment schedule is weekly", id: "f3", source: "conversation", createdAt: "2026-03-25T12:00:00Z" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentSearchMemory } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentSearchMemory({
        agent: "test-agent",
        friendId: "friend-1",
        query: "deployment",
      })

      expect(result.ok).toBe(true)
      const data = result.data as { matches: string[] }
      expect(data.matches.length).toBe(2)
      // Verify [fact] format with source and createdAt
      expect(data.matches[0]).toContain("[fact]")
      expect(data.matches[0]).toContain("Deployment process uses Docker")
      expect(data.matches[0]).toContain("source=conversation")
      expect(data.matches[1]).toContain("Deployment schedule is weekly")
      // Must not contain embedding data
      expect(data.matches[0]).not.toContain("0.1")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentSearchMemory with matches test complete",
        meta: {},
      })
    })

    it("returns empty matches when no facts match query", async () => {
      const factsContent = buildFactsJsonl([
        { text: "Testing requires node 20", id: "f1" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentSearchMemory } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentSearchMemory({
        agent: "test-agent",
        friendId: "friend-1",
        query: "deployment",
      })

      expect(result.ok).toBe(true)
      expect(result.message).toBe("No matches found")
      const data = result.data as { matches: string[] }
      expect(data.matches).toHaveLength(0)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentSearchMemory no match test complete",
        meta: {},
      })
    })

    it("returns error when query is missing", async () => {
      const { handleAgentSearchMemory } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentSearchMemory({
        agent: "test-agent",
        friendId: "friend-1",
      })

      expect(result.ok).toBe(false)
      expect(result.error).toContain("query")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentSearchMemory missing query test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentGetTask", () => {
    it("returns no-tasks message when tasks dir does not exist", async () => {
      const { handleAgentGetTask } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentGetTask({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      expect(result.message).toContain("No active tasks")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentGetTask empty test complete",
        meta: {},
      })
    })

    it("lists task markdown files with status lines", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.endsWith("tasks")) return true
        if (s.includes("facts.jsonl")) return false
        return true
      })
      vi.mocked(fs.readdirSync).mockReturnValue(["2026-03-doing-fix-build.md", "2026-02-done-deploy.md", "planning.md"] as unknown as ReturnType<typeof fs.readdirSync>)
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("doing-fix-build")) return "# Fix Build\nStatus: in progress\n"
        return "# Other Task\nStatus: unknown\n"
      })

      const { handleAgentGetTask } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentGetTask({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      const data = result.data as { tasks: Array<{ name: string; statusLine: string }>; activeCount: number; totalCount: number }
      // Should find the "doing" file (not done)
      expect(data.activeCount).toBe(1)
      expect(data.totalCount).toBe(3)
      // Active tasks shown when available
      expect(data.tasks).toHaveLength(1)
      expect(data.tasks[0].name).toBe("2026-03-doing-fix-build.md")
      expect(data.tasks[0].statusLine).toBe("# Fix Build")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentGetTask with files test complete",
        meta: {},
      })
    })

    it("falls back to all task files when no 'doing' files exist", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.endsWith("tasks")) return true
        return true
      })
      vi.mocked(fs.readdirSync).mockReturnValue(["planning.md", "notes.md"] as unknown as ReturnType<typeof fs.readdirSync>)
      vi.mocked(fs.readFileSync).mockReturnValue("# Planning\nSome content\n")

      const { handleAgentGetTask } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentGetTask({ agent: "test-agent", friendId: "friend-1" })

      expect(result.ok).toBe(true)
      const data = result.data as { tasks: Array<{ name: string }>; activeCount: number; totalCount: number }
      expect(data.activeCount).toBe(0)
      expect(data.tasks).toHaveLength(2)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentGetTask fallback test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentCheckScope", () => {
    it("checks if item is in scope", async () => {
      const { handleAgentCheckScope } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentCheckScope({
        agent: "test-agent",
        friendId: "friend-1",
        item: "add error handling to the API",
      })

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentCheckScope test complete",
        meta: {},
      })
    })

    it("returns error when item is missing", async () => {
      const { handleAgentCheckScope } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentCheckScope({
        agent: "test-agent",
        friendId: "friend-1",
      })

      expect(result.ok).toBe(false)
      expect(result.error).toContain("item")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentCheckScope missing item test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentRequestDecision", () => {
    it("accepts a decision request", async () => {
      const { handleAgentRequestDecision } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentRequestDecision({
        agent: "test-agent",
        friendId: "friend-1",
        topic: "Should we use REST or GraphQL?",
        options: ["REST", "GraphQL"],
      })

      expect(result.ok).toBe(true)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentRequestDecision test complete",
        meta: {},
      })
    })

    it("returns error when topic is missing", async () => {
      const { handleAgentRequestDecision } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentRequestDecision({
        agent: "test-agent",
        friendId: "friend-1",
      })

      expect(result.ok).toBe(false)
      expect(result.error).toContain("topic")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentRequestDecision missing topic test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentCheckGuidance", () => {
    it("returns no guidance when no memory exists", async () => {
      const { handleAgentCheckGuidance } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentCheckGuidance({
        agent: "test-agent",
        friendId: "friend-1",
        topic: "error handling patterns",
      })

      expect(result.ok).toBe(true)
      expect(result.message).toContain("No specific guidance found for: error handling patterns")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentCheckGuidance test complete",
        meta: {},
      })
    })

    it("returns relevant facts as guidance when they match the topic", async () => {
      const factsContent = buildFactsJsonl([
        { text: "Error handling: always use try-catch", id: "f1" },
        { text: "Logging: use structured logs", id: "f2" },
        { text: "Error handling: wrap async calls", id: "f3" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentCheckGuidance } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentCheckGuidance({
        agent: "test-agent",
        friendId: "friend-1",
        topic: "error handling",
      })

      expect(result.ok).toBe(true)
      expect(result.message).toContain("Relevant guidance:")
      expect(result.message).toContain("always use try-catch")
      expect(result.message).toContain("wrap async calls")
      // Should not include unrelated fact
      expect(result.message).not.toContain("structured logs")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentCheckGuidance with matches test complete",
        meta: {},
      })
    })

    it("returns no guidance when facts exist but do not match topic", async () => {
      const factsContent = buildFactsJsonl([
        { text: "Deployment process uses Docker", id: "f1" },
      ])

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p)
        if (s.includes("facts.jsonl")) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(factsContent)

      const { handleAgentCheckGuidance } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentCheckGuidance({
        agent: "test-agent",
        friendId: "friend-1",
        topic: "kubernetes",
      })

      expect(result.ok).toBe(true)
      expect(result.message).toContain("No specific guidance found for: kubernetes")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentCheckGuidance no match test complete",
        meta: {},
      })
    })

    it("returns error when topic is missing", async () => {
      const { handleAgentCheckGuidance } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentCheckGuidance({
        agent: "test-agent",
        friendId: "friend-1",
      })

      expect(result.ok).toBe(false)
      expect(result.error).toContain("topic")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentCheckGuidance missing topic test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentReportProgress", () => {
    it("accepts progress report", async () => {
      const { handleAgentReportProgress } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentReportProgress({
        agent: "test-agent",
        friendId: "friend-1",
        summary: "Tests passing, 80% done",
      })

      expect(result.ok).toBe(true)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentReportProgress test complete",
        meta: {},
      })
    })

    it("returns error when summary is missing", async () => {
      const { handleAgentReportProgress } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentReportProgress({
        agent: "test-agent",
        friendId: "friend-1",
      })

      expect(result.ok).toBe(false)
      expect(result.error).toContain("summary")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentReportProgress missing summary test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentReportBlocker", () => {
    it("accepts blocker report", async () => {
      const { handleAgentReportBlocker } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentReportBlocker({
        agent: "test-agent",
        friendId: "friend-1",
        blocker: "CI pipeline is down",
      })

      expect(result.ok).toBe(true)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentReportBlocker test complete",
        meta: {},
      })
    })

    it("returns error when blocker is missing", async () => {
      const { handleAgentReportBlocker } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentReportBlocker({
        agent: "test-agent",
        friendId: "friend-1",
      })

      expect(result.ok).toBe(false)
      expect(result.error).toContain("blocker")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentReportBlocker missing blocker test complete",
        meta: {},
      })
    })
  })

  describe("handleAgentReportComplete", () => {
    it("accepts completion report", async () => {
      const { handleAgentReportComplete } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentReportComplete({
        agent: "test-agent",
        friendId: "friend-1",
        summary: "All tests passing, PR created",
      })

      expect(result.ok).toBe(true)

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentReportComplete test complete",
        meta: {},
      })
    })

    it("returns error when summary is missing", async () => {
      const { handleAgentReportComplete } = await import("../../../heart/daemon/agent-service")
      const result = await handleAgentReportComplete({
        agent: "test-agent",
        friendId: "friend-1",
      })

      expect(result.ok).toBe(false)
      expect(result.error).toContain("summary")

      emitNervesEvent({
        component: "daemon",
        event: "daemon.agent_service_test_end",
        message: "handleAgentReportComplete missing summary test complete",
        meta: {},
      })
    })
  })
})
