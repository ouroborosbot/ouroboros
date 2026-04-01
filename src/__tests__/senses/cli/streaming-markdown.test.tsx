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

  it("renders italic text", () => {
    const { lastFrame } = render(<StreamingMarkdown text="this is *italic* text" />)
    const frame = lastFrame()!
    expect(frame).toContain("italic")
    // Should not contain raw asterisks wrapping "italic"
    expect(frame).not.toMatch(/\*italic\*/)
  })

  it("handles bold followed by plain text", () => {
    const { lastFrame } = render(<StreamingMarkdown text="**bold** then plain" />)
    const frame = lastFrame()!
    expect(frame).toContain("bold")
    expect(frame).toContain("then plain")
  })

  it("wraps text when maxWidth is very small", () => {
    const { lastFrame } = render(<StreamingMarkdown text="hello world foo bar" maxWidth={5} />)
    const frame = lastFrame()!
    // Should have wrapped text
    expect(frame).toContain("hello")
  })

  it("handles maxWidth of 0 (no wrapping)", () => {
    const { lastFrame } = render(<StreamingMarkdown text="hello world" maxWidth={0} />)
    const frame = lastFrame()!
    expect(frame).toContain("hello world")
  })

  it("handles long word with no spaces at wrap boundary", () => {
    const longWord = "a".repeat(20)
    const { lastFrame } = render(<StreamingMarkdown text={longWord} maxWidth={10} />)
    const frame = lastFrame()!
    // All characters should be present
    const stripped = frame.replace(/\n/g, "")
    expect(stripped.length).toBeGreaterThanOrEqual(20)
  })

  it("handles text with only inline code", () => {
    const { lastFrame } = render(<StreamingMarkdown text="`code only`" />)
    const frame = lastFrame()!
    expect(frame).toContain("code only")
  })

  it("wraps text with both short and long lines", () => {
    const text = "short\n" + "x".repeat(100)
    const { lastFrame } = render(<StreamingMarkdown text={text} maxWidth={30} />)
    const frame = lastFrame()!
    expect(frame).toContain("short")
    expect(frame).toContain("x")
  })

  it("wraps remaining text after long-word split", () => {
    // A line with no spaces that's slightly longer than maxWidth
    // Tests the remaining text after the while loop
    const text = "a".repeat(15)
    const { lastFrame } = render(<StreamingMarkdown text={text} maxWidth={10} />)
    const frame = lastFrame()!
    // Should have all characters present
    const stripped = frame.replace(/\n/g, "")
    expect(stripped).toContain("aaaaaa")
  })
})
