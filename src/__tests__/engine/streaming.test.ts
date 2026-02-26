import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ChannelCallbacks } from "../../engine/core"

describe("toResponsesTools", () => {
  let toResponsesTools: (ccTools: any[]) => any[]
  let tools: any[]

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    const core = await import("../../engine/streaming")
    toResponsesTools = core.toResponsesTools
    tools = core.tools
  })

  it("converts a single CC tool to Responses API FunctionTool format", () => {
    const ccTools = [
      {
        type: "function",
        function: {
          name: "read_file",
          description: "read file contents",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      },
    ]

    const result = toResponsesTools(ccTools)
    expect(result).toEqual([
      {
        type: "function",
        name: "read_file",
        description: "read file contents",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
        strict: false,
      },
    ])
  })

  it("converts all tools in the exported tools array", () => {
    const result = toResponsesTools(tools)
    expect(result).toHaveLength(tools.length)
    // Spot-check a couple
    const readFile = result.find((t: any) => t.name === "read_file")
    expect(readFile).toBeDefined()
    expect(readFile.type).toBe("function")
    expect(readFile.strict).toBe(false)
    expect(readFile.description).toBe("read file contents")

    const shell = result.find((t: any) => t.name === "shell")
    expect(shell).toBeDefined()
    expect(shell.name).toBe("shell")
    expect(shell.description).toBe("run shell command")
  })

  it("sets description to null when undefined", () => {
    const ccTools = [
      {
        type: "function",
        function: {
          name: "no_desc",
          parameters: { type: "object", properties: {} },
        },
      },
    ]

    const result = toResponsesTools(ccTools)
    expect(result[0].description).toBeNull()
  })

  it("sets parameters to null when undefined", () => {
    const ccTools = [
      {
        type: "function",
        function: {
          name: "no_params",
          description: "a tool without params",
        },
      },
    ]

    const result = toResponsesTools(ccTools)
    expect(result[0].parameters).toBeNull()
  })
})

