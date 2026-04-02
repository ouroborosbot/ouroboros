import React from "react"
import { Text, Box } from "ink"

/**
 * Render markdown-formatted text as Ink components with ANSI styling.
 *
 * Supports: # headings, **bold**, *italic*, `inline code`, ```fenced code blocks```,
 * > blockquotes, [links](url), ~~strikethrough~~, bullet/numbered lists,
 * horizontal rules (--- / ***), and unified diff coloring.
 *
 * Designed for streaming: accepts partial text and re-renders as text prop grows.
 * Incomplete code fences are rendered as dim text without crashing.
 *
 * Copy-paste integrity: no padding characters are injected. Visual hierarchy
 * comes from color/bold/dim styling only.
 *
 * Uses standard ANSI colors (cyan, green, red, dim, bold, italic, underline)
 * that work on both light and dark terminal themes.
 */

interface StreamingMarkdownProps {
  /** The markdown text to render. May be partial (streaming). */
  readonly text: string
  /** Maximum width in columns. Lines wrap at this boundary. */
  readonly maxWidth?: number
}

// ─── Inline Segment Types ──────────────────────────────────────────

interface Segment {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  codeBlock?: boolean
  strikethrough?: boolean
  link?: { text: string; url: string }
}

// ─── Line-Level Block Types ────────────────────────────────────────

interface Block {
  type: "paragraph" | "heading" | "codeblock" | "blockquote" | "blank" | "hr" | "diff"
  level?: number        // heading level (1-6)
  language?: string     // code block language
  lines: string[]       // raw text lines for this block
}

// ─── Block Parser ──────────────────────────────────────────────────

const HR_PATTERN = /^(\s*[-*_]){3,}\s*$/

/** Detect if a line is a diff header or hunk marker. */
function isDiffLine(line: string): boolean {
  return (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("@@") ||
    line.startsWith("+") ||
    line.startsWith("-")
  )
}

/** Check if a block of consecutive lines looks like a unified diff. */
function looksLikeDiff(lines: string[]): boolean {
  // Need at least one strong diff signal (not just lines starting with +/-)
  return lines.some(l =>
    l.startsWith("diff --git") ||
    l.startsWith("@@") ||
    l.startsWith("--- a/") ||
    l.startsWith("+++ b/"),
  )
}

function parseBlocks(input: string): Block[] {
  const rawLines = input.split("\n")
  const blocks: Block[] = []
  let i = 0

  while (i < rawLines.length) {
    const line = rawLines[i]

    // Fenced code block (``` with optional language)
    if (line.trimStart().startsWith("```")) {
      const langMatch = line.match(/^```(\w*)/)
      const language = langMatch?.[1] ?? ""

      // Special case: ```diff → render as diff block
      if (language === "diff") {
        const codeLines: string[] = []
        i++
        while (i < rawLines.length && !rawLines[i].trimStart().startsWith("```")) {
          codeLines.push(rawLines[i])
          i++
        }
        // Skip closing fence if present
        if (i < rawLines.length) i++
        blocks.push({ type: "diff", lines: codeLines })
        continue
      }

      const codeLines: string[] = []
      i++
      while (i < rawLines.length && !rawLines[i].trimStart().startsWith("```")) {
        codeLines.push(rawLines[i])
        i++
      }
      // Skip closing fence if present (if not, it's a streaming partial)
      if (i < rawLines.length) i++
      blocks.push({ type: "codeblock", language, lines: codeLines })
      continue
    }

    // Horizontal rule (---, ***, ___)
    if (HR_PATTERN.test(line)) {
      blocks.push({ type: "hr", lines: [line] })
      i++
      continue
    }

    // Heading (# through ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, lines: [headingMatch[2]] })
      i++
      continue
    }

    // Blockquote (> text)
    if (line.match(/^>\s?/)) {
      const quoteLines: string[] = []
      while (i < rawLines.length && rawLines[i].match(/^>\s?/)) {
        quoteLines.push(rawLines[i].replace(/^>\s?/, ""))
        i++
      }
      blocks.push({ type: "blockquote", lines: quoteLines })
      continue
    }

    // Diff block detection: consecutive diff-like lines with a strong signal
    if (isDiffLine(line)) {
      const diffLines: string[] = []
      const startI = i
      while (i < rawLines.length && isDiffLine(rawLines[i])) {
        diffLines.push(rawLines[i])
        i++
      }
      if (looksLikeDiff(diffLines)) {
        blocks.push({ type: "diff", lines: diffLines })
        continue
      }
      // Not actually a diff — backtrack and treat as paragraph
      i = startI
    }

    // Blank line
    if (line.trim() === "") {
      blocks.push({ type: "blank", lines: [""] })
      i++
      continue
    }

    // Regular paragraph (collect consecutive non-special lines)
    const paraLines: string[] = []
    while (
      i < rawLines.length &&
      rawLines[i].trim() !== "" &&
      !rawLines[i].trimStart().startsWith("```") &&
      !rawLines[i].match(/^#{1,6}\s/) &&
      !rawLines[i].match(/^>\s?/) &&
      !HR_PATTERN.test(rawLines[i])
    ) {
      paraLines.push(rawLines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paraLines })
    }
  }

  return blocks
}

// ─── Inline Parser ─────────────────────────────────────────────────

/**
 * Parse inline markdown (bold, italic, code, links, strikethrough)
 * from a single line of text.
 */
