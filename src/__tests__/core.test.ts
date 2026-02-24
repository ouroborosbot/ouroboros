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
}))

vi.mock("../skills", () => ({
  listSkills: vi.fn(),
  loadSkill: vi.fn(),
}))

// We need to mock OpenAI before importing core
vi.mock("openai", () => {
  const mockCreate = vi.fn()
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
    __mockCreate: mockCreate,
  }
})

import * as fs from "fs"
import { execSync } from "child_process"
import { listSkills, loadSkill } from "../skills"
import type { ChannelCallbacks } from "../core"

// Set env var before importing core
process.env.MINIMAX_API_KEY = "test-key"

describe("isOwnCodebase", () => {
  it("returns true when src/agent.ts and package.json exist in cwd", async () => {
    const { isOwnCodebase } = await import("../core")
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = p.toString()
      return s.endsWith("src/agent.ts") || s.endsWith("package.json")
    })
    expect(isOwnCodebase()).toBe(true)
  })

  it("returns false when src/agent.ts does not exist", async () => {
    const { isOwnCodebase } = await import("../core")
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = p.toString()
      if (s.endsWith("src/agent.ts")) return false
      if (s.endsWith("package.json")) return true
      return false
    })
    expect(isOwnCodebase()).toBe(false)
  })

  it("returns false when package.json does not exist", async () => {
    const { isOwnCodebase } = await import("../core")
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = p.toString()
      if (s.endsWith("src/agent.ts")) return true
      if (s.endsWith("package.json")) return false
      return false
    })
    expect(isOwnCodebase()).toBe(false)
  })

  it("returns false when existsSync throws", async () => {
    const { isOwnCodebase } = await import("../core")
    vi.mocked(fs.existsSync).mockImplementation(() => {
      throw new Error("permission denied")
    })
    expect(isOwnCodebase()).toBe(false)
  })
})

describe("buildSystem", () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
  })

  it("includes self-aware suffix when isOwnCodebase returns true", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("you are ouroboros")
    expect(result).toContain("running in your own codebase")
  })

  it("omits self-aware suffix when isOwnCodebase returns false", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { buildSystem } = await import("../core")
    const result = buildSystem()
    expect(result).toContain("you are ouroboros")
    expect(result).not.toContain("running in your own codebase")
  })
})

describe("execTool", () => {
  let execTool: (name: string, args: Record<string, string>) => string

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    const core = await import("../core")
    execTool = core.execTool
  })

  it("dispatches read_file to fs.readFileSync", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("file contents")
    const result = execTool("read_file", { path: "/tmp/test.txt" })
    expect(result).toBe("file contents")
    expect(fs.readFileSync).toHaveBeenCalledWith("/tmp/test.txt", "utf-8")
  })

  it("dispatches write_file to fs.writeFileSync", () => {
    const result = execTool("write_file", { path: "/tmp/out.txt", content: "hello" })
    expect(result).toBe("ok")
    expect(fs.writeFileSync).toHaveBeenCalledWith("/tmp/out.txt", "hello", "utf-8")
  })

  it("dispatches shell to execSync", () => {
    vi.mocked(execSync).mockReturnValue("output")
    const result = execTool("shell", { command: "echo hi" })
    expect(result).toBe("output")
    expect(execSync).toHaveBeenCalledWith("echo hi", { encoding: "utf-8", timeout: 30000 })
  })

  it("dispatches list_directory to fs.readdirSync", () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: "file.txt", isDirectory: () => false } as any,
      { name: "subdir", isDirectory: () => true } as any,
    ])
    const result = execTool("list_directory", { path: "/tmp" })
    expect(result).toBe("-  file.txt\nd  subdir")
    expect(fs.readdirSync).toHaveBeenCalledWith("/tmp", { withFileTypes: true })
  })

  it("dispatches git_commit with add=true", () => {
    vi.mocked(execSync)
      .mockReturnValueOnce("") // git add
      .mockReturnValueOnce("committed") // git commit
    const result = execTool("git_commit", { message: "test commit", add: "true" })
    expect(result).toBe("committed")
  })

  it("dispatches git_commit with add=all", () => {
    vi.mocked(execSync)
      .mockReturnValueOnce("") // git add
      .mockReturnValueOnce("committed") // git commit
    const result = execTool("git_commit", { message: "test commit", add: "all" })
    expect(result).toBe("committed")
  })

  it("dispatches git_commit without add", () => {
    vi.mocked(execSync).mockReturnValueOnce("committed")
    const result = execTool("git_commit", { message: "test commit" })
    expect(result).toBe("committed")
  })

  it("dispatches git_commit returns failure on error", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("nothing to commit")
    })
    const result = execTool("git_commit", { message: "test commit" })
    expect(result).toContain("failed:")
  })

  it("dispatches list_skills", () => {
    vi.mocked(listSkills).mockReturnValue(["skill1", "skill2"])
    const result = execTool("list_skills", {})
    expect(result).toBe(JSON.stringify(["skill1", "skill2"]))
  })

  it("dispatches load_skill", () => {
    vi.mocked(loadSkill).mockReturnValue("skill content")
    const result = execTool("load_skill", { name: "myskill" })
    expect(result).toBe("skill content")
  })

  it("dispatches load_skill returns error on failure", () => {
    vi.mocked(loadSkill).mockImplementation(() => {
      throw new Error("not found")
    })
    const result = execTool("load_skill", { name: "missing" })
    expect(result).toContain("error:")
  })

  it("dispatches get_current_time", () => {
    const result = execTool("get_current_time", {})
    // Should return a date string
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })

  it("returns 'unknown: X' for unknown tools", () => {
    const result = execTool("nonexistent_tool", {})
    expect(result).toBe("unknown: nonexistent_tool")
  })
})

