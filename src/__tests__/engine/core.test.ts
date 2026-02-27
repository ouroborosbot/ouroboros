import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Default readFileSync: return psyche file stubs so prompt.ts module-level loads work
function defaultReadFileSync(filePath: any, _encoding?: any): string {
  const p = String(filePath)
  if (p.endsWith("SOUL.md")) return "mock soul"
  if (p.endsWith("IDENTITY.md")) return "mock identity"
  if (p.endsWith("LORE.md")) return "mock lore"
  if (p.endsWith("FRIENDS.md")) return "mock friends"
  if (p.endsWith("package.json")) return JSON.stringify({ name: "other" })
  return ""
}

// Mock fs and child_process before importing core
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(defaultReadFileSync),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}))

vi.mock("../../repertoire/skills", () => ({
  listSkills: vi.fn(),
  loadSkill: vi.fn(),
}))

// We need to mock OpenAI before importing core
const mockCreate = vi.fn()
const mockResponsesCreate = vi.fn()
vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    }
    responses = {
      create: mockResponsesCreate,
    }
    constructor(_opts?: any) {}
  }
  return {
    default: MockOpenAI,
    AzureOpenAI: MockOpenAI,
  }
})

import * as fs from "fs"
import { execSync, spawnSync } from "child_process"
import type { ChannelCallbacks } from "../../engine/core"

// Set env var before importing core
process.env.MINIMAX_API_KEY = "test-key"
process.env.MINIMAX_MODEL = "test-model"

describe("isTransientError", () => {
  it("detects Node.js network error codes", async () => {
    const { isTransientError } = await import("../../engine/core")
    for (const code of ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EPIPE",
                         "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "ECONNABORTED"]) {
      const err: any = new Error("fail")
      err.code = code
      expect(isTransientError(err)).toBe(true)
    }
  })

  it("detects fetch/network errors by message", async () => {
    const { isTransientError } = await import("../../engine/core")
    expect(isTransientError(new Error("fetch failed"))).toBe(true)
    expect(isTransientError(new Error("network error"))).toBe(true)
    expect(isTransientError(new Error("socket hang up"))).toBe(true)
    expect(isTransientError(new Error("getaddrinfo ENOTFOUND"))).toBe(true)
    expect(isTransientError(new Error("ECONNRESET by peer"))).toBe(true)
    expect(isTransientError(new Error("ETIMEDOUT waiting"))).toBe(true)
  })

  it("detects HTTP status codes 429 and 5xx", async () => {
    const { isTransientError } = await import("../../engine/core")
    for (const status of [429, 500, 502, 503, 504]) {
      const err: any = new Error("server error")
      err.status = status
      expect(isTransientError(err)).toBe(true)
    }
  })

  it("returns false for non-transient errors", async () => {
    const { isTransientError } = await import("../../engine/core")
    expect(isTransientError(new Error("invalid request"))).toBe(false)
    expect(isTransientError(new Error("authentication failed"))).toBe(false)
    expect(isTransientError("not an error")).toBe(false)
    expect(isTransientError(new Error())).toBe(false) // empty message
    const err: any = new Error("bad request")
    err.status = 400
    expect(isTransientError(err)).toBe(false)
  })

  it("returns false for context overflow messages (not transient)", async () => {
    const { isTransientError } = await import("../../engine/core")
    expect(isTransientError(new Error("context_length_exceeded"))).toBe(false)
    expect(isTransientError(new Error("context window exceeds limit"))).toBe(false)
  })
})

describe("ChannelCallbacks interface", () => {
  it("accepts an object with all required callback signatures", () => {
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (_text: string) => {},
      onReasoningChunk: (_text: string) => {},
      onToolStart: (_name: string, _args: Record<string, string>) => {},
      onToolEnd: (_name: string, _summary: string, _success: boolean) => {},
      onError: (_error: Error) => {},
    }
    // Type check passes if this compiles
    expect(callbacks).toBeDefined()
    expect(typeof callbacks.onModelStart).toBe("function")
    expect(typeof callbacks.onModelStreamStart).toBe("function")
    expect(typeof callbacks.onTextChunk).toBe("function")
    expect(typeof callbacks.onReasoningChunk).toBe("function")
    expect(typeof callbacks.onToolStart).toBe("function")
    expect(typeof callbacks.onToolEnd).toBe("function")
    expect(typeof callbacks.onError).toBe("function")
  })
})

