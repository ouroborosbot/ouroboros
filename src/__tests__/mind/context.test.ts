import { describe, it, expect, vi, beforeEach } from "vitest"
import type OpenAI from "openai"

// Mock fs for session persistence tests
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

// Mock config for postTurn tests
vi.mock("../../config", () => ({
  getContextConfig: vi.fn().mockReturnValue({ maxTokens: 80000, contextMargin: 20 }),
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

  // --- Unit 3c: saveSession with lastUsage ---

  it("includes lastUsage in JSON envelope when provided", async () => {
    const { saveSession } = await import("../../mind/context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
    ]
    const usage = { input_tokens: 100, output_tokens: 50, reasoning_tokens: 10, total_tokens: 150 }
    saveSession("/tmp/session.json", msgs, usage)

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/tmp/session.json",
      JSON.stringify({ version: 1, messages: msgs, lastUsage: usage }, null, 2),
    )
  })

  it("omits lastUsage from envelope when not provided", async () => {
    const { saveSession } = await import("../../mind/context")
    saveSession("/tmp/session.json", [])

    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.lastUsage).toBeUndefined()
  })
})

describe("loadSession", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.readFileSync).mockReset()
  })

  // --- Unit 3c: loadSession returns { messages, lastUsage } ---

  it("returns { messages, lastUsage } from valid session file", async () => {
    const { loadSession } = await import("../../mind/context")
    const msgs = [{ role: "system", content: "sys" }, { role: "user", content: "hi" }]
    const usage = { input_tokens: 100, output_tokens: 50, reasoning_tokens: 10, total_tokens: 150 }
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ version: 1, messages: msgs, lastUsage: usage }),
    )
    const result = loadSession("/tmp/session.json")
    expect(result).toEqual({ messages: msgs, lastUsage: usage })
  })

  it("returns lastUsage: undefined when not present in saved file", async () => {
    const { loadSession } = await import("../../mind/context")
    const msgs = [{ role: "system", content: "sys" }]
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ version: 1, messages: msgs }),
    )
    const result = loadSession("/tmp/session.json")
    expect(result).toEqual({ messages: msgs, lastUsage: undefined })
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

// --- Unit 3e: postTurn function ---

describe("postTurn", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.writeFileSync).mockReset()
    vi.mocked(fs.mkdirSync).mockReset()
  })

  it("trims messages when usage.input_tokens exceeds maxTokens and saves with lastUsage", async () => {
    const { getContextConfig } = await import("../../config")
    vi.mocked(getContextConfig).mockReturnValue({ maxTokens: 80000, contextMargin: 20 })

    const { postTurn } = await import("../../mind/context")
    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "old" },
      { role: "assistant", content: "old reply" },
      { role: "user", content: "new" },
      { role: "assistant", content: "new reply" },
    ]
    const usage = { input_tokens: 120000, output_tokens: 50, reasoning_tokens: 10, total_tokens: 120050 }
    postTurn(messages, "/tmp/sess.json", usage)

    // Messages should be trimmed (120000 > 80000)
    expect(messages.length).toBeLessThan(5)
    expect(messages[0].role).toBe("system")
    // Session should be saved with lastUsage
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string)
    expect(written.lastUsage).toEqual(usage)
  })

  it("does not trim when usage is undefined (cold start) but still saves session", async () => {
    const { getContextConfig } = await import("../../config")
    vi.mocked(getContextConfig).mockReturnValue({ maxTokens: 80000, contextMargin: 20 })

    const { postTurn } = await import("../../mind/context")
    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]
    postTurn(messages, "/tmp/sess.json")

    expect(messages.length).toBe(2)
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1)
  })

  it("does not trim when usage.input_tokens is under maxTokens, saves with lastUsage", async () => {
    const { getContextConfig } = await import("../../config")
    vi.mocked(getContextConfig).mockReturnValue({ maxTokens: 80000, contextMargin: 20 })

    const { postTurn } = await import("../../mind/context")
    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]
    const usage = { input_tokens: 50000, output_tokens: 10, reasoning_tokens: 0, total_tokens: 50010 }
    postTurn(messages, "/tmp/sess.json", usage)

    expect(messages.length).toBe(2)
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string)
    expect(written.lastUsage).toEqual(usage)
  })

  it("mutates messages array in place (splice, not copy)", async () => {
    const { getContextConfig } = await import("../../config")
    vi.mocked(getContextConfig).mockReturnValue({ maxTokens: 100, contextMargin: 20 })

    const { postTurn } = await import("../../mind/context")
    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]
    const originalRef = messages
    const usage = { input_tokens: 10000, output_tokens: 10, reasoning_tokens: 0, total_tokens: 10010 }
    postTurn(messages, "/tmp/sess.json", usage)

    // Same reference, mutated in place
    expect(messages).toBe(originalRef)
    expect(messages.length).toBeLessThan(4)
    expect(messages[0].role).toBe("system")
  })

  it("saves with (possibly trimmed) messages and usage", async () => {
    const { getContextConfig } = await import("../../config")
    vi.mocked(getContextConfig).mockReturnValue({ maxTokens: 80000, contextMargin: 20 })

    const { postTurn } = await import("../../mind/context")
    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]
    const usage = { input_tokens: 50000, output_tokens: 10, reasoning_tokens: 0, total_tokens: 50010 }
    postTurn(messages, "/tmp/sess.json", usage)

    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string)
    expect(written.version).toBe(1)
    expect(written.messages).toEqual(messages)
    expect(written.lastUsage).toEqual(usage)
  })

  it("handles empty messages array (only system prompt)", async () => {
    const { getContextConfig } = await import("../../config")
    vi.mocked(getContextConfig).mockReturnValue({ maxTokens: 80000, contextMargin: 20 })

    const { postTurn } = await import("../../mind/context")
    const messages: any[] = [
      { role: "system", content: "sys" },
    ]
    const usage = { input_tokens: 1000, output_tokens: 10, reasoning_tokens: 0, total_tokens: 1010 }
    postTurn(messages, "/tmp/sess.json", usage)

    expect(messages.length).toBe(1)
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1)
  })
})
