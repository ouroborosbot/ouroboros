import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAgentRoot: vi.fn(() => "/mock/agent/root"),
  extractMemoryHighlights: vi.fn(),
  ensureMemoryStorePaths: vi.fn(),
  appendFactsWithDedup: vi.fn(),
  emitNervesEvent: vi.fn(),
}))

vi.mock("../../identity", () => ({
  getAgentRoot: (...args: any[]) => mocks.getAgentRoot(...args),
}))

vi.mock("../../mind/memory", () => ({
  extractMemoryHighlights: (...args: any[]) => mocks.extractMemoryHighlights(...args),
  ensureMemoryStorePaths: (...args: any[]) => mocks.ensureMemoryStorePaths(...args),
  appendFactsWithDedup: (...args: any[]) => mocks.appendFactsWithDedup(...args),
}))

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: (...args: any[]) => mocks.emitNervesEvent(...args),
}))

import { captureTurnMemories } from "../../mind/memory-capture"

describe("captureTurnMemories", () => {
  beforeEach(() => {
    mocks.getAgentRoot.mockReset().mockReturnValue("/mock/agent/root")
    mocks.extractMemoryHighlights.mockReset().mockReturnValue([])
    mocks.ensureMemoryStorePaths.mockReset().mockReturnValue({
      rootDir: "/mock/agent/root/psyche/memory",
      factsPath: "/mock/agent/root/psyche/memory/facts.jsonl",
      entitiesPath: "/mock/agent/root/psyche/memory/entities.json",
      dailyDir: "/mock/agent/root/psyche/memory/daily",
    })
    mocks.appendFactsWithDedup.mockReset().mockReturnValue({ added: 0, skipped: 0 })
    mocks.emitNervesEvent.mockReset()
  })

  it("captures pre-trim highlights into psyche memory store", () => {
    mocks.extractMemoryHighlights.mockReturnValue(["capture this", "and this too"])
    const now = () => new Date("2026-03-06T01:02:03.000Z")

    captureTurnMemories([{ role: "user", content: "remember: capture this" } as any], "cli", now)

    expect(mocks.ensureMemoryStorePaths).toHaveBeenCalledWith("/mock/agent/root/psyche/memory")
    expect(mocks.appendFactsWithDedup).toHaveBeenCalledWith(
      expect.any(Object),
      [
        {
          id: "cli-2026-03-06T01:02:03.000Z-0",
          text: "capture this",
          source: "cli",
          createdAt: "2026-03-06T01:02:03.000Z",
          embedding: [],
        },
        {
          id: "cli-2026-03-06T01:02:03.000Z-1",
          text: "and this too",
          source: "cli",
          createdAt: "2026-03-06T01:02:03.000Z",
          embedding: [],
        },
      ],
    )
  })

  it("skips store writes when no highlights are found", () => {
    captureTurnMemories([{ role: "assistant", content: "nothing to store" } as any], "teams")

    expect(mocks.ensureMemoryStorePaths).not.toHaveBeenCalled()
    expect(mocks.appendFactsWithDedup).not.toHaveBeenCalled()
  })

  it("swallows capture errors and emits warn telemetry", () => {
    mocks.extractMemoryHighlights.mockReturnValue(["capture this"])
    mocks.ensureMemoryStorePaths.mockImplementation(() => {
      throw new Error("disk unavailable")
    })

    expect(() =>
      captureTurnMemories([{ role: "user", content: "remember: capture this" } as any], "teams"),
    ).not.toThrow()
    expect(mocks.emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
        event: "mind.memory_capture_error",
        component: "mind",
      }),
    )
  })

  it("stringifies non-Error failures in telemetry metadata", () => {
    mocks.extractMemoryHighlights.mockReturnValue(["capture this"])
    mocks.ensureMemoryStorePaths.mockImplementation(() => {
      throw "disk offline"
    })

    captureTurnMemories([{ role: "user", content: "remember: capture this" } as any], "teams")

    expect(mocks.emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          source: "teams",
          reason: "disk offline",
        }),
      }),
    )
  })
})