describe("toResponsesInput", () => {
  let toResponsesInput: (messages: any[]) => { instructions: string; input: any[] }

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    const core = await import("../../engine/streaming")
    toResponsesInput = core.toResponsesInput
  })

  it("extracts system message content into instructions", () => {
    const messages = [
      { role: "system", content: "you are helpful" },
      { role: "user", content: "hi" },
    ]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("you are helpful")
    // System message should not appear in input
    expect(result.input.find((i: any) => i.role === "system")).toBeUndefined()
  })

  it("converts user message to input item", () => {
    const messages = [{ role: "user", content: "hi" }]
    const result = toResponsesInput(messages)
    expect(result.input).toEqual([{ role: "user", content: "hi" }])
  })

  it("converts assistant message (text only) to input item", () => {
    const messages = [{ role: "assistant", content: "hello" }]
    const result = toResponsesInput(messages)
    expect(result.input).toEqual([{ role: "assistant", content: "hello" }])
  })

  it("converts assistant with tool_calls to content + function_call items", () => {
    const messages = [
      {
        role: "assistant",
        content: "let me check",
        tool_calls: [
          {
            id: "tc1",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"a.txt"}' },
          },
        ],
      },
    ]
    const result = toResponsesInput(messages)
    expect(result.input).toEqual([
      { role: "assistant", content: "let me check" },
      {
        type: "function_call",
        call_id: "tc1",
        name: "read_file",
        arguments: '{"path":"a.txt"}',
        status: "completed",
      },
    ])
  })

  it("converts tool message to function_call_output item", () => {
    const messages = [
      { role: "tool", tool_call_id: "tc1", content: "file contents" },
    ]
    const result = toResponsesInput(messages)
    expect(result.input).toEqual([
      { type: "function_call_output", call_id: "tc1", output: "file contents" },
    ])
  })

  it("returns empty instructions when no system message", () => {
    const messages = [{ role: "user", content: "hi" }]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("")
  })

  it("preserves order in mixed multi-turn conversation", () => {
    const messages = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
      { role: "user", content: "read this file" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "read_file", arguments: '{"path":"x.txt"}' } },
        ],
      },
      { role: "tool", tool_call_id: "tc1", content: "data" },
      { role: "assistant", content: "here is the file" },
    ]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("system prompt")
    expect(result.input).toHaveLength(6)
    expect(result.input[0]).toEqual({ role: "user", content: "hello" })
    expect(result.input[1]).toEqual({ role: "assistant", content: "hi there" })
    expect(result.input[2]).toEqual({ role: "user", content: "read this file" })
    expect(result.input[3]).toEqual({
      type: "function_call",
      call_id: "tc1",
      name: "read_file",
      arguments: '{"path":"x.txt"}',
      status: "completed",
    })
    expect(result.input[4]).toEqual({
      type: "function_call_output",
      call_id: "tc1",
      output: "data",
    })
    expect(result.input[5]).toEqual({ role: "assistant", content: "here is the file" })
  })

  it("returns empty instructions and empty input for empty messages", () => {
    const result = toResponsesInput([])
    expect(result.instructions).toBe("")
    expect(result.input).toEqual([])
  })

  it("omits assistant content message when content is empty/falsy with tool_calls", () => {
    const messages = [
      {
        role: "assistant",
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "shell", arguments: '{"command":"ls"}' } },
        ],
      },
    ]
    const result = toResponsesInput(messages)
    // Only function_call item, no assistant content message
    expect(result.input).toEqual([
      {
        type: "function_call",
        call_id: "tc1",
        name: "shell",
        arguments: '{"command":"ls"}',
        status: "completed",
      },
    ])
  })

  it("only extracts first system message as instructions", () => {
    const messages = [
      { role: "system", content: "first system" },
      { role: "system", content: "second system" },
      { role: "user", content: "hi" },
    ]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("first system")
    // Neither system message should appear in input
    expect(result.input).toEqual([{ role: "user", content: "hi" }])
  })

  it("handles system message with empty content", () => {
    const messages = [
      { role: "system", content: "" },
      { role: "user", content: "hi" },
    ]
    const result = toResponsesInput(messages)
    expect(result.instructions).toBe("")
  })

  it("silently skips messages with unknown roles", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "function", content: "legacy" } as any,
      { role: "user", content: "bye" },
    ]
    const result = toResponsesInput(messages)
    expect(result.input).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "bye" },
    ])
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

