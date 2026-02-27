import { describe, it, expect, vi, beforeEach } from "vitest"
import type OpenAI from "openai"

// Mock fs for session persistence tests
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

import * as fs from "fs"

// estimateTokens tests removed in Unit 3a -- estimateTokens is deleted

describe("cachedBuildSystem", () => {
  beforeEach(() => { vi.resetModules() })

  it("calls buildFn on first call and returns result", async () => {
    const { cachedBuildSystem, resetSystemPromptCache } = await import("../../mind/context")
    resetSystemPromptCache()
    const buildFn = vi.fn().mockReturnValue("system prompt v1")
    const result = cachedBuildSystem("cli", buildFn)
    expect(result).toBe("system prompt v1")
    expect(buildFn).toHaveBeenCalledWith("cli")
    expect(buildFn).toHaveBeenCalledTimes(1)
  })

  it("returns cached result on second call within 60s", async () => {
    const { cachedBuildSystem, resetSystemPromptCache } = await import("../../mind/context")
    resetSystemPromptCache()
    const buildFn = vi.fn().mockReturnValue("system prompt v1")
    cachedBuildSystem("cli", buildFn)
    const result2 = cachedBuildSystem("cli", buildFn)
    expect(result2).toBe("system prompt v1")
    expect(buildFn).toHaveBeenCalledTimes(1)
  })

  it("re-invokes buildFn after 60 seconds", async () => {
    const { cachedBuildSystem, resetSystemPromptCache } = await import("../../mind/context")
    resetSystemPromptCache()
    const buildFn = vi.fn()
      .mockReturnValueOnce("system prompt v1")
      .mockReturnValueOnce("system prompt v2")

    cachedBuildSystem("cli", buildFn)

    // Advance time by 61 seconds
    vi.useFakeTimers()
    vi.advanceTimersByTime(61000)
    const result = cachedBuildSystem("cli", buildFn)
    vi.useRealTimers()

    expect(result).toBe("system prompt v2")
    expect(buildFn).toHaveBeenCalledTimes(2)
  })

  it("maintains separate caches per channel", async () => {
    const { cachedBuildSystem, resetSystemPromptCache } = await import("../../mind/context")
    resetSystemPromptCache()
    const buildFn = vi.fn()
      .mockReturnValueOnce("cli prompt")
      .mockReturnValueOnce("teams prompt")

    const r1 = cachedBuildSystem("cli", buildFn)
    const r2 = cachedBuildSystem("teams", buildFn)

    expect(r1).toBe("cli prompt")
    expect(r2).toBe("teams prompt")
    expect(buildFn).toHaveBeenCalledTimes(2)
    expect(buildFn).toHaveBeenCalledWith("cli")
    expect(buildFn).toHaveBeenCalledWith("teams")
  })
})

describe("trimMessages", () => {
  beforeEach(() => { vi.resetModules() })

  // New signature: trimMessages(messages, maxTokens, contextMargin, actualTokenCount?)

  it("when actualTokenCount exceeds maxTokens, messages are trimmed", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "old msg" },
      { role: "assistant", content: "old reply" },
      { role: "user", content: "new msg" },
      { role: "assistant", content: "new reply" },
    ]
    // actualTokenCount=120000, maxTokens=80000, margin=20 -> trimTarget=64000
    // perMessageCost = 120000/5 = 24000
    // Need to drop until remaining <= 64000
    // Drop msg[1] (24000): 120000-24000 = 96000 > 64000
    // Drop msg[2] (24000): 96000-24000 = 72000 > 64000
    // Drop msg[3] (24000): 72000-24000 = 48000 <= 64000
    // Result: [sys, msg[4]] = 2 messages
    const result = trimMessages(msgs, 80000, 20, 120000)
    expect(result.length).toBe(2)
    expect(result[0].role).toBe("system")
    expect(result[1]).toBe(msgs[4])
  })

  it("when actualTokenCount is under maxTokens, no trimming occurs", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]
    const result = trimMessages(msgs, 80000, 20, 50000)
    expect(result).toEqual(msgs)
    expect(result).not.toBe(msgs) // new array
  })

  it("system prompt (index 0) is always preserved", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "big message" },
    ]
    // Force heavy trimming
    const result = trimMessages(msgs, 1000, 20, 50000)
    expect(result.length).toBe(1)
    expect(result[0].role).toBe("system")
  })

  it("trims to target: maxTokens * (1 - contextMargin/100)", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]
    // actualTokenCount=100, maxTokens=80, margin=25 -> trimTarget=60
    // perMessageCost=100/4=25
    // Drop msg[1] (25): 100-25=75 > 60
    // Drop msg[2] (25): 75-25=50 <= 60
    // Result: [sys, msg[3]] = 2 messages
    const result = trimMessages(msgs, 80, 25, 100)
    expect(result.length).toBe(2)
    expect(result[0].role).toBe("system")
    expect(result[1]).toBe(msgs[3])
  })

  it("when actualTokenCount is 0, no trimming occurs (cold start)", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]
    const result = trimMessages(msgs, 80000, 20, 0)
    expect(result).toEqual(msgs)
  })

  it("when actualTokenCount is undefined, no trimming occurs (cold start)", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]
    const result = trimMessages(msgs, 80000, 20)
    expect(result).toEqual(msgs)
  })

  it("MAX_MESSAGES hard cap (200) still enforced regardless of token count", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
    ]
    for (let i = 0; i < 299; i++) {
      msgs.push({ role: i % 2 === 0 ? "user" : "assistant", content: "hi" })
    }
    expect(msgs.length).toBe(300)
    // Token count is fine but message count exceeds MAX_MESSAGES
    const result = trimMessages(msgs, 80000, 20, 1000)
    expect(result.length).toBeLessThanOrEqual(200)
    expect(result[0].role).toBe("system")
    expect(result[result.length - 1]).toBe(msgs[msgs.length - 1])
  })

  it("single message (system only) -- nothing to trim", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "hello" },
    ]
    const result = trimMessages(msgs, 80000, 20, 500)
    expect(result.length).toBe(1)
    expect(result[0].role).toBe("system")
  })

  it("all messages would be trimmed -- only system remains", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]
    // Extreme: actualTokenCount very high relative to maxTokens
    const result = trimMessages(msgs, 100, 20, 10000)
    expect(result.length).toBe(1)
    expect(result[0].role).toBe("system")
  })

  it("does not mutate input array", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "reply" },
    ]
    const originalLength = msgs.length
    trimMessages(msgs, 100, 20, 5000)
    expect(msgs.length).toBe(originalLength)
  })

  it("MAX_MESSAGES enforced even when actualTokenCount is undefined", async () => {
    const { trimMessages } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
    ]
    for (let i = 0; i < 250; i++) {
      msgs.push({ role: i % 2 === 0 ? "user" : "assistant", content: "hi" })
    }
    expect(msgs.length).toBe(251)
    const result = trimMessages(msgs, 80000, 20)
    expect(result.length).toBeLessThanOrEqual(200)
    expect(result[0].role).toBe("system")
  })
})