describe("runAgent", () => {
  let runAgent: (messages: any[], callbacks: ChannelCallbacks, channel?: string, signal?: AbortSignal, options?: { toolChoiceRequired?: boolean; maxKicks?: number }) => Promise<{ usage?: any }>

  // Helper to create an async iterable from chunks
  function makeStream(chunks: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    }
  }

  function makeChunk(content?: string, toolCalls?: any[]) {
    const delta: any = {}
    if (content !== undefined) delta.content = content
    if (toolCalls !== undefined) delta.tool_calls = toolCalls
    return { choices: [{ delta }] }
  }

  // Helper for Responses API events (flat { type, delta, ... } objects)
  function makeResponsesStream(events: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) {
          yield event
        }
      },
    }
  }

  beforeEach(async () => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    mockCreate.mockReset()
    mockResponsesCreate.mockReset()
    // Restore default readFileSync so prompt.ts module-level psyche file loads work
    vi.mocked(fs.readFileSync).mockImplementation(defaultReadFileSync)

    const core = await import("../../engine/core")
    runAgent = core.runAgent
  })

  it("fires onModelStart before API call", async () => {
    const order: string[] = []
    mockCreate.mockImplementation(() => {
      order.push("api_call")
      return makeStream([makeChunk("hello")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => order.push("onModelStart"),
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    expect(order[0]).toBe("onModelStart")
    expect(order[1]).toBe("api_call")
  })

  it("fires onModelStreamStart on first content token", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello"), makeChunk(" world")])
    )

    const calls: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => calls.push("streamStart"),
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // onModelStreamStart should fire exactly once
    expect(calls).toEqual(["streamStart"])
  })

  it("routes inline think tags to onReasoningChunk and answer to onTextChunk (single chunk)", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>reasoning</think>answer")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("routes inline think tags split across chunks", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<think>"),
        makeChunk("reasoning"),
        makeChunk("</think>"),
        makeChunk("answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("content-only (no think tags) goes only to onTextChunk", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("just text")]))

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(textChunks).toEqual(["just text"])
    expect(reasoningChunks).toEqual([])
  })

  it("think-only content goes only to onReasoningChunk", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>only thinking</think>")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("only thinking")
    expect(textChunks).toEqual([])
  })

  it("handles multiple think blocks in content", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>a</think>mid<think>b</think>end")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("ab")
    expect(textChunks.join("")).toBe("midend")
  })

  it("handles partial think tag at chunk boundary", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("some text<thi"),
        makeChunk("nk>reasoning</think>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("some textanswer")
  })

  it("handles think tags split across many chunks", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<th"),
        makeChunk("ink>"),
        makeChunk("reas"),
        makeChunk("oning</thi"),
        makeChunk("nk>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("handles partial close tag at chunk boundary inside think block", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<think>reasoning</"),
        makeChunk("think>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("flushes remaining content buffer as text at end of stream", async () => {
    // Content that ends with a partial <think> prefix -- at flush time, treated as plain text
    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello<th")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(textChunks.join("")).toBe("hello<th")
    expect(reasoningChunks).toEqual([])
  })

  it("flushes remaining reasoning buffer at end of stream (unclosed think)", async () => {
    // Think block that never closes -- at flush time, remaining buffer is reasoning
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>unterminated reasoning")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("unterminated reasoning")
    expect(textChunks).toEqual([])
  })

  it("retains partial close tag prefix in reasoning buffer across chunks", async () => {
    // Reasoning text ending with partial </think> prefix: "reasoning</"
    // Next chunk completes it: "think>answer"
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<think>reasoning</"),
        makeChunk("think>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("flushes partial close tag prefix as reasoning at end of stream", async () => {
    // Stream ends with buffer holding a partial </think> prefix inside think block
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>reasoning</")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // "reasoning" is emitted during chunked processing, "</" is flushed at end as reasoning
    expect(reasoningChunks.join("")).toBe("reasoning</")
    expect(textChunks).toEqual([])
  })

  it("handles empty reasoning before partial close tag prefix", async () => {
    // Think tag opens, then immediately a partial close tag with no reasoning in between
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<think></"),
        makeChunk("think>answer"),
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual([])
    expect(textChunks.join("")).toBe("answer")
  })

  it("handles empty content chunks in think tag processing", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("<think>r</think>text")])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks.join("")).toBe("r")
    expect(textChunks.join("")).toBe("text")
  })

  it("ends loop when response has no tool calls", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("just text")]))

    let modelStartCount = 0
    const callbacks: ChannelCallbacks = {
      onModelStart: () => modelStartCount++,
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // Should only call the model once
    expect(modelStartCount).toBe(1)
  })

  it("fires onToolStart before tool execution and onToolEnd after", async () => {
    // First call: model returns tool call
    // Second call: model returns text only (ending loop)
    vi.mocked(fs.readFileSync).mockReturnValue("file data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"/tmp/test.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const events: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => events.push("modelStart"),
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name, args) => events.push(`toolStart:${name}:${args.path}`),
      onToolEnd: (name, summary, success) => events.push(`toolEnd:${name}:${summary}:${success}`),
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)

    expect(events).toContain("toolStart:read_file:/tmp/test.txt")
    // onToolEnd should appear after toolStart
    const toolStartIdx = events.indexOf("toolStart:read_file:/tmp/test.txt")
    const toolEndIdx = events.findIndex((e) => e.startsWith("toolEnd:read_file"))
    expect(toolEndIdx).toBeGreaterThan(toolStartIdx)
  })

  it("loops back for another model call after tool execution", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"f.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("final answer")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(callCount).toBe(2)
  })

  it("fires onError on API errors and ends loop", async () => {
    mockCreate.mockImplementation(() => {
      throw new Error("API rate limit")
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("API rate limit")
  })

  it("pushes assistant message with content onto messages array", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("hello there")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg.content).toBe("hello there")
  })

  it("pushes assistant message with tool_calls and tool result messages", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("contents")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("ok")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    // Should have: system, assistant (with tool_calls), tool result, assistant (text)
    const toolCallMsg = messages.find(
      (m: any) => m.role === "assistant" && m.tool_calls
    )
    expect(toolCallMsg).toBeDefined()
    expect(toolCallMsg.tool_calls[0].function.name).toBe("read_file")

    const toolResultMsg = messages.find((m: any) => m.role === "tool")
    expect(toolResultMsg).toBeDefined()
    expect(toolResultMsg.tool_call_id).toBe("call_1")
    expect(toolResultMsg.content).toBe("contents")
  })

  it("does NOT push user message (adapter responsibility)", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("response")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [
      { role: "system", content: "test" },
      { role: "user", content: "hi" },
    ]
    const initialLen = messages.length
    await runAgent(messages, callbacks)

    // Only assistant message should be added, no user message
    const userMessages = messages.filter((m: any) => m.role === "user")
    expect(userMessages).toHaveLength(1) // only the one we passed in
  })

  it("handles tool call with arguments split across chunks", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path"' } },
          ]),
          makeChunk(undefined, [
            { index: 0, function: { arguments: ':"/tmp/f.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const toolNames: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name) => toolNames.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(toolNames).toEqual(["read_file"])
  })

  it("handles multiple tool calls in a single response", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data1")
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: "a.txt", isDirectory: () => false } as any,
    ])

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
            { index: 1, id: "call_2", function: { name: "list_directory", arguments: '{"path":"/tmp"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const toolStarts: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(toolStarts).toEqual(["read_file", "list_directory"])
  })

  it("fires onToolEnd with success=false when tool throws", async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("file not found")
    })

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"missing.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("ok")])
    })

    const toolEnds: { name: string; success: boolean }[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: () => {},
      onToolEnd: (name, _summary, success) => toolEnds.push({ name, success }),
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(toolEnds).toHaveLength(1)
    expect(toolEnds[0].success).toBe(false)
  })

  it("skips chunks with no delta", async () => {
    mockCreate.mockReturnValue(
      makeStream([{ choices: [{}] }, makeChunk("text")])
    )

    const chunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => chunks.push(text),
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(chunks).toEqual(["text"])
  })

  it("handles invalid JSON in tool call arguments gracefully", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("fallback")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: "not valid json{" } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const toolStarts: { name: string; args: Record<string, string> }[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name, args) => toolStarts.push({ name, args }),
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // args should be empty object when JSON parse fails
    expect(toolStarts[0].args).toEqual({})
  })

  it("wraps non-Error thrown values in Error in onError callback", async () => {
    mockCreate.mockImplementation(() => {
      throw "string error"
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(errors[0].message).toBe("string error")
  })

  it("pushes assistant message without content when only tool calls are returned", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("result")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    const firstAssistant = messages.find((m: any) => m.role === "assistant")
    // When there's no content, content should not be set on the message
    expect(firstAssistant.content).toBeUndefined()
    expect(firstAssistant.tool_calls).toBeDefined()
  })

  it("handles tool call chunks with missing id and function name", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          // First chunk: no id, no function name -- only index
          makeChunk(undefined, [
            { index: 0 },
          ]),
          // Second chunk: provides id and name
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"x.txt"}' } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)
    const toolMsg = messages.find((m: any) => m.role === "tool")
    expect(toolMsg).toBeDefined()
    expect(toolMsg.content).toBe("data")
  })

  it("handles tool call chunk with no function arguments", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          // Chunk with id and name but no arguments field
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "get_current_time" } },
          ]),
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const toolStarts: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(toolStarts).toContain("get_current_time")
  })

  it("uses MINIMAX_MODEL env var when set", async () => {
    process.env.MINIMAX_MODEL = "custom-model"
    mockCreate.mockReturnValue(makeStream([makeChunk("hi")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.model).toBe("custom-model")
    delete process.env.MINIMAX_MODEL
  })

  it("calls onReasoningChunk for reasoning_content", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "thinking hard" } }] },
        { choices: [{ delta: { content: "answer" } }] },
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual(["thinking hard"])
    expect(textChunks).toEqual(["answer"])
  })

  it("calls onReasoningChunk for reasoning-only stream (kicks then gets real response)", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          { choices: [{ delta: { reasoning_content: "still thinking" } }] },
        ])
      }
      // After kick for empty response, model responds with content
      return makeStream([makeChunk("got it")])
    })

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual(["still thinking"])
    expect(textChunks).toEqual(["got it"])
  })

  it("stops immediately when signal is pre-aborted", async () => {
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const controller = new AbortController()
    controller.abort()
    await runAgent([{ role: "system", content: "test" }], callbacks, undefined, controller.signal)
    // mockCreate should never be called
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("stops streaming when signal is aborted mid-stream", async () => {
    const controller = new AbortController()
    mockCreate.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeChunk("hello")
        controller.abort()
        yield makeChunk(" world") // should be skipped
      },
    })

    const chunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => chunks.push(text),
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks, undefined, controller.signal)
    expect(chunks).toEqual(["hello"])
  })

  it("breaks out of loop cleanly when signal aborted during catch", async () => {
    const controller = new AbortController()
    mockCreate.mockImplementation(() => {
      controller.abort()
      throw new Error("network error")
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    await runAgent([{ role: "system", content: "test" }], callbacks, undefined, controller.signal)
    // Abort in catch path should break cleanly, not fire onError
    expect(errors).toHaveLength(0)
  })

  it("skips remaining tools when signal is aborted mid-tool-execution", async () => {
    const controller = new AbortController()
    vi.mocked(fs.readFileSync).mockReturnValue("data")

    // Return 2 tool calls in one response
    mockCreate.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
          { index: 1, id: "call_2", function: { name: "read_file", arguments: '{"path":"b.txt"}' } },
        ])
      },
    })

    const toolStarts: string[] = []
    let toolEndCount = 0
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => { toolEndCount++; if (toolEndCount === 1) controller.abort() },
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks, undefined, controller.signal)
    // First tool executes, onToolEnd aborts signal, second tool should be skipped
    expect(toolStarts.length).toBe(1)
  })

  it("fires onModelStreamStart on first reasoning_content token", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          { choices: [{ delta: { reasoning_content: "hmm" } }] },
        ])
      }
      return makeStream([makeChunk("ok")])
    })

    const calls: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => calls.push("streamStart"),
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // streamStart fires once for reasoning, once for retry
    expect(calls).toEqual(["streamStart", "streamStart"])
  })

  it("calls onReasoningChunk for each reasoning chunk", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          { choices: [{ delta: { reasoning_content: "step 1" } }] },
          { choices: [{ delta: { reasoning_content: "step 2" } }] },
        ])
      }
      return makeStream([makeChunk("done")])
    })

    const reasoningChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual(["step 1", "step 2"])
  })

  it("handles multiple reasoning_content chunks before content", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "step 1 " } }] },
        { choices: [{ delta: { reasoning_content: "step 2" } }] },
        { choices: [{ delta: { content: "result" } }] },
      ])
    )

    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => textChunks.push(text),
      onReasoningChunk: (text) => reasoningChunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(reasoningChunks).toEqual(["step 1 ", "step 2"])
    expect(textChunks).toEqual(["result"])
  })

  it("Azure provider calls mockResponsesCreate with Responses API params", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    mockResponsesCreate.mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "hello" },
    ]))

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await core.runAgent([{ role: "system", content: "test" }], callbacks)
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).not.toHaveBeenCalled()
    const params = mockResponsesCreate.mock.calls[0][0]
    expect(params.model).toBe("gpt-5.2-chat")
    expect(params.stream).toBe(true)
    expect(params.store).toBe(false)
    expect(params.include).toEqual(["reasoning.encrypted_content"])
    expect(params.reasoning).toEqual({ effort: "medium", summary: "detailed" })
    expect(params.instructions).toBe("test")
    expect(params.tools).toBeDefined()

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("Azure text-only response: assistant message pushed in CC format, loop ends", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    mockResponsesCreate.mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "hello azure" },
    ]))

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await core.runAgent(messages, callbacks)
    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg.content).toBe("hello azure")

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("Azure tool-use turn: tool executed, result pushed, loop continues", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    vi.mocked(fs.readFileSync).mockReturnValue("file contents")

    let callCount = 0
    mockResponsesCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeResponsesStream([
          { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
          { type: "response.function_call_arguments.delta", delta: '{"path":"a.txt"}' },
          { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: '{"path":"a.txt"}' } },
        ])
      }
      return makeResponsesStream([
        { type: "response.output_text.delta", delta: "done" },
      ])
    })

    const core = await import("../../engine/core")
    const toolStarts: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await core.runAgent(messages, callbacks)
    expect(callCount).toBe(2)
    expect(toolStarts).toEqual(["read_file"])
    const toolMsg = messages.find((m: any) => m.role === "tool")
    expect(toolMsg).toBeDefined()
    expect(toolMsg.content).toBe("file contents")

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("Azure native input: output items + function_call_output in correct order", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    vi.mocked(fs.readFileSync).mockReturnValue("data")

    const reasoningItem = { type: "reasoning", id: "r1", summary: [{ text: "thought", type: "summary_text" }], encrypted_content: "enc1" }
    const funcItem = { type: "function_call", id: "fc1", call_id: "c1", name: "read_file", arguments: '{"path":"a.txt"}', status: "completed" }
    let callCount = 0
    mockResponsesCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeResponsesStream([
          { type: "response.output_item.done", item: reasoningItem },
          { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
          { type: "response.function_call_arguments.delta", delta: '{"path":"a.txt"}' },
          { type: "response.output_item.done", item: funcItem },
        ])
      }
      return makeResponsesStream([
        { type: "response.output_text.delta", delta: "done" },
      ])
    })

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await core.runAgent([{ role: "system", content: "test" }, { role: "user", content: "hi" }], callbacks)
    // Second call uses the maintained native input array
    const secondCallInput = mockResponsesCreate.mock.calls[1][0].input
    // Should contain: user("hi"), reasoning, function_call, function_call_output
    const userItem = secondCallInput.find((i: any) => i.role === "user")
    expect(userItem).toBeDefined()
    // Reasoning item in correct position (before function_call, not at end)
    const reasoningIdx = secondCallInput.findIndex((i: any) => i.type === "reasoning")
    const funcCallIdx = secondCallInput.findIndex((i: any) => i.type === "function_call")
    const funcOutputIdx = secondCallInput.findIndex((i: any) => i.type === "function_call_output")
    expect(reasoningIdx).toBeGreaterThan(-1)
    expect(funcCallIdx).toBeGreaterThan(reasoningIdx)
    expect(funcOutputIdx).toBeGreaterThan(funcCallIdx)
    // Original output items preserved (with their id fields)
    expect(secondCallInput[reasoningIdx].encrypted_content).toBe("enc1")
    expect(secondCallInput[funcCallIdx].id).toBe("fc1")
    // function_call_output has the tool result
    expect(secondCallInput[funcOutputIdx].call_id).toBe("c1")
    expect(secondCallInput[funcOutputIdx].output).toBe("data")

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("Azure native input: same array reference reused across iterations", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    vi.mocked(fs.readFileSync).mockReturnValue("data")

    const funcItem = { type: "function_call", id: "fc1", call_id: "c1", name: "read_file", arguments: '{"path":"a.txt"}', status: "completed" }
    // Capture input snapshots at call time
    const inputSnapshots: any[][] = []
    let callCount = 0
    mockResponsesCreate.mockImplementation((params: any) => {
      callCount++
      inputSnapshots.push([...params.input])
      if (callCount === 1) {
        return makeResponsesStream([
          { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
          { type: "response.function_call_arguments.delta", delta: '{"path":"a.txt"}' },
          { type: "response.output_item.done", item: funcItem },
        ])
      }
      return makeResponsesStream([
        { type: "response.output_text.delta", delta: "done" },
      ])
    })

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await core.runAgent([{ role: "system", content: "test" }, { role: "user", content: "hi" }], callbacks)
    // First call: initialized from toResponsesInput (just user message)
    expect(inputSnapshots[0]).toEqual([{ role: "user", content: "hi" }])
    // Second call: same array grew with output items + function_call_output
    expect(inputSnapshots[1].length).toBeGreaterThan(1)
    expect(inputSnapshots[1][0]).toEqual({ role: "user", content: "hi" })
    // It IS the same array reference (mutated in place, not rebuilt)
    expect(mockResponsesCreate.mock.calls[0][0].input).toBe(mockResponsesCreate.mock.calls[1][0].input)

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("does not pass reasoning params for MiniMax provider", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello")])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    const params = mockCreate.mock.calls[0][0]
    expect(params.reasoning_effort).toBeUndefined()
  })

  it("MiniMax path calls mockCreate, not mockResponsesCreate", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello")])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockResponsesCreate).not.toHaveBeenCalled()
  })

  // --- Unit 1a: Store reasoning items on assistant messages ---

  it("Azure: stores reasoning items as _reasoning_items on assistant message", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    const reasoningItem = { type: "reasoning", id: "r1", summary: [{ text: "thought", type: "summary_text" }], encrypted_content: "enc123" }
    mockResponsesCreate.mockReturnValue(makeResponsesStream([
      { type: "response.output_item.done", item: reasoningItem },
      { type: "response.output_text.delta", delta: "answer" },
    ]))

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await core.runAgent(messages, callbacks)

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg._reasoning_items).toEqual([reasoningItem])

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("Azure: does not set _reasoning_items when outputItems has no reasoning items", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    const messageItem = { type: "message", id: "m1", content: [{ type: "output_text", text: "hello" }] }
    mockResponsesCreate.mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "hello" },
      { type: "response.output_item.done", item: messageItem },
    ]))

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await core.runAgent(messages, callbacks)

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg._reasoning_items).toBeUndefined()

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("Azure: stores only reasoning items when outputItems has mixed types", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    const reasoningItem = { type: "reasoning", id: "r1", summary: [{ text: "thought", type: "summary_text" }], encrypted_content: "enc1" }
    const messageItem = { type: "message", id: "m1", content: [{ type: "output_text", text: "hello" }] }
    mockResponsesCreate.mockReturnValue(makeResponsesStream([
      { type: "response.output_item.done", item: reasoningItem },
      { type: "response.output_text.delta", delta: "hello" },
      { type: "response.output_item.done", item: messageItem },
    ]))

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await core.runAgent(messages, callbacks)

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg._reasoning_items).toEqual([reasoningItem])
    expect(assistantMsg._reasoning_items).toHaveLength(1)

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("Azure: azureInput.push still happens for each outputItem (existing behavior preserved)", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    vi.mocked(fs.readFileSync).mockReturnValue("data")

    const reasoningItem = { type: "reasoning", id: "r1", summary: [], encrypted_content: "enc1" }
    const funcItem = { type: "function_call", id: "fc1", call_id: "c1", name: "read_file", arguments: '{"path":"a.txt"}', status: "completed" }
    let callCount = 0
    mockResponsesCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeResponsesStream([
          { type: "response.output_item.done", item: reasoningItem },
          { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
          { type: "response.function_call_arguments.delta", delta: '{"path":"a.txt"}' },
          { type: "response.output_item.done", item: funcItem },
        ])
      }
      return makeResponsesStream([
        { type: "response.output_text.delta", delta: "done" },
      ])
    })

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }, { role: "user", content: "hi" }]
    await core.runAgent(messages, callbacks)

    // Verify the second call's input still contains reasoning + function_call items (azureInput.push preserved)
    const secondCallInput = mockResponsesCreate.mock.calls[1][0].input
    const reasoningIdx = secondCallInput.findIndex((i: any) => i.type === "reasoning")
    const funcCallIdx = secondCallInput.findIndex((i: any) => i.type === "function_call")
    expect(reasoningIdx).toBeGreaterThan(-1)
    expect(funcCallIdx).toBeGreaterThan(reasoningIdx)

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("MiniMax: does not set _reasoning_items (outputItems always empty)", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello")])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg._reasoning_items).toBeUndefined()
  })

  // --- Unit 3c: runAgent returns { usage } ---

  it("returns usage from single API call (no tool calls)", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("hello"),
        { choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } },
      ])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const result = await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(result.usage).toBeDefined()
    expect(result.usage!.input_tokens).toBe(100)
    expect(result.usage!.output_tokens).toBe(50)
    expect(result.usage!.total_tokens).toBe(150)
  })

  it("returns usage from last API call when multiple tool rounds", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [{ index: 0, id: "c1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } }]),
          { choices: [{ delta: {} }], usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 } },
        ])
      }
      return makeStream([
        makeChunk("done"),
        { choices: [{ delta: {} }], usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 } },
      ])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const result = await runAgent([{ role: "system", content: "test" }], callbacks)
    // Should return usage from the LAST call (200/100/300), not the first (50/20/70)
    expect(result.usage).toBeDefined()
    expect(result.usage!.input_tokens).toBe(200)
    expect(result.usage!.total_tokens).toBe(300)
  })

  it("returns undefined usage when no usage data available", async () => {
    mockCreate.mockReturnValue(
      makeStream([makeChunk("hello")])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const result = await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(result.usage).toBeUndefined()
  })

  it("returns undefined usage on error", async () => {
    mockCreate.mockImplementation(() => { throw new Error("invalid request") })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const result = await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(result.usage).toBeUndefined()
  })

  // ── context overflow auto-recovery ──

  it("recovers from Azure context_length_exceeded error by trimming and retrying", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const err: any = new Error("context_length_exceeded")
        err.code = "context_length_exceeded"
        throw err
      }
      return makeStream([makeChunk("recovered")])
    })

    const errors: Error[] = []
    const chunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (t) => chunks.push(t),
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "old msg 1" },
      { role: "assistant", content: "old reply 1" },
      { role: "user", content: "latest" },
    ]
    await runAgent(messages, callbacks)

    // Should have retried and succeeded
    expect(callCount).toBe(2)
    expect(chunks).toContain("recovered")
    // Should have logged a trim info message
    expect(errors.some(e => e.message.includes("trimm"))).toBe(true)
  })

  it("recovers from Azure overflow via error message (no .code)", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        throw new Error("Request failed: context_length_exceeded for this model")
      }
      return makeStream([makeChunk("ok")])
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "msg" },
    ]
    await runAgent(messages, callbacks)

    expect(callCount).toBe(2) // retry succeeded
  })

  it("recovers from MiniMax context window exceeds limit error", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        throw new Error("context window exceeds limit")
      }
      return makeStream([makeChunk("ok")])
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "msg" },
    ]
    await runAgent(messages, callbacks)

    expect(callCount).toBe(2) // retry succeeded
  })

  it("surfaces error via onError when retry also fails with overflow", async () => {
    mockCreate.mockImplementation(() => {
      const err: any = new Error("context_length_exceeded")
      err.code = "context_length_exceeded"
      throw err
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "msg" },
    ]
    await runAgent(messages, callbacks)

    // First error is trim info, second is the actual overflow error
    expect(errors.length).toBeGreaterThanOrEqual(2)
    expect(errors[errors.length - 1].message).toContain("context_length_exceeded")
  })

  it("does not catch non-overflow errors with overflow recovery", async () => {
    mockCreate.mockImplementation(() => {
      throw new Error("invalid request format")
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [{ role: "system", content: "sys" }]
    await runAgent(messages, callbacks)

    // Should have exactly 1 error (the original error), no retry
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("invalid request format")
  })

  it("strips tool calls before trimming on mid-turn overflow", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First call returns tool calls
        return makeStream([
          makeChunk(undefined, [{ index: 0, id: "tc1", function: { name: "search", arguments: '{"q":"test"}' } }]),
        ])
      }
      if (callCount === 2) {
        // Second call (tool execution done) overflows
        const err: any = new Error("context_length_exceeded")
        err.code = "context_length_exceeded"
        throw err
      }
      // Third call succeeds after trim
      return makeStream([makeChunk("recovered after tool overflow")])
    })

    const toolResults = new Map()
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readdirSync).mockReturnValue([] as any)
    vi.mocked(spawnSync).mockReturnValue({ stdout: "tool result", stderr: "", status: 0 } as any)
    vi.mocked(execSync).mockReturnValue("tool result" as any)

    const errors: Error[] = []
    const chunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (t) => chunks.push(t),
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "do something" },
    ]
    await runAgent(messages, callbacks)

    // Should have recovered after trim
    expect(callCount).toBe(3)
    expect(chunks).toContain("recovered after tool overflow")
    // Messages should not have orphan tool_calls or tool results
    const hasToolMsg = messages.some((m: any) => m.role === "tool")
    // After trim+stripLastToolCalls, tool messages should be cleaned
    expect(errors.some(e => e.message.includes("trimm"))).toBe(true)
  })

  it("handles overflow error with empty message property", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const err: any = new Error()
        err.code = "context_length_exceeded"
        err.message = "" // empty message
        throw err
      }
      return makeStream([makeChunk("ok")])
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "msg" },
    ]
    await runAgent(messages, callbacks)

    expect(callCount).toBe(2) // retry succeeded via .code check
  })

  it("overflow on cold start with only system message still retries", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        throw new Error("context_length_exceeded")
      }
      return makeStream([makeChunk("ok")])
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    // Only system message -- can't trim further, but retry should still happen
    const messages: any[] = [{ role: "system", content: "sys" }]
    await runAgent(messages, callbacks)

    expect(callCount).toBe(2) // retry attempted
  })

  // ── transient network error retry ──

  it("retries on transient network errors with backoff", async () => {
    vi.useFakeTimers()
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount <= 2) {
        const err: any = new Error("fetch failed")
        throw err
      }
      return makeStream([makeChunk("recovered")])
    })

    const errors: Error[] = []
    const chunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (t) => chunks.push(t),
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    const promise = runAgent(messages, callbacks)

    // First retry: 2s delay
    await vi.advanceTimersByTimeAsync(2100)
    // Second retry: 4s delay
    await vi.advanceTimersByTimeAsync(4100)
    // Let setImmediate ticks process
    await vi.advanceTimersByTimeAsync(100)

    await promise

    expect(callCount).toBe(3)
    expect(chunks).toContain("recovered")
    expect(errors.length).toBe(2) // two retry messages
    expect(errors[0].message).toContain("retrying in 2s (1/3)")
    expect(errors[1].message).toContain("retrying in 4s (2/3)")

    vi.useRealTimers()
  })

  it("gives up after MAX_RETRIES transient failures", async () => {
    vi.useFakeTimers()
    mockCreate.mockImplementation(() => {
      const err: any = new Error("connect failed")
      err.code = "ECONNREFUSED"
      throw err
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    const promise = runAgent(messages, callbacks)

    // Advance through all 3 retry delays: 2s, 4s, 8s
    await vi.advanceTimersByTimeAsync(2100)
    await vi.advanceTimersByTimeAsync(4100)
    await vi.advanceTimersByTimeAsync(8100)
    await vi.advanceTimersByTimeAsync(100)

    await promise

    // 3 retry messages + 1 final error
    expect(errors.length).toBe(4)
    expect(errors[0].message).toContain("retrying in 2s (1/3)")
    expect(errors[1].message).toContain("retrying in 4s (2/3)")
    expect(errors[2].message).toContain("retrying in 8s (3/3)")
    expect(errors[3].message).toContain("connect failed")

    vi.useRealTimers()
  })

  it("aborts retry wait on signal abort", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    mockCreate.mockImplementation(() => {
      const err: any = new Error("fetch failed")
      throw err
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    const promise = runAgent(messages, callbacks, undefined, controller.signal)

    // Let it start the first retry wait
    await vi.advanceTimersByTimeAsync(100)
    // Abort during wait
    controller.abort()
    await vi.advanceTimersByTimeAsync(100)

    await promise

    // Only 1 retry message, no final error (clean abort)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain("retrying")

    vi.useRealTimers()
  })

  it("skips retry wait immediately when signal is already aborted", async () => {
    const controller = new AbortController()
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      const err: any = new Error("fetch failed")
      throw err
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      // Abort in the error callback — signal is not yet aborted when the
      // catch block's signal?.aborted check runs, but IS aborted by the
      // time the retry wait promise checks signal.aborted (line 365).
      onError: (err) => { errors.push(err); controller.abort() },
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, controller.signal)

    expect(callCount).toBe(1)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain("retrying")
  })

  it("resets retry count after successful call", async () => {
    vi.useFakeTimers()
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      // First call: tool call
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [{ index: 0, id: "tc1", function: { name: "search", arguments: '{"q":"test"}' } }]),
        ])
      }
      // Second call: network error
      if (callCount === 2) {
        throw new Error("fetch failed")
      }
      // Third call: success after retry
      return makeStream([makeChunk("done")])
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    const promise = runAgent(messages, callbacks)

    // Let first call (tool) + tool exec + second call (error) happen
    await vi.advanceTimersByTimeAsync(100)
    // First retry: 2s
    await vi.advanceTimersByTimeAsync(2100)
    await vi.advanceTimersByTimeAsync(100)

    await promise

    expect(callCount).toBe(3)
    // retry message says (1/3) — counter was reset after first success
    expect(errors.some(e => e.message.includes("1/3"))).toBe(true)

    vi.useRealTimers()
  })

  it("detects HTTP 429 and 5xx as transient errors", async () => {
    vi.useFakeTimers()
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        const err: any = new Error("rate limited")
        err.status = 429
        throw err
      }
      return makeStream([makeChunk("ok")])
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    const promise = runAgent(messages, callbacks)

    await vi.advanceTimersByTimeAsync(2100)
    await vi.advanceTimersByTimeAsync(100)

    await promise

    expect(callCount).toBe(2)
    expect(errors[0].message).toContain("retrying")

    vi.useRealTimers()
  })

  // ── system prompt refresh (Feature 5) ──

  it("refreshes system prompt at start of runAgent when channel is passed", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("hi")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [
      { role: "system", content: "stale old prompt" },
      { role: "user", content: "hello" },
    ]
    await runAgent(messages, callbacks, "cli")

    // messages[0] should have been refreshed with cachedBuildSystem("cli", buildSystem)
    expect(messages[0].content).not.toBe("stale old prompt")
    expect(messages[0].role).toBe("system")
  })

  it("refreshes system prompt for teams channel", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("hi")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [
      { role: "system", content: "stale old prompt" },
      { role: "user", content: "hello" },
    ]
    await runAgent(messages, callbacks, "teams")

    // messages[0] should have been refreshed
    expect(messages[0].content).not.toBe("stale old prompt")
    expect(messages[0].role).toBe("system")
  })

  it("still works without channel parameter (backward compatible)", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("hi")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [
      { role: "system", content: "test" },
      { role: "user", content: "hello" },
    ]
    // No channel parameter -- should still work
    await runAgent(messages, callbacks)
    // Messages should have an assistant reply
    expect(messages.some((m: any) => m.role === "assistant")).toBe(true)
  })
})