describe("streamChatCompletion", () => {
  let streamChatCompletion: any

  function makeStream(chunks: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    }
  }

  function makeChunk(content?: string, toolCalls?: any[], reasoningContent?: string) {
    const delta: any = {}
    if (content !== undefined) delta.content = content
    if (toolCalls !== undefined) delta.tool_calls = toolCalls
    if (reasoningContent !== undefined) delta.reasoning_content = reasoningContent
    return { choices: [{ delta }] }
  }

  function makeCallbacks(overrides: Partial<ChannelCallbacks> = {}): ChannelCallbacks {
    return {
      onModelStart: vi.fn(),
      onModelStreamStart: vi.fn(),
      onTextChunk: vi.fn(),
      onReasoningChunk: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onError: vi.fn(),
      ...overrides,
    }
  }

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    mockCreate.mockReset()
    const core = await import("../../engine/streaming")
    streamChatCompletion = core.streamChatCompletion
  })

  it("returns TurnResult with content for text-only response", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([makeChunk("hello")])) } } }
    const callbacks = makeCallbacks()
    const result = await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(result).toEqual({ content: "hello", toolCalls: [], outputItems: [] })
  })

  it("calls onModelStreamStart once on first content delta", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([makeChunk("a"), makeChunk("b")])) } } }
    const callbacks = makeCallbacks()
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(callbacks.onModelStreamStart).toHaveBeenCalledTimes(1)
  })

  it("calls onTextChunk for each content delta", async () => {
    const textChunks: string[] = []
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([makeChunk("a"), makeChunk("b")])) } } }
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(textChunks).toEqual(["a", "b"])
  })

  it("accumulates tool call deltas and returns them in toolCalls", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([
      makeChunk(undefined, [{ index: 0, id: "call_1", function: { name: "read_file", arguments: '{"path"' } }]),
      makeChunk(undefined, [{ index: 0, function: { arguments: ':"a.txt"}' } }]),
    ])) } } }
    const callbacks = makeCallbacks()
    const result = await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "read_file", arguments: '{"path":"a.txt"}' }])
  })

  it("calls onReasoningChunk for reasoning_content delta", async () => {
    const reasoningChunks: string[] = []
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([
      { choices: [{ delta: { reasoning_content: "thinking" } }] },
    ])) } } }
    const callbacks = makeCallbacks({ onReasoningChunk: (text: string) => reasoningChunks.push(text) })
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(reasoningChunks).toEqual(["thinking"])
  })

  it("routes think tags through processContentBuf correctly", async () => {
    const reasoningChunks: string[] = []
    const textChunks: string[] = []
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([
      makeChunk("<think>reasoning</think>answer"),
    ])) } } }
    const callbacks = makeCallbacks({
      onTextChunk: (text: string) => textChunks.push(text),
      onReasoningChunk: (text: string) => reasoningChunks.push(text),
    })
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(reasoningChunks.join("")).toBe("reasoning")
    expect(textChunks.join("")).toBe("answer")
  })

  it("handles mixed content + tool_calls in same response", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([
      makeChunk("text"),
      makeChunk(undefined, [{ index: 0, id: "c1", function: { name: "shell", arguments: '{"command":"ls"}' } }]),
    ])) } } }
    const callbacks = makeCallbacks()
    const result = await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(result.content).toBe("text")
    expect(result.toolCalls).toHaveLength(1)
  })

  it("always returns empty outputItems (CC path)", async () => {
    const client = { chat: { completions: { create: vi.fn().mockReturnValue(makeStream([makeChunk("hello")])) } } }
    const callbacks = makeCallbacks()
    const result = await streamChatCompletion(client, { messages: [], stream: true }, callbacks)
    expect(result.outputItems).toEqual([])
  })

  it("respects abort signal during stream iteration", async () => {
    const controller = new AbortController()
    const client = { chat: { completions: { create: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeChunk("first")
        controller.abort()
        yield makeChunk("second")
      },
    }) } } }
    const textChunks: string[] = []
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    await streamChatCompletion(client, { messages: [], stream: true }, callbacks, controller.signal)
    expect(textChunks).toEqual(["first"])
  })

  it("propagates errors from client.chat.completions.create", async () => {
    const client = { chat: { completions: { create: vi.fn().mockImplementation(() => { throw new Error("API down") }) } } }
    const callbacks = makeCallbacks()
    await expect(streamChatCompletion(client, { messages: [], stream: true }, callbacks)).rejects.toThrow("API down")
  })
})

