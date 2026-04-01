import React from "react"
import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "ink-testing-library"

// Will be implemented in src/senses/cli/streaming-markdown.tsx
import { StreamingMarkdown } from "../../../senses/cli/streaming-markdown"

afterEach(() => {
  cleanup()
})

describe("StreamingMarkdown (Ink)", () => {
  it("renders plain text without crashing", () => {
    const { lastFrame } = render(<StreamingMarkdown text="Hello world" />)
    expect(lastFrame()).toContain("Hello world")
  })

  it("renders bold markdown as ANSI bold", () => {
    const { lastFrame } = render(<StreamingMarkdown text="this is **bold** text" />)
    const frame = lastFrame()!
    // Should contain the word "bold" somewhere in the output
    expect(frame).toContain("bold")
    // Should not contain raw markdown asterisks
    expect(frame).not.toContain("**")
  })

  it("renders inline code with styling", () => {
    const { lastFrame } = render(<StreamingMarkdown text="use `npm install` here" />)
    const frame = lastFrame()!
    expect(frame).toContain("npm install")
    // Should not contain raw backtick wrappers
    expect(frame).not.toMatch(/`npm install`/)
  })

  it("renders fenced code blocks with dim styling", () => {
    const text = "before\n```js\nconst x = 1\n```\nafter"
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    expect(frame).toContain("const x = 1")
    expect(frame).toContain("before")
    expect(frame).toContain("after")
  })

  it("handles empty text gracefully", () => {
    const { lastFrame } = render(<StreamingMarkdown text="" />)
    const frame = lastFrame()
    // Should render without crash -- may be empty or whitespace
    expect(frame).toBeDefined()
  })

  it("updates when text prop changes (streaming simulation)", () => {
    const { lastFrame, rerender } = render(<StreamingMarkdown text="Hel" />)
    expect(lastFrame()).toContain("Hel")

    rerender(<StreamingMarkdown text="Hello wor" />)
    expect(lastFrame()).toContain("Hello wor")

    rerender(<StreamingMarkdown text="Hello world!" />)
    expect(lastFrame()).toContain("Hello world!")
  })

  it("respects maxWidth for line wrapping", () => {
    const longText = "a".repeat(200)
    const { lastFrame } = render(<StreamingMarkdown text={longText} maxWidth={80} />)
    const frame = lastFrame()!
    // All characters should be present
    const stripped = frame.replace(/\n/g, "")
    expect(stripped).toContain("a".repeat(80))
  })

  it("produces no padding characters that corrupt copy-paste", () => {
    const { lastFrame } = render(<StreamingMarkdown text="line one\nline two" />)
    const frame = lastFrame()!
    const lines = frame.split("\n").filter(l => l.length > 0)
    for (const line of lines) {
      // No trailing whitespace padding
      expect(line).toBe(line.trimEnd())
    }
  })
})