describe("getClient", () => {
  const saved: Record<string, string | undefined> = {}
  const allVars = [
    "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_DEPLOYMENT", "AZURE_OPENAI_MODEL_NAME",
    "AZURE_OPENAI_API_VERSION", "MINIMAX_API_KEY", "MINIMAX_MODEL",
  ]

  beforeEach(() => {
    for (const v of allVars) { saved[v] = process.env[v]; delete process.env[v] }
    vi.mocked(fs.readFileSync).mockImplementation(defaultReadFileSync)
  })

  afterEach(() => {
    for (const v of allVars) {
      if (saved[v] !== undefined) process.env[v] = saved[v]
      else delete process.env[v]
    }
  })

  it("exits when no env vars are set", async () => {
    vi.resetModules()

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as any)
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const core = await import("../../engine/core")
      const callbacks: ChannelCallbacks = {
        onModelStart: () => {},
        onModelStreamStart: () => {},
        onTextChunk: () => {},
        onToolStart: () => {},
        onToolEnd: () => {},
        onError: () => {},
      }
      await core.runAgent([], callbacks).catch(() => {})
    } catch {
      // Expected -- process.exit throws
    }

    expect(mockExit).toHaveBeenCalledWith(1)
    expect(mockError).toHaveBeenCalled()

    mockExit.mockRestore()
    mockError.mockRestore()
  })

  it("uses MiniMax when MINIMAX vars are set", async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "mm-key"
    process.env.MINIMAX_MODEL = "MiniMax-M2.5"

    const core = await import("../../engine/core")
    expect(core.getModel()).toBe("MiniMax-M2.5")
    expect(core.getProvider()).toBe("minimax")
  })

  it("prefers Azure when all Azure vars are set", async () => {
    vi.resetModules()
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-4o"
    process.env.MINIMAX_API_KEY = "mm-key"
    process.env.MINIMAX_MODEL = "MiniMax-M2.5"

    const core = await import("../../engine/core")
    expect(core.getModel()).toBe("gpt-4o")
    expect(core.getProvider()).toBe("azure")
  })

  it("falls back to MiniMax when Azure vars are incomplete", async () => {
    vi.resetModules()
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    // Missing endpoint/deployment/model
    process.env.MINIMAX_API_KEY = "mm-key"
    process.env.MINIMAX_MODEL = "MiniMax-M2.5"

    const core = await import("../../engine/core")
    expect(core.getModel()).toBe("MiniMax-M2.5")
    expect(core.getProvider()).toBe("minimax")
  })

  it("caches client across multiple runAgent invocations", async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "mm-key"
    process.env.MINIMAX_MODEL = "cached-model"

    mockCreate.mockReset()
    mockCreate.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: "hi" } }] }
      },
    })

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    // First call initializes getClient()
    await core.runAgent([{ role: "system", content: "test" }], callbacks)
    // Second call hits the cached path (if (!_client) is false)
    await core.runAgent([{ role: "system", content: "test" }], callbacks)

    expect(core.getModel()).toBe("cached-model")
    expect(core.getProvider()).toBe("minimax")
  })

  it("omits model param in createParams when model is empty", async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "mm-key"
    process.env.MINIMAX_MODEL = ""

    mockCreate.mockReset()
    mockCreate.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: "hi" } }] }
      },
    })

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }
    await core.runAgent([{ role: "system", content: "test" }], callbacks)

    // model param should not be in the call since getModel() returns ""
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.model).toBeUndefined()
  })
})