describe("streamResponsesApi", () => {
  let streamResponsesApi: any

  function makeResponsesStream(events: any[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) {
          yield event
        }
      },
    }
  }

  function makeCallbacks(overrides: Partial<ChannelCallbacks> = {}): ChannelCallbacks {
    return {
      onModelStart: vi.fn(),
      onModelStreamStart: vi.fn(),
      onTextChunk: vi.fn(),
      onReasoningChunk: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onError: vi.fn(),
      ...overrides,
    }
  }

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    process.env.MINIMAX_MODEL = "test-model"
    mockResponsesCreate.mockReset()
    const core = await import("../../engine/streaming")
    streamResponsesApi = core.streamResponsesApi
  })

  it("calls client.responses.create with createParams and signal", async () => {
    const create = vi.fn().mockReturnValue(makeResponsesStream([]))
    const client = { responses: { create } }
    const callbacks = makeCallbacks()
    const params = { model: "gpt-5", stream: true }
    const controller = new AbortController()
    await streamResponsesApi(client, params, callbacks, controller.signal)
    expect(create).toHaveBeenCalledWith(params, { signal: controller.signal })
  })

  it("calls client.responses.create without signal options when no signal", async () => {
    const create = vi.fn().mockReturnValue(makeResponsesStream([]))
    const client = { responses: { create } }
    const callbacks = makeCallbacks()
    await streamResponsesApi(client, { model: "gpt-5" }, callbacks)
    expect(create).toHaveBeenCalledWith({ model: "gpt-5" }, {})
  })

  it("fires onTextChunk and accumulates content on text delta events", async () => {
    const textChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "hello" },
      { type: "response.output_text.delta", delta: " world" },
    ])) } }
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(textChunks).toEqual(["hello", " world"])
    expect(result.content).toBe("hello world")
  })

  it("fires onReasoningChunk on reasoning summary text delta events", async () => {
    const reasoningChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.reasoning_summary_text.delta", delta: "thinking" },
    ])) } }
    const callbacks = makeCallbacks({ onReasoningChunk: (text: string) => reasoningChunks.push(text) })
    await streamResponsesApi(client, {}, callbacks)
    expect(reasoningChunks).toEqual(["thinking"])
  })

  it("fires onModelStreamStart once on first text or reasoning delta", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "a" },
      { type: "response.reasoning_summary_text.delta", delta: "b" },
      { type: "response.output_text.delta", delta: "c" },
    ])) } }
    const callbacks = makeCallbacks()
    await streamResponsesApi(client, {}, callbacks)
    expect(callbacks.onModelStreamStart).toHaveBeenCalledTimes(1)
  })

  it("fires onModelStreamStart on first reasoning delta when no text", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.reasoning_summary_text.delta", delta: "think" },
    ])) } }
    const callbacks = makeCallbacks()
    await streamResponsesApi(client, {}, callbacks)
    expect(callbacks.onModelStreamStart).toHaveBeenCalledTimes(1)
  })

  it("returns TurnResult with accumulated content, empty toolCalls and outputItems for text-only", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "hello" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result).toEqual({ content: "hello", toolCalls: [], outputItems: [] })
  })

  it("silently ignores unknown event types", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.created" },
      { type: "response.completed" },
      { type: "some.unknown.event" },
      { type: "response.output_text.delta", delta: "ok" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.content).toBe("ok")
  })

  it("fires callback even for empty delta string", async () => {
    const textChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "" },
    ])) } }
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    await streamResponsesApi(client, {}, callbacks)
    expect(textChunks).toEqual([""])
  })

  it("casts non-string delta to String()", async () => {
    const reasoningChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.reasoning_summary_text.delta", delta: 42 },
    ])) } }
    const callbacks = makeCallbacks({ onReasoningChunk: (text: string) => reasoningChunks.push(text) })
    await streamResponsesApi(client, {}, callbacks)
    expect(reasoningChunks).toEqual(["42"])
  })

  it("respects abort signal during stream iteration", async () => {
    const controller = new AbortController()
    const textChunks: string[] = []
    const client = { responses: { create: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: "response.output_text.delta", delta: "first" }
        controller.abort()
        yield { type: "response.output_text.delta", delta: "second" }
      },
    }) } }
    const callbacks = makeCallbacks({ onTextChunk: (text: string) => textChunks.push(text) })
    await streamResponsesApi(client, {}, callbacks, controller.signal)
    expect(textChunks).toEqual(["first"])
  })

  it("handles abort signal already aborted before iteration", async () => {
    const controller = new AbortController()
    controller.abort()
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "should not fire" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks, controller.signal)
    expect(callbacks.onTextChunk).not.toHaveBeenCalled()
    expect(result.content).toBe("")
  })

  it("propagates errors from client.responses.create", async () => {
    const client = { responses: { create: vi.fn().mockImplementation(() => { throw new Error("API error") }) } }
    const callbacks = makeCallbacks()
    await expect(streamResponsesApi(client, {}, callbacks)).rejects.toThrow("API error")
  })

  it("handles stream with only non-content events", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.created" },
      { type: "response.completed" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(callbacks.onModelStreamStart).not.toHaveBeenCalled()
    expect(result.content).toBe("")
  })

  // --- Tool call events ---

  it("tracks function_call from output_item.added + arguments.delta + output_item.done", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
      { type: "response.function_call_arguments.delta", delta: '{"path"' },
      { type: "response.function_call_arguments.delta", delta: ':"a.txt"}' },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: '{"path":"a.txt"}' } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.toolCalls).toEqual([{ id: "c1", name: "read_file", arguments: '{"path":"a.txt"}' }])
  })

  it("tracks multiple tool calls independently", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
      { type: "response.function_call_arguments.delta", delta: '{"path":"a.txt"}' },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: '{"path":"a.txt"}' } },
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c2", name: "shell", arguments: "" } },
      { type: "response.function_call_arguments.delta", delta: '{"command":"ls"}' },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c2", name: "shell", arguments: '{"command":"ls"}' } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0].name).toBe("read_file")
    expect(result.toolCalls[1].name).toBe("shell")
  })

  // --- Output item collection ---

  it("pushes all output_item.done items to outputItems regardless of type", async () => {
    const reasoningItem = { type: "reasoning", id: "r1", summary: [{ text: "thought", type: "summary_text" }], encrypted_content: "enc123" }
    const messageItem = { type: "message", id: "m1", content: [{ type: "output_text", text: "hello" }] }
    const fcItem = { type: "function_call", call_id: "c1", name: "read_file", arguments: '{}' }
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.done", item: reasoningItem },
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "read_file", arguments: "" } },
      { type: "response.output_item.done", item: fcItem },
      { type: "response.output_item.done", item: messageItem },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.outputItems).toHaveLength(3)
    expect(result.outputItems[0]).toEqual(reasoningItem)
    expect(result.outputItems[1]).toEqual(fcItem)
    expect(result.outputItems[2]).toEqual(messageItem)
  })

  it("preserves encrypted_content in reasoning output items", async () => {
    const item = { type: "reasoning", id: "r1", summary: [], encrypted_content: "secret" }
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.done", item },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.outputItems[0].encrypted_content).toBe("secret")
  })

  it("returns empty outputItems when no done events", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "text" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.outputItems).toEqual([])
  })

  // --- TurnResult shape ---

  it("returns TurnResult with text + tool calls + output items", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_text.delta", delta: "text" },
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "shell", arguments: "" } },
      { type: "response.function_call_arguments.delta", delta: '{"command":"ls"}' },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "shell", arguments: '{"command":"ls"}' } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.content).toBe("text")
    expect(result.toolCalls).toHaveLength(1)
    expect(result.outputItems).toHaveLength(1)
  })

  // --- Edge cases ---

  it("does not track output_item.added for non-function_call types", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.added", item: { type: "message", id: "m1" } },
      { type: "response.output_item.done", item: { type: "message", id: "m1", content: [] } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.toolCalls).toEqual([])
    expect(result.outputItems).toHaveLength(1)
  })

  it("ignores function_call_arguments.delta when no active tool call", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.function_call_arguments.delta", delta: "stray args" },
      { type: "response.output_text.delta", delta: "ok" },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.content).toBe("ok")
    expect(result.toolCalls).toEqual([])
  })

  it("handles tool call with empty arguments string", async () => {
    const client = { responses: { create: vi.fn().mockReturnValue(makeResponsesStream([
      { type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "get_current_time", arguments: "" } },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "get_current_time", arguments: "" } },
    ])) } }
    const callbacks = makeCallbacks()
    const result = await streamResponsesApi(client, {}, callbacks)
    expect(result.toolCalls).toEqual([{ id: "c1", name: "get_current_time", arguments: "" }])
  })
})
