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

  // ─── Heading tests ─────────────────────────────────────────────────

  it("renders H1 headings as bold text without # marker", () => {
    const { lastFrame } = render(<StreamingMarkdown text="# Hello World" />)
    const frame = lastFrame()!
    expect(frame).toContain("Hello World")
    expect(frame).not.toContain("# ")
  })

  it("renders H2 headings as bold text without ## marker", () => {
    const { lastFrame } = render(<StreamingMarkdown text="## Section Two" />)
    const frame = lastFrame()!
    expect(frame).toContain("Section Two")
    expect(frame).not.toContain("## ")
  })

  it("renders H3 headings as bold text without ### marker", () => {
    const { lastFrame } = render(<StreamingMarkdown text="### Subsection" />)
    const frame = lastFrame()!
    expect(frame).toContain("Subsection")
    expect(frame).not.toContain("### ")
  })

  // ─── Blockquote tests ──────────────────────────────────────────────

  it("renders blockquotes with dim bar prefix", () => {
    const { lastFrame } = render(<StreamingMarkdown text="> This is quoted" />)
    const frame = lastFrame()!
    expect(frame).toContain("This is quoted")
    // Should contain the vertical bar prefix
    expect(frame).toContain("\u2502")
  })

  it("renders multi-line blockquotes", () => {
    const { lastFrame } = render(<StreamingMarkdown text={"> line one\n> line two"} />)
    const frame = lastFrame()!
    expect(frame).toContain("line one")
    expect(frame).toContain("line two")
  })

  // ─── Link tests ────────────────────────────────────────────────────

  it("renders links with text and URL", () => {
    const { lastFrame } = render(<StreamingMarkdown text="[click here](https://example.com)" />)
    const frame = lastFrame()!
    expect(frame).toContain("click here")
    expect(frame).toContain("https://example.com")
    // Should not contain raw markdown link syntax
    expect(frame).not.toContain("[click here]")
  })

  // ─── Strikethrough tests ───────────────────────────────────────────

  it("renders strikethrough text without ~~ markers", () => {
    const { lastFrame } = render(<StreamingMarkdown text="this is ~~deleted~~ text" />)
    const frame = lastFrame()!
    expect(frame).toContain("deleted")
    expect(frame).not.toContain("~~")
  })

  // ─── Underscore italic tests ───────────────────────────────────────

  it("renders _italic_ text with underscores", () => {
    const { lastFrame } = render(<StreamingMarkdown text="this is _emphasized_ text" />)
    const frame = lastFrame()!
    expect(frame).toContain("emphasized")
    expect(frame).not.toMatch(/_emphasized_/)
  })

  // ─── Combined markdown tests ──────────────────────────────────────

  it("renders mixed heading and paragraph blocks", () => {
    const text = "# Title\n\nSome paragraph text.\n\n## Subtitle\n\nMore text."
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    expect(frame).toContain("Title")
    expect(frame).toContain("Some paragraph text.")
    expect(frame).toContain("Subtitle")
    expect(frame).toContain("More text.")
  })

  it("renders bullet lists as-is", () => {
    const text = "- item one\n- item two\n- item three"
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    expect(frame).toContain("- item one")
    expect(frame).toContain("- item two")
  })

  it("renders numbered lists as-is", () => {
    const text = "1. first\n2. second\n3. third"
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    expect(frame).toContain("1. first")
    expect(frame).toContain("2. second")
  })
})