describe("getClient config integration", () => {
  const saved: Record<string, string | undefined> = {}
  const allVars = [
    "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_DEPLOYMENT", "AZURE_OPENAI_MODEL_NAME",
    "AZURE_OPENAI_API_VERSION", "MINIMAX_API_KEY", "MINIMAX_MODEL",
    "OUROBOROS_CONFIG_PATH",
  ]

  beforeEach(() => {
    for (const v of allVars) { saved[v] = process.env[v]; delete process.env[v] }
    vi.mocked(fs.readFileSync).mockImplementation(defaultReadFileSync)
  })

  afterEach(() => {
    for (const v of allVars) {
      if (saved[v] !== undefined) process.env[v] = saved[v]
      else delete process.env[v]
    }
  })

  it("uses azure config from config.json when apiKey is present", async () => {
    vi.resetModules()
    const configData = {
      providers: {
        azure: {
          apiKey: "config-az-key",
          endpoint: "https://config.openai.azure.com",
          deployment: "config-deploy",
          modelName: "config-model",
        },
      },
    }
    process.env.OUROBOROS_CONFIG_PATH = "/tmp/test-config.json"
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (p === "/tmp/test-config.json") return JSON.stringify(configData)
      return JSON.stringify({ name: "other" })
    })

    const { resetConfigCache } = await import("../../config")
    resetConfigCache()
    const core = await import("../../engine/core")
    expect(core.getModel()).toBe("config-model")
    expect(core.getProvider()).toBe("azure")
  })

  it("uses minimax config from config.json when apiKey is present", async () => {
    vi.resetModules()
    const configData = {
      providers: {
        minimax: {
          apiKey: "config-mm-key",
          model: "config-mm-model",
        },
      },
    }
    process.env.OUROBOROS_CONFIG_PATH = "/tmp/test-config.json"
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (p === "/tmp/test-config.json") return JSON.stringify(configData)
      return JSON.stringify({ name: "other" })
    })

    const { resetConfigCache } = await import("../../config")
    resetConfigCache()
    const core = await import("../../engine/core")
    expect(core.getModel()).toBe("config-mm-model")
    expect(core.getProvider()).toBe("minimax")
  })

  it("prefers azure when both providers are configured in config.json", async () => {
    vi.resetModules()
    const configData = {
      providers: {
        azure: {
          apiKey: "az-key",
          endpoint: "https://az.openai.azure.com",
          deployment: "deploy",
          modelName: "az-model",
        },
        minimax: {
          apiKey: "mm-key",
          model: "mm-model",
        },
      },
    }
    process.env.OUROBOROS_CONFIG_PATH = "/tmp/test-config.json"
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (p === "/tmp/test-config.json") return JSON.stringify(configData)
      return JSON.stringify({ name: "other" })
    })

    const { resetConfigCache } = await import("../../config")
    resetConfigCache()
    const core = await import("../../engine/core")
    expect(core.getProvider()).toBe("azure")
  })

  it("env vars override config.json for provider selection", async () => {
    vi.resetModules()
    // Config has no providers
    process.env.OUROBOROS_CONFIG_PATH = "/tmp/test-config.json"
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (p === "/tmp/test-config.json") return JSON.stringify({})
      return JSON.stringify({ name: "other" })
    })

    // But env vars set minimax
    process.env.MINIMAX_API_KEY = "env-mm-key"
    process.env.MINIMAX_MODEL = "env-mm-model"

    const { resetConfigCache } = await import("../../config")
    resetConfigCache()
    const core = await import("../../engine/core")
    expect(core.getModel()).toBe("env-mm-model")
    expect(core.getProvider()).toBe("minimax")
  })

  it("stripLastToolCalls pops trailing tool messages", async () => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    const { resetConfigCache } = await import("../../config")
    resetConfigCache()
    const { stripLastToolCalls } = await import("../../engine/core")

    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "assistant", content: "reply", tool_calls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "result" },
    ]
    stripLastToolCalls(messages)

    // Should pop tool message and strip tool_calls from assistant
    expect(messages.length).toBe(2)
    expect(messages[1].role).toBe("assistant")
    expect(messages[1].tool_calls).toBeUndefined()
    expect(messages[1].content).toBe("reply")
  })

  it("stripLastToolCalls removes empty assistant after stripping tool_calls", async () => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    const { resetConfigCache } = await import("../../config")
    resetConfigCache()
    const { stripLastToolCalls } = await import("../../engine/core")

    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "result" },
    ]
    stripLastToolCalls(messages)

    // Should pop both tool and empty assistant
    expect(messages.length).toBe(1)
    expect(messages[0].role).toBe("system")
  })

  it("stripLastToolCalls is a no-op when no trailing tools", async () => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    const { resetConfigCache } = await import("../../config")
    resetConfigCache()
    const { stripLastToolCalls } = await import("../../engine/core")

    const messages: any[] = [
      { role: "system", content: "sys" },
      { role: "assistant", content: "just text" },
    ]
    stripLastToolCalls(messages)

    expect(messages.length).toBe(2)
    expect(messages[1].content).toBe("just text")
  })

  it("fires onError when tool loop limit is reached", async () => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"

    vi.mocked(fs.readFileSync).mockReturnValue("data")

    const { resetConfigCache } = await import("../../config")
    resetConfigCache()

    // Make every API call return a tool call (never text-only)
    mockCreate.mockReset()
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      return {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: `call_${callCount}`,
                  function: { name: "read_file", arguments: '{"path":"/tmp/f.txt"}' },
                }],
              },
            }],
          }
        },
      }
    })

    const errors: Error[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err),
    }

    const core = await import("../../engine/core")
    await core.runAgent([{ role: "system", content: "test" }], callbacks)

    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain("tool loop limit reached")
    expect(callCount).toBe(core.MAX_TOOL_ROUNDS)
  })

  it("exits when neither provider configured in config or env", async () => {
    vi.resetModules()
    process.env.OUROBOROS_CONFIG_PATH = "/tmp/test-config.json"
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (p === "/tmp/test-config.json") return JSON.stringify({})
      return JSON.stringify({ name: "other" })
    })

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as any)
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {})

    const { resetConfigCache } = await import("../../config")
    resetConfigCache()

    try {
      const core = await import("../../engine/core")
      const callbacks: ChannelCallbacks = {
        onModelStart: () => {},
        onModelStreamStart: () => {},
        onTextChunk: () => {},
        onReasoningChunk: () => {},
        onToolStart: () => {},
        onToolEnd: () => {},
        onError: () => {},
      }
      await core.runAgent([], callbacks).catch(() => {})
    } catch {
      // Expected -- process.exit throws
    }

    expect(mockExit).toHaveBeenCalledWith(1)
    mockExit.mockRestore()
    mockError.mockRestore()
  })
})

