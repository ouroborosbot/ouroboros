import { describe, it, expect, vi, beforeEach } from "vitest"
import type OpenAI from "openai"

describe("estimateTokens", () => {
  beforeEach(() => { vi.resetModules() })

  it("returns 0 for empty array", async () => {
    const { estimateTokens } = await import("../context")
    expect(estimateTokens([])).toBe(0)
  })

  it("returns char count / 4 rounded up for a single user message", async () => {
    const { estimateTokens } = await import("../context")
    // "hello" = 5 chars, 5/4 = 1.25, ceil = 2
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "user", content: "hello" },
    ]
    expect(estimateTokens(msgs)).toBe(2)
  })

  it("sums across multiple messages", async () => {
    const { estimateTokens } = await import("../context")
    // "hello" (5) + "world!" (6) = 11 chars, 11/4 = 2.75, ceil = 3
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world!" },
    ]
    expect(estimateTokens(msgs)).toBe(3)
  })

  it("counts stringified tool_calls (function name + arguments)", async () => {
    const { estimateTokens } = await import("../context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "assistant",
        tool_calls: [
          {
            id: "tc1",
            type: "function" as const,
            function: { name: "read_file", arguments: '{"path":"/tmp/test.txt"}' },
          },
        ],
      } as any,
    ]
    // "read_file" (9) + '{"path":"/tmp/test.txt"}' (24) = 33 chars, 33/4 = 8.25, ceil = 9
    expect(estimateTokens(msgs)).toBe(9)
  })

  it("counts tool result content", async () => {
    const { estimateTokens } = await import("../context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "tool", tool_call_id: "tc1", content: "file contents here" } as any,
    ]
    // "file contents here" = 18 chars, 18/4 = 4.5, ceil = 5
    expect(estimateTokens(msgs)).toBe(5)
  })

  it("counts assistant message with both content and tool_calls", async () => {
    const { estimateTokens } = await import("../context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "assistant",
        content: "let me check",
        tool_calls: [
          {
            id: "tc1",
            type: "function" as const,
            function: { name: "shell", arguments: '{"command":"ls"}' },
          },
        ],
      } as any,
    ]
    // "let me check" (12) + "shell" (5) + '{"command":"ls"}' (16) = 33 chars, ceil(33/4) = 9
    expect(estimateTokens(msgs)).toBe(9)
  })
})

