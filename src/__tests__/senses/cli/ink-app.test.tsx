import React from "react"
import { describe, it, expect, afterEach, vi } from "vitest"
import { render, cleanup } from "ink-testing-library"

import { InkApp } from "../../../senses/cli/ink-app"

afterEach(() => {
  cleanup()
})

describe("InkApp (CLI TUI Shell)", () => {
  it("renders without crashing", () => {
    const { lastFrame } = render(<InkApp messages={[]} />)
    expect(lastFrame()).toBeDefined()
  })

  it("renders the input area with prompt indicator", () => {
    const { lastFrame } = render(<InkApp messages={[]} />)
    const frame = lastFrame()!
    // Should contain the ouroboros prompt indicator
    expect(frame).toContain(">")
  })

  it("renders assistant messages as markdown", () => {
    const messages = [
      { role: "assistant" as const, content: "Hello **world**" },
    ]
    const { lastFrame } = render(<InkApp messages={messages} />)
    const frame = lastFrame()!
    expect(frame).toContain("world")
    // Should not contain raw markdown
    expect(frame).not.toContain("**")
  })

  it("renders user messages distinctly from assistant messages", () => {
    const messages = [
      { role: "user" as const, content: "What is 2+2?" },
      { role: "assistant" as const, content: "4" },
    ]
    const { lastFrame } = render(<InkApp messages={messages} />)
    const frame = lastFrame()!
    expect(frame).toContain("What is 2+2?")
    expect(frame).toContain("4")
  })

  it("produces no padding characters in output containers", () => {
    const messages = [
      { role: "assistant" as const, content: "clean text" },
    ]
    const { lastFrame } = render(<InkApp messages={messages} />)
    const frame = lastFrame()!
    const lines = frame.split("\n")
    for (const line of lines) {
      // No trailing whitespace padding
      expect(line).toBe(line.trimEnd())
    }
  })

  it("calls onSubmit when input is submitted", async () => {
    const onSubmit = vi.fn()
    const { stdin } = render(<InkApp messages={[]} onSubmit={onSubmit} />)
    // Wait for Ink to mount and attach useInput listeners
    await new Promise(r => setTimeout(r, 50))
    // ink-testing-library emits 'data' events; useInput listens for them.
    stdin.write("h")
    stdin.write("e")
    stdin.write("l")
    stdin.write("l")
    stdin.write("o")
    stdin.write("\r")
    // Wait for state updates to propagate
    await new Promise(r => setTimeout(r, 50))
    expect(onSubmit).toHaveBeenCalledWith("hello")
  })

  it("shows spinner text when loading is true", () => {
    const { lastFrame } = render(<InkApp messages={[]} loading={true} spinnerText="thinking" />)
    const frame = lastFrame()!
    expect(frame).toContain("thinking")
  })

  it("hides spinner when loading is false", () => {
    const { lastFrame } = render(<InkApp messages={[]} loading={false} spinnerText="thinking" />)
    const frame = lastFrame()!
    // "thinking" should not appear when not loading
    expect(frame).not.toContain("thinking")
  })

  it("displays tool execution results", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [{ id: "t1", type: "function" as const, function: { name: "shell", arguments: '{"command":"ls"}' } }],
      },
    ]
    const toolResults = [
      { toolCallId: "t1", name: "shell", result: "file1.ts\nfile2.ts", success: true },
    ]
    const { lastFrame } = render(<InkApp messages={messages} toolResults={toolResults} />)
    const frame = lastFrame()!
    expect(frame).toContain("shell")
  })

  it("handles terminal resize without crashing", () => {
    const { lastFrame, rerender } = render(<InkApp messages={[]} columns={80} />)
    expect(lastFrame()).toBeDefined()

    // Simulate resize
    rerender(<InkApp messages={[]} columns={120} />)
    expect(lastFrame()).toBeDefined()

    rerender(<InkApp messages={[]} columns={40} />)
    expect(lastFrame()).toBeDefined()
  })
})
