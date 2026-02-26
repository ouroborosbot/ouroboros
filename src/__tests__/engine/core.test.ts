import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fs and child_process before importing core
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
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
  let runAgent: (messages: any[], callbacks: ChannelCallbacks) => Promise<void>

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

  it("calls onReasoningChunk for reasoning-only stream", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "still thinking" } }] },
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
    expect(reasoningChunks).toEqual(["still thinking"])
    expect(textChunks).toEqual([])
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
    await runAgent([{ role: "system", content: "test" }], callbacks, controller.signal)
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

    await runAgent([{ role: "system", content: "test" }], callbacks, controller.signal)
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

    await runAgent([{ role: "system", content: "test" }], callbacks, controller.signal)
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

    await runAgent([{ role: "system", content: "test" }], callbacks, controller.signal)
    // First tool executes, onToolEnd aborts signal, second tool should be skipped
    expect(toolStarts.length).toBe(1)
  })

  it("fires onModelStreamStart on first reasoning_content token", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "hmm" } }] },
      ])
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
    expect(calls).toEqual(["streamStart"])
  })

  it("calls onReasoningChunk for each reasoning chunk", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        { choices: [{ delta: { reasoning_content: "step 1" } }] },
        { choices: [{ delta: { reasoning_content: "step 2" } }] },
      ])
    )

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