describe("hasToolIntent", () => {
  it("returns true for each intent phrase", async () => {
    const { hasToolIntent } = await import("../../engine/core")
    // Explicit intent
    expect(hasToolIntent("let me read that file")).toBe(true)
    expect(hasToolIntent("I'll read that file")).toBe(true)
    expect(hasToolIntent("I will read that file")).toBe(true)
    expect(hasToolIntent("I would like to read that file")).toBe(true)
    expect(hasToolIntent("I want to read that file")).toBe(true)
    // "going to" variants
    expect(hasToolIntent("I'm going to read that file")).toBe(true)
    expect(hasToolIntent("going to read that file")).toBe(true)
    expect(hasToolIntent("I am going to read that file")).toBe(true)
    // Action announcements
    expect(hasToolIntent("I need to check the database")).toBe(true)
    expect(hasToolIntent("I should look at the logs")).toBe(true)
    expect(hasToolIntent("I can help with that")).toBe(true)
    // Gerund phase shifts
    expect(hasToolIntent("entering execution mode.")).toBe(true)
    expect(hasToolIntent("starting with the first file")).toBe(true)
    expect(hasToolIntent("proceeding to the next step")).toBe(true)
    expect(hasToolIntent("switching to plan B")).toBe(true)
    // Temporal narration
    expect(hasToolIntent("first, I will check the logs")).toBe(true)
    expect(hasToolIntent("now I will investigate")).toBe(true)
    expect(hasToolIntent("next turn will be strict TDD repair")).toBe(true)
    expect(hasToolIntent("next, I should look at the code")).toBe(true)
    // Hedged intent
    expect(hasToolIntent("allow me to take a look")).toBe(true)
    expect(hasToolIntent("time to check the logs")).toBe(true)
    // Self-narration
    expect(hasToolIntent("my next step is to read the file")).toBe(true)
    expect(hasToolIntent("my plan is to refactor this")).toBe(true)
    expect(hasToolIntent("tool calls only from here on")).toBe(true)
  })

  it("returns false for text without intent phrases", async () => {
    const { hasToolIntent } = await import("../../engine/core")
    expect(hasToolIntent("Hello")).toBe(false)
    expect(hasToolIntent("Here is the result")).toBe(false)
    expect(hasToolIntent("The file contains data")).toBe(false)
    expect(hasToolIntent("")).toBe(false)
  })

  it("is case-insensitive", async () => {
    const { hasToolIntent } = await import("../../engine/core")
    expect(hasToolIntent("LET ME read that file")).toBe(true)
    expect(hasToolIntent("i'll do that")).toBe(true)
    expect(hasToolIntent("I WILL check")).toBe(true)
    expect(hasToolIntent("GOING TO run it")).toBe(true)
  })
})