function parseInline(text: string): Segment[] {
  const segments: Segment[] = []
  const placeholders: { idx: number; segment: Segment }[] = []

  // Step 1: extract inline code
  let processed = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const idx = placeholders.length
    placeholders.push({ idx, segment: { text: code, code: true } })
    return `\x00PH${idx}\x00`
  })

  // Step 2: extract links [text](url)
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, linkText: string, url: string) => {
    const idx = placeholders.length
    placeholders.push({ idx, segment: { text: linkText, link: { text: linkText, url } } })
    return `\x00PH${idx}\x00`
  })

  // Step 3: extract strikethrough ~~text~~
  processed = processed.replace(/~~(.+?)~~/g, (_m, content: string) => {
    const idx = placeholders.length
    placeholders.push({ idx, segment: { text: content, strikethrough: true } })
    return `\x00PH${idx}\x00`
  })

  // Step 4: parse bold and italic from remaining text
  const parts = processed.split(/(\x00PH\d+\x00)/)

  for (const part of parts) {
    const phMatch = part.match(/^\x00PH(\d+)\x00$/)
    if (phMatch) {
      segments.push(placeholders[parseInt(phMatch[1])].segment)
      continue
    }

    // Parse **bold** and *italic* / _italic_
    parseInlineStyles(part, segments)
  }

  return segments
}

function parseInlineStyles(text: string, segments: Segment[]): void {
  // Match **bold**, *italic*, and _italic_ patterns
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(_(.+?)_)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) })
    }

    if (match[2]) {
      segments.push({ text: match[2], bold: true })
    } else if (match[4]) {
      segments.push({ text: match[4], italic: true })
    } else if (match[6]) {
      segments.push({ text: match[6], italic: true })
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) })
  }
}

// ─── Word Wrap ─────────────────────────────────────────────────────

function wrapText(text: string, maxWidth: number): string {
  /* v8 ignore next -- defensive guard for non-positive width @preserve */
  if (maxWidth <= 0) return text
  const lines = text.split("\n")
  const result: string[] = []
  for (const line of lines) {
    if (line.length <= maxWidth) {
      result.push(line)
    } else {
      let remaining = line
      while (remaining.length > maxWidth) {
        let breakAt = remaining.lastIndexOf(" ", maxWidth)
        if (breakAt <= 0) breakAt = maxWidth
        result.push(remaining.slice(0, breakAt))
        remaining = remaining.slice(breakAt).replace(/^ /, "")
      }
      /* v8 ignore next -- defensive guard for empty remaining after word-wrap @preserve */
      if (remaining) result.push(remaining)
    }
  }
  return result.join("\n")
}

// ─── Segment Renderer ──────────────────────────────────────────────

function SegmentRenderer({ segment }: { readonly segment: Segment }): React.ReactElement {
  if (segment.codeBlock) {
    return <Text dimColor>{segment.text}</Text>
  }
  if (segment.code) {
    return <Text color="cyan">{segment.text}</Text>
  }
  if (segment.link) {
    return <Text><Text color="cyan">{segment.link.text}</Text><Text dimColor>{` (${segment.link.url})`}</Text></Text>
  }
  if (segment.strikethrough) {
    return <Text dimColor strikethrough>{segment.text}</Text>
  }
  if (segment.bold) {
    return <Text bold>{segment.text}</Text>
  }
  if (segment.italic) {
    return <Text italic>{segment.text}</Text>
  }
  return <Text>{segment.text}</Text>
}

// ─── Inline Line Renderer ──────────────────────────────────────────

function InlineLine({ text: lineText }: { readonly text: string }): React.ReactElement {
  const segs = parseInline(lineText)
  return (
    <Text>
      {segs.map((seg, i) => (
        <SegmentRenderer key={i} segment={seg} />
      ))}
    </Text>
  )
}

// ─── Diff Line Renderer ───────────────────────────────────────────

function DiffLine({ line }: { readonly line: string }): React.ReactElement {
  if (line.startsWith("@@")) {
    return <Text color="cyan">{line}</Text>
  }
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ")
  ) {
    return <Text bold>{line}</Text>
  }
  if (line.startsWith("+")) {
    return <Text color="green">{line}</Text>
  }
  if (line.startsWith("-")) {
    return <Text color="red">{line}</Text>
  }
  return <Text>{line}</Text>
}

// ─── Block Renderer ────────────────────────────────────────────────

function BlockRenderer({ block }: { readonly block: Block }): React.ReactElement {
  switch (block.type) {
    case "blank":
      return <Text>{""}</Text>

    case "hr":
      return <Text dimColor>{"────────────────────────────────────────"}</Text>

    case "heading": {
      const text = block.lines.join(" ")
      if ((block.level ?? 1) === 1) {
        return <Text bold underline>{text}</Text>
      }
      return <Text bold>{text}</Text>
    }

    case "codeblock":
      return (
        <Box flexDirection="column">
          {block.lines.map((line, i) => (
            <Text key={i} dimColor>{line}</Text>
          ))}
        </Box>
      )

    case "diff":
      return (
        <Box flexDirection="column">
          {block.lines.map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </Box>
      )

    case "blockquote":
      return (
        <Box flexDirection="column">
          {block.lines.map((line, i) => (
            <Text key={i}>
              <Text dimColor>{"\u2502 "}</Text>
              <Text italic><InlineLine text={line} /></Text>
            </Text>
          ))}
        </Box>
      )

    case "paragraph":
      return (
        <Box flexDirection="column">
          {block.lines.map((line, i) => (
            <InlineLine key={i} text={line} />
          ))}
        </Box>
      )
  }
}

// ─── Main Component ────────────────────────────────────────────────

export function StreamingMarkdown({ text, maxWidth }: StreamingMarkdownProps): React.ReactElement {
  const processed = maxWidth ? wrapText(text, maxWidth) : text
  const blocks = parseBlocks(processed)

  if (blocks.length === 0) {
    return <Text>{""}</Text>
  }

  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </Box>
  )
}