describe("cachedBuildSystem", () => {
  beforeEach(() => { vi.resetModules() })

  it("calls buildFn on first call and returns result", async () => {
    const { cachedBuildSystem, resetSystemPromptCache } = await import("../context")
    resetSystemPromptCache()
    const buildFn = vi.fn().mockReturnValue("system prompt v1")
    const result = cachedBuildSystem("cli", buildFn)
    expect(result).toBe("system prompt v1")
    expect(buildFn).toHaveBeenCalledWith("cli")
    expect(buildFn).toHaveBeenCalledTimes(1)
  })

  it("returns cached result on second call within 60s", async () => {
    const { cachedBuildSystem, resetSystemPromptCache } = await import("../context")
    resetSystemPromptCache()
    const buildFn = vi.fn().mockReturnValue("system prompt v1")
    cachedBuildSystem("cli", buildFn)
    const result2 = cachedBuildSystem("cli", buildFn)
    expect(result2).toBe("system prompt v1")
    expect(buildFn).toHaveBeenCalledTimes(1)
  })

  it("re-invokes buildFn after 60 seconds", async () => {
    const { cachedBuildSystem, resetSystemPromptCache } = await import("../context")
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
    const { cachedBuildSystem, resetSystemPromptCache } = await import("../context")
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

  it("returns messages unchanged when under limit", async () => {
    const { trimMessages } = await import("../context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]
    const result = trimMessages(msgs, 80000, 20)
    expect(result).toEqual(msgs)
    expect(result).not.toBe(msgs) // new array, not mutated
  })

  it("preserves system prompt and drops oldest messages when over limit", async () => {
    const { trimMessages } = await import("../context")
    // System prompt: 40 chars = 10 tokens
    // Each user message: 40 chars = 10 tokens
    const sys = "a".repeat(40)
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: sys },
      { role: "user", content: "b".repeat(40) }, // oldest - should be dropped
      { role: "assistant", content: "c".repeat(40) }, // second oldest - should be dropped
      { role: "user", content: "d".repeat(40) }, // keep
      { role: "assistant", content: "e".repeat(40) }, // keep
    ]
    // Total: 200 chars = 50 tokens
    // maxTokens=30, contextMargin=20 -> trim target = 30 * 0.8 = 24
    // Need to drop until remaining <= 24 tokens
    // Drop msg[1] (10 tokens): 50-10 = 40 > 24
    // Drop msg[2] (10 tokens): 40-10 = 30 > 24
    // Drop msg[3] (10 tokens): 30-10 = 20 <= 24
    // Result: [sys, msg[4]] = [sys, e*40]
    const result = trimMessages(msgs, 30, 20)
    expect(result.length).toBe(2)
    expect(result[0]).toEqual({ role: "system", content: sys })
    expect(result[1]).toEqual({ role: "assistant", content: "e".repeat(40) })
  })

  it("does not mutate input array", async () => {
    const { trimMessages } = await import("../context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "a".repeat(40) },
      { role: "user", content: "b".repeat(40) },
      { role: "user", content: "c".repeat(40) },
    ]
    const originalLength = msgs.length
    trimMessages(msgs, 10, 20)
    expect(msgs.length).toBe(originalLength)
  })

  it("keeps system prompt even if it alone exceeds limit", async () => {
    const { trimMessages } = await import("../context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "a".repeat(400) }, // 100 tokens
      { role: "user", content: "b".repeat(40) },
    ]
    // maxTokens=10 -- system prompt alone exceeds, but we still keep it
    const result = trimMessages(msgs, 10, 20)
    expect(result.length).toBe(1)
    expect(result[0].role).toBe("system")
  })

  it("returns only system prompt when all other messages must be trimmed", async () => {
    const { trimMessages } = await import("../context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "a".repeat(400) },
      { role: "user", content: "b".repeat(400) },
    ]
    // maxTokens=5, margin=20 -> trim target=4
    // system "sys" = 1 token. total = 1+100+100=201
    // Need to drop until <= 4. Drop both user messages.
    const result = trimMessages(msgs, 5, 20)
    expect(result.length).toBe(1)
    expect(result[0].role).toBe("system")
  })

  it("does not trim when exactly at maxTokens (boundary)", async () => {
    const { trimMessages } = await import("../context")
    // 4 chars = 1 token
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "abcd" }, // 1 token
      { role: "user", content: "efgh" }, // 1 token
    ]
    // Total: 2 tokens, maxTokens=2 -> no trim
    const result = trimMessages(msgs, 2, 20)
    expect(result.length).toBe(2)
  })

  it("with contextMargin=0, trims to exactly maxTokens", async () => {
    const { trimMessages } = await import("../context")
    const sys = "a".repeat(40) // 10 tokens
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: sys },
      { role: "user", content: "b".repeat(40) }, // 10 tokens
      { role: "user", content: "c".repeat(40) }, // 10 tokens
      { role: "user", content: "d".repeat(40) }, // 10 tokens
    ]
    // Total: 40 tokens. maxTokens=30, margin=0 -> trimTarget=30
    // Drop msg[1] (10 tokens): 40-10=30 <= 30. Done.
    const result = trimMessages(msgs, 30, 0)
    expect(result.length).toBe(3)
    expect(result[0]).toEqual({ role: "system", content: sys })
    expect(result[1]).toEqual({ role: "user", content: "c".repeat(40) })
  })

  it("handles only system prompt (nothing to trim)", async () => {
    const { trimMessages } = await import("../context")
    const msgs: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "hello" },
    ]
    const result = trimMessages(msgs, 80000, 20)
    expect(result.length).toBe(1)
    expect(result[0].role).toBe("system")
  })
})