describe("kick mechanism", () => {
  let runAgent: (messages: any[], callbacks: ChannelCallbacks, channel?: string, signal?: AbortSignal, options?: { toolChoiceRequired?: boolean; maxKicks?: number }) => Promise<{ usage?: any }>

  function makeStream(chunks: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    }
  }

  function makeChunk(content?: string, toolCalls?: any[]) {
    const delta: any = {}
    if (content !== undefined) delta.content = content
    if (toolCalls !== undefined) delta.tool_calls = toolCalls
    return { choices: [{ delta }] }
  }

  beforeEach(async () => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    mockCreate.mockReset()
    mockResponsesCreate.mockReset()
    vi.mocked(fs.readFileSync).mockImplementation(defaultReadFileSync)

    const core = await import("../../engine/core")
    runAgent = core.runAgent
  })

  it("fires onKick when model narrates intent without tool calls, then retries", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([makeChunk("let me read that file for you")])
      }
      return makeStream([makeChunk("here is the result")])
    })

    const kicks: { attempt: number; maxKicks: number }[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number, maxKicks: number) => kicks.push({ attempt, maxKicks }),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    expect(kicks).toHaveLength(1)
    expect(kicks[0]).toEqual({ attempt: 1, maxKicks: 1 })
    expect(callCount).toBe(2)
    // Assistant messages: original narration + self-correction, then real response
    const assistantMessages = messages.filter((m: any) => m.role === "assistant")
    expect(assistantMessages).toHaveLength(2)
    expect(assistantMessages[0].content).toContain("let me read that file for you")
    expect(assistantMessages[0].content).toContain("I narrated instead of acting. Calling the tool now.")
    expect(assistantMessages[1].content).toBe("here is the result")
  })

  it("does not kick when maxKicks (default 1) is already exhausted", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      // Both calls narrate intent
      return makeStream([makeChunk("I'll read the file now")])
    })

    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    // First narration triggers kick, second narration does NOT (exhausted)
    expect(kicks).toHaveLength(1)
    expect(callCount).toBe(2) // original + 1 retry, then normal termination
  })

  it("kick increments toolRounds and respects MAX_TOOL_ROUNDS", async () => {
    // Use maxKicks=15 to allow many kicks, but MAX_TOOL_ROUNDS should cap at 10
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      return makeStream([makeChunk("I will do that now")])
    })

    const errors: string[] = []
    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err.message),
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { maxKicks: 15 })

    // Kicks should be capped by MAX_TOOL_ROUNDS (10)
    expect(callCount).toBeLessThanOrEqual(11) // initial + up to 10 kicks
    expect(errors.some(e => e.includes("tool loop limit"))).toBe(true)
  })

  it("pushes self-correction message before retry", async () => {
    let callCount = 0
    mockCreate.mockImplementation((params: any) => {
      callCount++
      if (callCount === 1) {
        return makeStream([makeChunk("let me check that")])
      }
      // On retry, verify the self-correction message is present
      return makeStream([makeChunk("done")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    // The self-correction assistant message should contain original narration + kick message
    const assistantMessages = messages.filter((m: any) => m.role === "assistant")
    expect(assistantMessages.some((m: any) => m.content?.includes("let me check that") && m.content?.includes("I narrated instead of acting."))).toBe(true)
  })

  it("does not kick when maxKicks is set to 0 via options", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      return makeStream([makeChunk("let me read the file")])
    })

    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { maxKicks: 0 })

    expect(kicks).toHaveLength(0)
    expect(callCount).toBe(1)
  })

  it("allows up to 2 kicks when maxKicks is set to 2", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount <= 2) {
        return makeStream([makeChunk("I'll do that now")])
      }
      return makeStream([makeChunk("here is the result")])
    })

    const kicks: { attempt: number; maxKicks: number }[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number, maxKicks: number) => kicks.push({ attempt, maxKicks }),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { maxKicks: 2 })

    expect(kicks).toHaveLength(2)
    expect(kicks[0]).toEqual({ attempt: 1, maxKicks: 2 })
    expect(kicks[1]).toEqual({ attempt: 2, maxKicks: 2 })
    expect(callCount).toBe(3) // original + 2 retries
  })

  it("onKick callback is optional (no crash if not provided)", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([makeChunk("let me read that")])
      }
      return makeStream([makeChunk("done")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      // onKick intentionally NOT provided
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    // Should not throw
    await runAgent(messages, callbacks)
    expect(callCount).toBe(2)
  })

  it("malformed assistant message is NOT in history after kick", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([makeChunk("I'm going to read the file")])
      }
      return makeStream([makeChunk("the file says hello")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    // Assistant messages: original narration + self-correction, then real response
    const assistantMessages = messages.filter((m: any) => m.role === "assistant")
    expect(assistantMessages).toHaveLength(2)
    expect(assistantMessages[0].content).toContain("I'm going to")
    expect(assistantMessages[0].content).toContain("I narrated instead of acting. Calling the tool now.")
    expect(assistantMessages[1].content).toBe("the file says hello")
  })

  it("Azure: kick cleans up azureInput output items and forces rebuild on retry", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    function makeResponsesStream(events: any[]) {
      return {
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) {
            yield event
          }
        },
      }
    }

    const reasoningItem = { type: "reasoning", id: "r1", summary: [{ text: "thought", type: "summary_text" }], encrypted_content: "enc1" }
    const textItem = { type: "message", id: "msg1", role: "assistant", content: [{ type: "output_text", text: "let me read that file" }] }

    let callCount = 0
    mockResponsesCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeResponsesStream([
          { type: "response.output_item.done", item: reasoningItem },
          { type: "response.output_text.delta", delta: "let me read that file" },
          { type: "response.output_item.done", item: textItem },
        ])
      }
      return makeResponsesStream([
        { type: "response.output_text.delta", delta: "here is the answer" },
      ])
    })

    const core = await import("../../engine/core")
    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await core.runAgent(messages, callbacks)

    expect(kicks).toHaveLength(1)
    expect(callCount).toBe(2)
    // Assistant messages: original narration + self-correction, then real response
    const assistantMessages = messages.filter((m: any) => m.role === "assistant")
    expect(assistantMessages).toHaveLength(2)
    expect(assistantMessages[0].content).toContain("let me read that file")
    expect(assistantMessages[0].content).toContain("I narrated instead of acting. Calling the tool now.")
    expect(assistantMessages[1].content).toBe("here is the answer")

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })
})