describe("summarizeArgs", () => {
  let summarizeArgs: (name: string, args: Record<string, string>) => string

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"
    const core = await import("../core")
    summarizeArgs = core.summarizeArgs
  })

  it("returns path for read_file", () => {
    expect(summarizeArgs("read_file", { path: "/tmp/file.txt" })).toBe("/tmp/file.txt")
  })

  it("returns path for write_file", () => {
    expect(summarizeArgs("write_file", { path: "/tmp/out.txt", content: "data" })).toBe("/tmp/out.txt")
  })

  it("returns truncated command for shell", () => {
    const short = "echo hello"
    expect(summarizeArgs("shell", { command: short })).toBe(short)
  })

  it("truncates shell commands longer than 50 chars", () => {
    const long = "a".repeat(60)
    const result = summarizeArgs("shell", { command: long })
    expect(result).toBe("a".repeat(50) + "...")
    expect(result.length).toBe(53)
  })

  it("returns path for list_directory", () => {
    expect(summarizeArgs("list_directory", { path: "/tmp" })).toBe("/tmp")
  })

  it("returns truncated message for git_commit", () => {
    const msg = "a".repeat(50)
    expect(summarizeArgs("git_commit", { message: msg })).toBe("a".repeat(40))
  })

  it("returns name for load_skill", () => {
    expect(summarizeArgs("load_skill", { name: "myskill" })).toBe("myskill")
  })

  it("returns JSON slice for unknown tool", () => {
    const result = summarizeArgs("some_other_tool", { foo: "bar" })
    expect(result).toBe(JSON.stringify({ foo: "bar" }).slice(0, 30))
  })

  it("returns empty string when path missing for read_file", () => {
    expect(summarizeArgs("read_file", {})).toBe("")
  })

  it("returns empty string when command missing for shell", () => {
    expect(summarizeArgs("shell", {})).toBe("")
  })

  it("returns empty string when message missing for git_commit", () => {
    expect(summarizeArgs("git_commit", {})).toBe("")
  })

  it("returns empty string when name missing for load_skill", () => {
    expect(summarizeArgs("load_skill", {})).toBe("")
  })
})

describe("ChannelCallbacks interface", () => {
  it("accepts an object with all required callback signatures", () => {
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (_text: string) => {},
      onToolStart: (_name: string, _args: Record<string, string>) => {},
      onToolEnd: (_name: string, _summary: string, _success: boolean) => {},
      onError: (_error: Error) => {},
    }
    // Type check passes if this compiles
    expect(callbacks).toBeDefined()
    expect(typeof callbacks.onModelStart).toBe("function")
    expect(typeof callbacks.onModelStreamStart).toBe("function")
    expect(typeof callbacks.onTextChunk).toBe("function")
    expect(typeof callbacks.onToolStart).toBe("function")
    expect(typeof callbacks.onToolEnd).toBe("function")
    expect(typeof callbacks.onError).toBe("function")
  })
})

describe("runAgent", () => {
  let runAgent: (messages: any[], callbacks: ChannelCallbacks) => Promise<void>
  let mockCreate: ReturnType<typeof vi.fn>

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

  beforeEach(async () => {
    vi.resetModules()
    process.env.MINIMAX_API_KEY = "test-key"

    // Re-import to get fresh mocks
    const openaiModule = await import("openai")
    mockCreate = (openaiModule as any).__mockCreate
    mockCreate.mockReset()

    const core = await import("../core")
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
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    // onModelStreamStart should fire exactly once
    expect(calls).toEqual(["streamStart"])
  })

  it("fires onTextChunk for each text delta with raw think tags", async () => {
    mockCreate.mockReturnValue(
      makeStream([
        makeChunk("<think>"),
        makeChunk("reasoning"),
        makeChunk("</think>"),
        makeChunk("visible text"),
      ])
    )

    const chunks: string[] = []
    const callbacks: ChannelCallbacks = {
      onModelStart: () => {},
      onModelStreamStart: () => {},
      onTextChunk: (text) => chunks.push(text),
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(chunks).toEqual(["<think>", "reasoning", "</think>", "visible text"])
  })

  it("ends loop when response has no tool calls", async () => {
    mockCreate.mockReturnValue(makeStream([makeChunk("just text")]))

    let modelStartCount = 0
    const callbacks: ChannelCallbacks = {
      onModelStart: () => modelStartCount++,
      onModelStreamStart: () => {},
      onTextChunk: () => {},
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
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: () => {},
    }

    await runAgent([{ role: "system", content: "test" }], callbacks)
    expect(chunks).toEqual(["text"])
  })
})
