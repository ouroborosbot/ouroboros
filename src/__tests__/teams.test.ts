import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChannelCallbacks } from "../core"

// Tests for src/teams.ts Teams channel adapter.
// These test the adapter wiring, think-tag stripping, streaming, and tool status.
// Tests must FAIL (red) because src/teams.ts does not exist yet.

describe("Teams adapter - exports", () => {
  it("exports createTeamsCallbacks", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    expect(typeof teams.createTeamsCallbacks).toBe("function")
  })

  it("exports startTeamsApp", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    expect(typeof teams.startTeamsApp).toBe("function")
  })

  it("exports stripThinkTags", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    expect(typeof teams.stripThinkTags).toBe("function")
  })
})

describe("Teams adapter - stripThinkTags", () => {
  let stripThinkTags: (text: string) => string

  beforeEach(async () => {
    vi.resetModules()
    const teams = await import("../teams")
    stripThinkTags = teams.stripThinkTags
  })

  it("passes through text with no think tags", () => {
    expect(stripThinkTags("hello world")).toBe("hello world")
  })

  it("strips think tag at start", () => {
    expect(stripThinkTags("<think>reasoning</think>visible")).toBe("visible")
  })

  it("strips think tag at end", () => {
    expect(stripThinkTags("visible<think>reasoning</think>")).toBe("visible")
  })

  it("strips think tag in middle", () => {
    expect(stripThinkTags("before<think>inner</think>after")).toBe("beforeafter")
  })

  it("strips multiple think blocks", () => {
    expect(stripThinkTags("<think>a</think>mid<think>b</think>end")).toBe("midend")
  })

  it("returns empty string when content is only think tags", () => {
    expect(stripThinkTags("<think>only thinking</think>")).toBe("")
  })

  it("handles empty string", () => {
    expect(stripThinkTags("")).toBe("")
  })
})

describe("Teams adapter - createTeamsCallbacks", () => {
  let mockStream: { emit: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockStream = {
      emit: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
    }
  })

  it("onModelStart sends thinking status update", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    callbacks.onModelStart()
    expect(mockStream.update).toHaveBeenCalledWith("thinking...")
  })

  it("onTextChunk strips think tags and emits to stream", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    callbacks.onTextChunk("hello world")
    expect(mockStream.emit).toHaveBeenCalledWith("hello world")
  })

  it("onTextChunk strips think tags before emitting", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    callbacks.onTextChunk("<think>reasoning</think>visible text")
    expect(mockStream.emit).toHaveBeenCalledWith("visible text")
  })

  it("onTextChunk does not emit when content is only think tags", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    callbacks.onTextChunk("<think>only thinking</think>")
    expect(mockStream.emit).not.toHaveBeenCalled()
  })

  it("onTextChunk accumulates across chunks and strips correctly", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)

    // Partial think tag split across chunks
    callbacks.onTextChunk("<think>")
    callbacks.onTextChunk("reasoning")
    callbacks.onTextChunk("</think>")
    callbacks.onTextChunk("visible")

    // The "visible" chunk should be emitted
    expect(mockStream.emit).toHaveBeenCalledWith("visible")
  })

  it("onModelStreamStart is a no-op (does not throw)", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    expect(() => callbacks.onModelStreamStart()).not.toThrow()
  })

  it("onToolStart sends informative status", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    callbacks.onToolStart("read_file", { path: "package.json" })
    expect(mockStream.update).toHaveBeenCalledWith("running read_file (package.json)...")
  })

  it("onToolEnd updates status with result summary", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    callbacks.onToolEnd("read_file", "package.json", true)
    expect(mockStream.update).toHaveBeenCalledWith("package.json")
  })

  it("onToolEnd handles empty summary", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    callbacks.onToolEnd("get_current_time", "", true)
    expect(mockStream.update).toHaveBeenCalledWith("get_current_time done")
  })

  it("onToolEnd handles failure", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    callbacks.onToolEnd("read_file", "missing.txt", false)
    expect(mockStream.update).toHaveBeenCalledWith("read_file failed: missing.txt")
  })

  it("onError sends error text to stream", async () => {
    vi.resetModules()
    const teams = await import("../teams")
    const callbacks = teams.createTeamsCallbacks(mockStream as any)
    callbacks.onError(new Error("something broke"))
    expect(mockStream.emit).toHaveBeenCalledWith("Error: something broke")
  })
})

describe("Teams adapter - message handling", () => {
  it("on incoming message, pushes system and user message and calls runAgent", async () => {
    vi.resetModules()

    const mockRunAgent = vi.fn()
    vi.doMock("../core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const teams = await import("../teams")

    const mockStream = {
      emit: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
    }

    await teams.handleTeamsMessage("hello from Teams", mockStream as any)

    // Should call runAgent with messages containing system and user
    expect(mockRunAgent).toHaveBeenCalled()
    const messages = mockRunAgent.mock.calls[0][0]
    expect(messages.some((m: any) => m.role === "system")).toBe(true)
    expect(messages.some((m: any) => m.role === "user" && m.content === "hello from Teams")).toBe(true)
  })

  it("uses single global messages array across calls", async () => {
    vi.resetModules()

    const capturedMessages: any[][] = []
    const mockRunAgent = vi.fn().mockImplementation((msgs: any[]) => {
      capturedMessages.push([...msgs])
    })
    vi.doMock("../core", () => ({
      runAgent: mockRunAgent,
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const teams = await import("../teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }

    await teams.handleTeamsMessage("first", mockStream as any)
    await teams.handleTeamsMessage("second", mockStream as any)

    // Second call should have messages from first call too
    expect(capturedMessages[1].length).toBeGreaterThan(capturedMessages[0].length)
  })

  it("closes stream after runAgent completes", async () => {
    vi.resetModules()

    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const teams = await import("../teams")

    const mockStream = { emit: vi.fn(), update: vi.fn(), close: vi.fn() }
    await teams.handleTeamsMessage("hi", mockStream as any)

    expect(mockStream.close).toHaveBeenCalled()
  })
})