describe("tool_choice required and final_answer", () => {
  let runAgent: (messages: any[], callbacks: ChannelCallbacks, channel?: string, signal?: AbortSignal, options?: { toolChoiceRequired?: boolean; maxKicks?: number }) => Promise<{ usage?: any }>

  function makeStream(chunks: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    }
  }

  function makeChunk(content?: string, toolCalls?: any[]) {
    const delta: any = {}
    if (content !== undefined) delta.content = content
    if (toolCalls !== undefined) delta.tool_calls = toolCalls
    return { choices: [{ delta }] }
  }

  function makeResponsesStream(events: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) {
          yield event
        }
      },
    }
  }

  beforeEach(async () => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    mockCreate.mockReset()
    mockResponsesCreate.mockReset()
    vi.mocked(fs.readFileSync).mockImplementation(defaultReadFileSync)

    const core = await import("../../engine/core")
    runAgent = core.runAgent
  })

  it("passes tool_choice: required in MiniMax createParams when toolChoiceRequired is true", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{"answer":"done"}' } },
        ]),
      ])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks, undefined, undefined, { toolChoiceRequired: true })
    const params = mockCreate.mock.calls[0][0]
    expect(params.tool_choice).toBe("required")
  })

  it("passes tool_choice: required in Azure createParams when toolChoiceRequired is true", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    mockResponsesCreate.mockReturnValue(makeResponsesStream([
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "final_answer", arguments: "" } },
      { type: "response.function_call_arguments.delta", delta: '{"answer":"done"}' },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "final_answer", arguments: '{"answer":"done"}' } },
    ]))

    const core = await import("../../engine/core")
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await core.runAgent([{ role: "system", content: "test" }], callbacks, undefined, undefined, { toolChoiceRequired: true })
    const params = mockResponsesCreate.mock.calls[0][0]
    expect(params.tool_choice).toBe("required")

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("includes final_answer tool in tools list when toolChoiceRequired is true", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{"answer":"done"}' } },
        ]),
      ])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks, undefined, undefined, { toolChoiceRequired: true })
    const params = mockCreate.mock.calls[0][0]
    const toolNames = params.tools.map((t: any) => t.function.name)
    expect(toolNames).toContain("final_answer")
  })

  it("does NOT include final_answer tool when toolChoiceRequired is false/undefined", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("hello")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    const params = mockCreate.mock.calls[0][0]
    const toolNames = params.tools.map((t: any) => t.function.name)
    expect(toolNames).not.toContain("final_answer")
  })

  it("does NOT pass tool_choice when toolChoiceRequired is not set", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("hello")]))

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    const params = mockCreate.mock.calls[0][0]
    expect(params.tool_choice).toBeUndefined()
  })

  it("final_answer sole call: extracts answer text and terminates loop", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{"answer":"the final response"}' } },
        ]),
      ])
    )

    const toolStarts: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    // Should NOT have called any tools through onToolStart (final_answer is intercepted)
    expect(toolStarts).toEqual([])
    // The assistant message should have the extracted answer content, not tool_calls
    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg.content).toBe("the final response")
    expect(assistantMsg.tool_calls).toBeUndefined()
    // Only 1 API call (no loop continuation)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it("final_answer mixed with other tool calls: other tools execute, final_answer rejected, loop continues", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("file data")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
            { index: 1, id: "call_2", function: { name: "final_answer", arguments: '{"answer":"done"}' } },
          ]),
        ])
      }
      // Second call: model returns final_answer alone
      return makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_3", function: { name: "final_answer", arguments: '{"answer":"the real answer"}' } },
        ]),
      ])
    })

    const toolStarts: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    // read_file should have been executed, final_answer should NOT
    expect(toolStarts).toEqual(["read_file"])
    // Should have 2 API calls (mixed -> sole final_answer)
    expect(callCount).toBe(2)
    // The final assistant message should have the extracted answer
    const lastAssistant = [...messages].reverse().find((m: any) => m.role === "assistant")
    expect(lastAssistant.content).toBe("the real answer")
    // There should be a rejection tool result for the mixed final_answer
    const toolResults = messages.filter((m: any) => m.role === "tool")
    const rejectionMsg = toolResults.find((m: any) => m.tool_call_id === "call_2")
    expect(rejectionMsg).toBeDefined()
    expect(rejectionMsg.content).toContain("rejected")
    expect(rejectionMsg.content).toContain("final_answer must be the only tool call")
  })

  it("final_answer with empty answer arg: uses empty string", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{}' } },
        ]),
      ])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    // Should use empty string or result.content as fallback
    expect(typeof assistantMsg.content).toBe("string")
  })

  it("final_answer is never passed to execTool (intercepted before execution)", async () => {
    // If final_answer were passed to execTool, it would return "unknown: final_answer"
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{"answer":"done"}' } },
        ]),
      ])
    )

    const toolStarts: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    // No tools should have been started (final_answer is intercepted)
    expect(toolStarts).toHaveLength(0)
    // No tool result messages in history
    const toolResults = messages.filter((m: any) => m.role === "tool")
    expect(toolResults).toHaveLength(0)
  })

  it("Azure: mixed final_answer rejection pushes to azureInput", async () => {
    vi.resetModules()
    delete process.env.MINIMAX_API_KEY
    delete process.env.MINIMAX_MODEL
    process.env.AZURE_OPENAI_API_KEY = "azure-test-key"
    process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
    process.env.AZURE_OPENAI_DEPLOYMENT = "test-deployment"
    process.env.AZURE_OPENAI_MODEL_NAME = "gpt-5.2-chat"

    vi.mocked(fs.readFileSync).mockReturnValue("file data")

    const funcItem1 = { type: "function_call", id: "fc1", call_id: "c1", name: "read_file", arguments: '{"path":"a.txt"}', status: "completed" }
    const funcItem2 = { type: "function_call", id: "fc2", call_id: "c2", name: "final_answer", arguments: '{"answer":"done"}', status: "completed" }

    let callCount = 0
    mockResponsesCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeResponsesStream([
          { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
          { type: "response.function_call_arguments.delta", delta: '{"path":"a.txt"}' },
          { type: "response.output_item.done", item: funcItem1 },
          { type: "response.output_item.added", item: { type: "function_call", call_id: "c2", name: "final_answer", arguments: "" } },
          { type: "response.function_call_arguments.delta", delta: '{"answer":"done"}' },
          { type: "response.output_item.done", item: funcItem2 },
        ])
      }
      // Second call: sole final_answer
      return makeResponsesStream([
        { type: "response.output_item.added", item: { type: "function_call", call_id: "c3", name: "final_answer", arguments: "" } },
        { type: "response.function_call_arguments.delta", delta: '{"answer":"the real answer"}' },
        { type: "response.output_item.done", item: { type: "function_call", call_id: "c3", name: "final_answer", arguments: '{"answer":"the real answer"}' } },
      ])
    })

    const core = await import("../../engine/core")
    const toolStarts: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: (name) => toolStarts.push(name),
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await core.runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    expect(callCount).toBe(2)
    expect(toolStarts).toEqual(["read_file"])
    // Final assistant message should have the extracted answer
    const lastAssistant = [...messages].reverse().find((m: any) => m.role === "assistant")
    expect(lastAssistant.content).toBe("the real answer")

    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_ENDPOINT
    delete process.env.AZURE_OPENAI_DEPLOYMENT
    delete process.env.AZURE_OPENAI_MODEL_NAME
  })

  it("final_answer with invalid JSON arguments: falls back to result.content", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("some content", [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: "not valid json{" } },
        ]),
      ])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg.content).toBe("some content")
  })

  it("final_answer with valid JSON but no answer field: falls back to result.content", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("fallback content", [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{"text":"hello"}' } },
        ]),
      ])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg.content).toBe("fallback content")
  })

  it("final_answer with invalid JSON and no content: falls back to empty string", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: "bad json" } },
        ]),
      ])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg.content).toBe("")
  })

  it("final_answer with valid JSON, no answer field, and no content: falls back to empty string", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{"text":"hello"}' } },
        ]),
      ])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg.content).toBe("")
  })
})

