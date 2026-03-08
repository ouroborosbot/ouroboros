import { describe, it, expect, vi } from "vitest"
import type { ChannelCallbacks, ProviderRuntime, ProviderTurnRequest } from "../../../heart/core"
import type { TurnResult } from "../../../heart/streaming"

function makeCallbacks(overrides?: Partial<ChannelCallbacks>): ChannelCallbacks {
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

function makeTurnResult(overrides?: Partial<TurnResult>): TurnResult {
  return {
    content: "",
    toolCalls: [],
    outputItems: [],
    ...overrides,
  }
}

function makeProvider(streamTurnImpl: (req: ProviderTurnRequest) => Promise<TurnResult>): ProviderRuntime {
  return {
    id: "anthropic",
    model: "test-model",
    client: {},
    streamTurn: streamTurnImpl,
    appendToolOutput: vi.fn(),
    resetTurnState: vi.fn(),
  }
}

describe("runSpecialistSession", () => {
  it("sends system prompt + user message to provider", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    const requests: ProviderTurnRequest[] = []

    const provider = makeProvider(async (req) => {
      requests.push(req)
      // First call: final_answer to end immediately
      return makeTurnResult({
        toolCalls: [{
          id: "tc-1",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "Done!" }),
        }],
      })
    })

    const readline = {
      question: vi.fn().mockResolvedValueOnce("Hello specialist"),
      close: vi.fn(),
    }

    await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "You are the specialist.",
      tools: [],
      execTool: vi.fn(),
      readline,
      callbacks: makeCallbacks(),
    })

    expect(requests.length).toBe(1)
    // System prompt should be first message
    expect(requests[0].messages[0]).toEqual({ role: "system", content: "You are the specialist." })
    // User message should follow
    expect(requests[0].messages[1]).toEqual({ role: "user", content: "Hello specialist" })
  })

  it("provider response with text is displayed via callbacks", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    let callCount = 0
    const callbacks = makeCallbacks()

    const provider = makeProvider(async () => {
      callCount++
      if (callCount === 1) {
        return makeTurnResult({ content: "Let me help you." })
      }
      return makeTurnResult({
        toolCalls: [{
          id: "tc-end",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "Goodbye!" }),
        }],
      })
    })

    const readline = {
      question: vi.fn()
        .mockResolvedValueOnce("Hi")
        .mockResolvedValueOnce("Thanks"),
      close: vi.fn(),
    }

    await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool: vi.fn(),
      readline,
      callbacks,
    })

    // Text response from first turn should have been handled (content is pushed to messages)
    expect(callCount).toBe(2)
  })

  it("provider response with final_answer tool call ends the session", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")

    const provider = makeProvider(async () =>
      makeTurnResult({
        toolCalls: [{
          id: "tc-fa",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "All done!" }),
        }],
      }),
    )

    const callbacks = makeCallbacks()
    const readline = {
      question: vi.fn().mockResolvedValueOnce("Start"),
      close: vi.fn(),
    }

    const result = await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool: vi.fn(),
      readline,
      callbacks,
    })

    expect(callbacks.onTextChunk).toHaveBeenCalledWith("All done!")
    expect(readline.close).toHaveBeenCalled()
    expect(result.hatchedAgentName).toBeNull()
  })

  it("provider response with hatch_agent tool call executes the tool and continues", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    let callCount = 0

    const provider = makeProvider(async () => {
      callCount++
      if (callCount === 1) {
        return makeTurnResult({
          toolCalls: [{
            id: "tc-hatch",
            name: "hatch_agent",
            arguments: JSON.stringify({ name: "MyBot" }),
          }],
        })
      }
      return makeTurnResult({
        toolCalls: [{
          id: "tc-end",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "Hatched!" }),
        }],
      })
    })

    const execTool = vi.fn().mockResolvedValue("hatched MyBot successfully")
    const readline = {
      question: vi.fn().mockResolvedValueOnce("Hatch MyBot"),
      close: vi.fn(),
    }

    const result = await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool,
      readline,
      callbacks: makeCallbacks(),
    })

    expect(execTool).toHaveBeenCalledWith("hatch_agent", { name: "MyBot" })
    expect(result.hatchedAgentName).toBe("MyBot")
  })

  it("provider response with read_file tool call executes and continues", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    let callCount = 0

    const provider = makeProvider(async () => {
      callCount++
      if (callCount === 1) {
        return makeTurnResult({
          toolCalls: [{
            id: "tc-read",
            name: "read_file",
            arguments: JSON.stringify({ path: "/tmp/test.txt" }),
          }],
        })
      }
      return makeTurnResult({
        toolCalls: [{
          id: "tc-end",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "Done reading." }),
        }],
      })
    })

    const execTool = vi.fn().mockResolvedValue("file contents here")
    const readline = {
      question: vi.fn().mockResolvedValueOnce("Read that file"),
      close: vi.fn(),
    }

    await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool,
      readline,
      callbacks: makeCallbacks(),
    })

    expect(execTool).toHaveBeenCalledWith("read_file", { path: "/tmp/test.txt" })
  })

  it("abort signal cleanly exits the session", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")

    const controller = new AbortController()

    const provider = makeProvider(async () => {
      controller.abort()
      return makeTurnResult({ content: "response" })
    })

    const readline = {
      question: vi.fn().mockResolvedValueOnce("Hello"),
      close: vi.fn(),
    }

    const result = await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool: vi.fn(),
      readline,
      callbacks: makeCallbacks(),
      signal: controller.signal,
    })

    expect(readline.close).toHaveBeenCalled()
    expect(result.hatchedAgentName).toBeNull()
  })

  it("session returns the hatchling name if hatch_agent was called, null otherwise", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")

    const provider = makeProvider(async () =>
      makeTurnResult({
        toolCalls: [{
          id: "tc-fa",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "bye" }),
        }],
      }),
    )

    const readline = {
      question: vi.fn().mockResolvedValueOnce("Hi"),
      close: vi.fn(),
    }

    const result = await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool: vi.fn(),
      readline,
      callbacks: makeCallbacks(),
    })

    expect(result.hatchedAgentName).toBeNull()
  })

  it("malformed final_answer causes retry", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    let callCount = 0

    const provider = makeProvider(async () => {
      callCount++
      if (callCount === 1) {
        return makeTurnResult({
          toolCalls: [{
            id: "tc-bad",
            name: "final_answer",
            arguments: "not valid json{{{",
          }],
        })
      }
      return makeTurnResult({
        toolCalls: [{
          id: "tc-good",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "Retry worked" }),
        }],
      })
    })

    const callbacks = makeCallbacks()
    const readline = {
      question: vi.fn().mockResolvedValueOnce("Start"),
      close: vi.fn(),
    }

    await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool: vi.fn(),
      readline,
      callbacks,
    })

    expect(callCount).toBe(2)
    expect(callbacks.onTextChunk).toHaveBeenCalledWith("Retry worked")
  })

  it("tool execution error is caught and returned as error string", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    let callCount = 0

    const provider = makeProvider(async () => {
      callCount++
      if (callCount === 1) {
        return makeTurnResult({
          toolCalls: [{
            id: "tc-err",
            name: "read_file",
            arguments: JSON.stringify({ path: "/no/file" }),
          }],
        })
      }
      return makeTurnResult({
        toolCalls: [{
          id: "tc-end",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "Done" }),
        }],
      })
    })

    const execTool = vi.fn().mockRejectedValueOnce(new Error("file not found"))
    const readline = {
      question: vi.fn().mockResolvedValueOnce("Read it"),
      close: vi.fn(),
    }

    await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool,
      readline,
      callbacks: makeCallbacks(),
    })

    expect(execTool).toHaveBeenCalled()
  })

  it("final_answer with bare string JSON parses correctly", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")

    const provider = makeProvider(async () =>
      makeTurnResult({
        toolCalls: [{
          id: "tc-str",
          name: "final_answer",
          arguments: JSON.stringify("Just a string answer"),
        }],
      }),
    )

    const callbacks = makeCallbacks()
    const readline = {
      question: vi.fn().mockResolvedValueOnce("Hi"),
      close: vi.fn(),
    }

    await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool: vi.fn(),
      readline,
      callbacks,
    })

    expect(callbacks.onTextChunk).toHaveBeenCalledWith("Just a string answer")
  })

  it("malformed tool call arguments are handled gracefully", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    let callCount = 0

    const provider = makeProvider(async () => {
      callCount++
      if (callCount === 1) {
        return makeTurnResult({
          toolCalls: [{
            id: "tc-bad-args",
            name: "read_file",
            arguments: "not json",
          }],
        })
      }
      return makeTurnResult({
        toolCalls: [{
          id: "tc-end",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "Done" }),
        }],
      })
    })

    const execTool = vi.fn().mockResolvedValue("ok")
    const readline = {
      question: vi.fn().mockResolvedValueOnce("Go"),
      close: vi.fn(),
    }

    await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool,
      readline,
      callbacks: makeCallbacks(),
    })

    // Tool should still be called with empty args
    expect(execTool).toHaveBeenCalledWith("read_file", {})
  })

  it("final_answer with valid JSON but no answer field causes retry", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    let callCount = 0

    const provider = makeProvider(async () => {
      callCount++
      if (callCount === 1) {
        return makeTurnResult({
          toolCalls: [{
            id: "tc-noanswer",
            name: "final_answer",
            arguments: JSON.stringify({ text: "wrong field" }),
          }],
        })
      }
      return makeTurnResult({
        toolCalls: [{
          id: "tc-good",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "Correct" }),
        }],
      })
    })

    const callbacks = makeCallbacks()
    const readline = {
      question: vi.fn().mockResolvedValueOnce("Go"),
      close: vi.fn(),
    }

    await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool: vi.fn(),
      readline,
      callbacks,
    })

    expect(callCount).toBe(2)
    expect(callbacks.onTextChunk).toHaveBeenCalledWith("Correct")
  })

  it("abort during inner tool loop exits cleanly", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    const controller = new AbortController()

    const provider = makeProvider(async () => {
      // Return a tool call -- after execution, the inner loop will
      // check signal.aborted before calling streamTurn again
      return makeTurnResult({
        toolCalls: [{
          id: "tc-tool",
          name: "read_file",
          arguments: JSON.stringify({ path: "/tmp/test.txt" }),
        }],
      })
    })

    // Abort DURING tool execution -- this means when the inner loop
    // goes back to its top, signal.aborted will be true
    const execTool = vi.fn().mockImplementation(async () => {
      controller.abort()
      return "file content"
    })

    const readline = {
      question: vi.fn().mockResolvedValueOnce("Start"),
      close: vi.fn(),
    }

    const result = await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool,
      readline,
      callbacks: makeCallbacks(),
      signal: controller.signal,
    })

    expect(readline.close).toHaveBeenCalled()
    expect(result.hatchedAgentName).toBeNull()
  })

  it("abort during multi-tool execution skips remaining tools", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")
    const controller = new AbortController()

    const provider = makeProvider(async () =>
      makeTurnResult({
        toolCalls: [
          { id: "tc-1", name: "read_file", arguments: JSON.stringify({ path: "/a" }) },
          { id: "tc-2", name: "read_file", arguments: JSON.stringify({ path: "/b" }) },
        ],
      }),
    )

    let toolCallCount = 0
    const execTool = vi.fn().mockImplementation(async () => {
      toolCallCount++
      if (toolCallCount === 1) {
        controller.abort()
      }
      return "content"
    })

    const readline = {
      question: vi.fn().mockResolvedValueOnce("Go"),
      close: vi.fn(),
    }

    const result = await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool,
      readline,
      callbacks: makeCallbacks(),
      signal: controller.signal,
    })

    // Only first tool should have been executed
    expect(toolCallCount).toBe(1)
    expect(readline.close).toHaveBeenCalled()
    expect(result.hatchedAgentName).toBeNull()
  })

  it("empty user input is skipped and prompt re-displayed", async () => {
    const { runSpecialistSession } = await import("../../../heart/daemon/specialist-session")

    const provider = makeProvider(async () =>
      makeTurnResult({
        toolCalls: [{
          id: "tc-end",
          name: "final_answer",
          arguments: JSON.stringify({ answer: "Done" }),
        }],
      }),
    )

    const readline = {
      question: vi.fn()
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("  ")
        .mockResolvedValueOnce("actual input"),
      close: vi.fn(),
    }

    await runSpecialistSession({
      providerRuntime: provider,
      systemPrompt: "system",
      tools: [],
      execTool: vi.fn(),
      readline,
      callbacks: makeCallbacks(),
    })

    // question should have been called 3 times (2 empty + 1 real)
    expect(readline.question).toHaveBeenCalledTimes(3)
  })
})