describe("saveSession", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.writeFileSync).mockReset()
    vi.mocked(fs.mkdirSync).mockReset()
  })

  it("writes messages wrapped in versioned envelope", async () => {
    const { saveSession } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]
    saveSession("/tmp/test-session.json", msgs)

    expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp", { recursive: true })
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/tmp/test-session.json",
      JSON.stringify({ version: 1, messages: msgs }, null, 2),
    )
  })

  it("creates parent directories recursively", async () => {
    const { saveSession } = await import("../../mind/context")
    saveSession("/a/b/c/session.json", [])

    expect(fs.mkdirSync).toHaveBeenCalledWith("/a/b/c", { recursive: true })
  })
})

describe("loadSession", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.readFileSync).mockReset()
  })

  it("returns messages array from valid session file", async () => {
    const { loadSession } = await import("../../mind/context")
    const msgs = [{ role: "system", content: "sys" }, { role: "user", content: "hi" }]
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ version: 1, messages: msgs }),
    )
    const result = loadSession("/tmp/session.json")
    expect(result).toEqual(msgs)
  })

  it("returns null when file is missing (ENOENT)", async () => {
    const { loadSession } = await import("../../mind/context")
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err: any = new Error("ENOENT")
      err.code = "ENOENT"
      throw err
    })
    expect(loadSession("/tmp/missing.json")).toBeNull()
  })

  it("returns null when file contains invalid JSON", async () => {
    const { loadSession } = await import("../../mind/context")
    vi.mocked(fs.readFileSync).mockReturnValue("not valid json{{{")
    expect(loadSession("/tmp/corrupt.json")).toBeNull()
  })

  it("returns null when version is unrecognized", async () => {
    const { loadSession } = await import("../../mind/context")
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ version: 99, messages: [] }),
    )
    expect(loadSession("/tmp/future.json")).toBeNull()
  })

  it("returns null on other read errors", async () => {
    const { loadSession } = await import("../../mind/context")
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("EPERM")
    })
    expect(loadSession("/tmp/noperm.json")).toBeNull()
  })
})

describe("deleteSession", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.unlinkSync).mockReset()
  })

  it("removes the session file", async () => {
    const { deleteSession } = await import("../../mind/context")
    deleteSession("/tmp/session.json")
    expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/session.json")
  })

  it("is a no-op when file is missing (ENOENT)", async () => {
    const { deleteSession } = await import("../../mind/context")
    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      const err: any = new Error("ENOENT")
      err.code = "ENOENT"
      throw err
    })
    expect(() => deleteSession("/tmp/missing.json")).not.toThrow()
  })

  it("re-throws non-ENOENT errors", async () => {
    const { deleteSession } = await import("../../mind/context")
    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      const err: any = new Error("EPERM")
      err.code = "EPERM"
      throw err
    })
    expect(() => deleteSession("/tmp/noperm.json")).toThrow("EPERM")
  })
})