describe("integration: kick + tool_choice required combined", () => {
  let runAgent: (messages: any[], callbacks: ChannelCallbacks, channel?: string, signal?: AbortSignal, options?: { toolChoiceRequired?: boolean; maxKicks?: number }) => Promise<{ usage?: any }>

  function makeStream(chunks: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    }
  }

  function makeChunk(content?: string, toolCalls?: any[]) {
    const delta: any = {}
    if (content !== undefined) delta.content = content
    if (toolCalls !== undefined) delta.tool_calls = toolCalls
    return { choices: [{ delta }] }
  }

  beforeEach(async () => {
    vi.resetModules()
    delete process.env.AZURE_OPENAI_API_KEY
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    mockCreate.mockReset()
    mockResponsesCreate.mockReset()
    vi.mocked(fs.readFileSync).mockImplementation(defaultReadFileSync)

    const core = await import("../../engine/core")
    runAgent = core.runAgent
  })

  it("kick fires when toolChoiceRequired is true and model narrates intent", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([makeChunk("let me check that for you")])
      }
      return makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{"answer":"done"}' } },
        ]),
      ])
    })

    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    expect(kicks).toHaveLength(1)
    expect(callCount).toBe(2)
    const lastAssistant = [...messages].reverse().find((m: any) => m.role === "assistant")
    expect(lastAssistant.content).toBe("done")
  })

  it("after kick, model returns final_answer -- terminates cleanly", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([makeChunk("I'll read that file")])
      }
      return makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{"answer":"the answer is 42"}' } },
        ]),
      ])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    expect(callCount).toBe(2)
    const lastAssistant = [...messages].reverse().find((m: any) => m.role === "assistant")
    expect(lastAssistant.content).toBe("the answer is 42")
    expect(lastAssistant.tool_calls).toBeUndefined()
  })

  it("MAX_TOOL_ROUNDS budget accounts for kicks + tool rounds together", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("data")
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      // Alternate: narrate intent (kick) then tool call, repeat
      if (callCount % 2 === 1 && callCount <= 5) {
        return makeStream([makeChunk("I will do that")])
      }
      return makeStream([
        makeChunk(undefined, [
          { index: 0, id: `call_${callCount}`, function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
        ]),
      ])
    })

    const errors: string[] = []
    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (err) => errors.push(err.message),
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { maxKicks: 10 })

    // Should hit MAX_TOOL_ROUNDS (10) combining kicks and tool rounds
    expect(errors.some(e => e.includes("tool loop limit"))).toBe(true)
  })

  it("abort during kick attempt -- clean stop, no dangling messages", async () => {
    const controller = new AbortController()
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeStream([makeChunk("let me read that")])
      }
      // On retry (after kick), abort before streaming completes
      controller.abort()
      return makeStream([makeChunk("hello")])
    })

    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, controller.signal)

    // Kick fires, then abort happens on retry
    expect(kicks).toHaveLength(1)
    // Messages should not have dangling tool_calls
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role === "assistant" && lastMsg.tool_calls) {
      // This should not happen -- stripLastToolCalls should have cleaned up
      expect(lastMsg.tool_calls).toBeUndefined()
    }
  })

  it("empty content with no tool_calls -- kicks (empty response is always wrong)", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Empty response
        return makeStream([{ choices: [{ delta: {} }] }])
      }
      // After kick, model responds properly
      return makeStream([makeChunk("here is your answer")])
    })

    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    expect(kicks).toHaveLength(1)
    expect(callCount).toBe(2)
    // Empty-response kick uses different message than narration kick
    const kickMsg = messages.find((m: any) => m.role === "assistant" && m.content.includes("empty"))
    expect(kickMsg).toBeDefined()
    expect(kickMsg.content).toBe("I sent an empty message by accident — let me try again.")
    const lastAssistant = [...messages].reverse().find((m: any) => m.role === "assistant")
    expect(lastAssistant.content).toBe("here is your answer")
  })

  it("intent phrase only in model content triggers kick, not in tool results", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("let me read the file content here")

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Model returns tool call, tool result contains intent phrase
        return makeStream([
          makeChunk(undefined, [
            { index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
          ]),
        ])
      }
      // Model response after tool execution -- no intent phrase, normal text
      return makeStream([makeChunk("here are the results")])
    })

    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks)

    // No kick should fire -- the intent phrase is in the tool result, not model content
    expect(kicks).toHaveLength(0)
  })

  it("final_answer with very long text -- full text preserved", async () => {
    const longText = "x".repeat(100000)
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: JSON.stringify({ answer: longText }) } },
        ]),
      ])
    )

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    const assistantMsg = messages.find((m: any) => m.role === "assistant")
    expect(assistantMsg.content).toBe(longText)
    expect(assistantMsg.content.length).toBe(100000)
  })

  it("toolChoiceRequired kicks even when content is empty (reasoning-only response)", async () => {
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Model returns empty content (reasoning went through separate channel), no tool calls
        return makeStream([{ choices: [{ delta: {} }] }])
      }
      // After kick, model correctly calls final_answer
      return makeStream([
        makeChunk(undefined, [
          { index: 0, id: "call_1", function: { name: "final_answer", arguments: '{"answer":"here you go"}' } },
        ]),
      ])
    })

    const kicks: number[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
      onKick: (attempt: number) => kicks.push(attempt),
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, undefined, undefined, { toolChoiceRequired: true })

    expect(kicks).toHaveLength(1)
    expect(callCount).toBe(2)
    const lastAssistant = [...messages].reverse().find((m: any) => m.role === "assistant")
    expect(lastAssistant.content).toBe("here you go")
  })

  it("uses getToolsForChannel to select tools based on channel", async () => {
    let usedTools: any[] | undefined
    mockCreate.mockImplementation((params: any) => {
      usedTools = params.tools
      return makeStream([makeChunk("hello")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    // Run with "teams" channel -- tools should include graph_profile and ado_work_items
    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, "teams")

    const toolNames = usedTools?.map((t: any) => t.function.name) || []
    expect(toolNames).toContain("graph_profile")
    expect(toolNames).toContain("ado_work_items")
    expect(toolNames).toContain("read_file") // base tool still present
  })

  it("does not include graph/ado tools for cli channel", async () => {
    let usedTools: any[] | undefined
    mockCreate.mockImplementation((params: any) => {
      usedTools = params.tools
      return makeStream([makeChunk("hello")])
    })

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, "cli")

    const toolNames = usedTools?.map((t: any) => t.function.name) || []
    expect(toolNames).not.toContain("graph_profile")
    expect(toolNames).not.toContain("ado_work_items")
    expect(toolNames).toContain("read_file")
  })

  it("passes toolContext to execTool when calling graph/ado tools", async () => {
    // The tool will be called through the agent loop -- mock the API to return a tool call
    mockCreate.mockReturnValueOnce(
      makeStream([
        makeChunk(undefined, [{ index: 0, id: "tc1", function: { name: "graph_profile", arguments: "" } }]),
        makeChunk(undefined, [{ index: 0, function: { arguments: "{}" } }]),
      ]),
    ).mockReturnValueOnce(
      makeStream([makeChunk("here is your profile")])
    )

    const toolContext = {
      graphToken: "mock-graph-token",
      adoToken: undefined,
      signin: vi.fn(),
      adoOrganizations: [],
    }

    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: () => {},
      onReasoningChunk: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, callbacks, "teams", undefined, { toolContext } as any)

    // The tool should have been executed -- look for the tool result in messages
    const toolMessage = messages.find((m: any) => m.role === "tool" && m.tool_call_id === "tc1")
    expect(toolMessage).toBeDefined()
    // The result should come from the graph_profile handler (not "unknown")
    expect(toolMessage.content).not.toContain("unknown")
  })
})
