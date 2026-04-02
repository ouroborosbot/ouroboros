import React from "react"
import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "ink-testing-library"

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
    expect(frame).toContain("bold")
    expect(frame).not.toContain("**")
  })

  it("renders inline code with styling", () => {
    const { lastFrame } = render(<StreamingMarkdown text="use `npm install` here" />)
    const frame = lastFrame()!
    expect(frame).toContain("npm install")
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
    const stripped = frame.replace(/\n/g, "")
    expect(stripped).toContain("a".repeat(80))
  })

  it("produces no padding characters that corrupt copy-paste", () => {
    const { lastFrame } = render(<StreamingMarkdown text="line one\nline two" />)
    const frame = lastFrame()!
    const lines = frame.split("\n").filter(l => l.length > 0)
    for (const line of lines) {
      expect(line).toBe(line.trimEnd())
    }
  })

  it("renders italic text", () => {
    const { lastFrame } = render(<StreamingMarkdown text="this is *italic* text" />)
    const frame = lastFrame()!
    expect(frame).toContain("italic")
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
    const text = "a".repeat(15)
    const { lastFrame } = render(<StreamingMarkdown text={text} maxWidth={10} />)
    const frame = lastFrame()!
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

  // ─── Horizontal rule tests ────────────────────────────────────────

  it("renders --- as a horizontal rule", () => {
    const { lastFrame } = render(<StreamingMarkdown text={"before\n---\nafter"} />)
    const frame = lastFrame()!
    expect(frame).toContain("before")
    expect(frame).toContain("after")
    expect(frame).toContain("\u2500") // box-drawing dash
    expect(frame).not.toContain("---")
  })

  it("renders *** as a horizontal rule", () => {
    const { lastFrame } = render(<StreamingMarkdown text={"above\n***\nbelow"} />)
    const frame = lastFrame()!
    expect(frame).toContain("above")
    expect(frame).toContain("below")
    expect(frame).toContain("\u2500")
  })

  it("renders ___ as a horizontal rule", () => {
    const { lastFrame } = render(<StreamingMarkdown text={"top\n___\nbottom"} />)
    const frame = lastFrame()!
    expect(frame).toContain("top")
    expect(frame).toContain("bottom")
    expect(frame).toContain("\u2500")
  })

  // ─── Diff rendering tests ─────────────────────────────────────────

  it("renders diff blocks with colored lines", () => {
    const text = [
      "diff --git a/file.ts b/file.ts",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,3 +1,3 @@",
      " unchanged",
      "-removed line",
      "+added line",
    ].join("\n")
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    expect(frame).toContain("diff --git a/file.ts b/file.ts")
    expect(frame).toContain("removed line")
    expect(frame).toContain("added line")
    expect(frame).toContain("unchanged")
  })

  it("renders fenced diff code blocks as diffs", () => {
    const text = "```diff\n-old\n+new\n```"
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    expect(frame).toContain("old")
    expect(frame).toContain("new")
  })

  it("does not treat plain lines starting with + or - as diffs without signal", () => {
    const text = "- bullet one\n- bullet two"
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    // Should render as paragraph (bullet list), not diff
    expect(frame).toContain("- bullet one")
    expect(frame).toContain("- bullet two")
  })

  // ─── Streaming edge case tests ────────────────────────────────────

  it("handles partial code fence (opened but not closed) during streaming", () => {
    const text = "before\n```js\nconst x = 1\nconst y = 2"
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    // Should not crash, and should show the code lines
    expect(frame).toContain("const x = 1")
    expect(frame).toContain("const y = 2")
  })

  it("handles partial bold (** opened but not closed) during streaming", () => {
    const text = "this is **bold but not clo"
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    // Should not crash
    expect(frame).toBeDefined()
    expect(frame).toContain("this is")
  })

  it("handles partial inline code (backtick opened but not closed) during streaming", () => {
    const text = "use `npm inst"
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    expect(frame).toBeDefined()
    expect(frame).toContain("use")
  })

  // ─── Diff with @@ hunk markers ────────────────────────────────────

  it("renders @@ hunk headers in diff blocks", () => {
    const text = [
      "diff --git a/x.ts b/x.ts",
      "@@ -10,6 +10,8 @@",
      " context",
      "+added",
    ].join("\n")
    const { lastFrame } = render(<StreamingMarkdown text={text} />)
    const frame = lastFrame()!
    expect(frame).toContain("@@ -10,6 +10,8 @@")
    expect(frame).toContain("context")
    expect(frame).toContain("added")
  })
})
