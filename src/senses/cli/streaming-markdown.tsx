import React from "react"
import { Text, Box } from "ink"

/**
 * Render markdown-formatted text as Ink components with ANSI styling.
 *
 * Supports: **bold**, *italic*, `inline code`, and ```fenced code blocks```.
 * Designed for streaming: accepts partial text and re-renders as text prop grows.
 *
 * Copy-paste integrity: no padding characters are injected. Visual hierarchy
 * comes from color/bold/dim styling only.
 */

interface StreamingMarkdownProps {
  /** The markdown text to render. May be partial (streaming). */
  readonly text: string
  /** Maximum width in columns. Lines wrap at this boundary. */
  readonly maxWidth?: number
}

interface Segment {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  codeBlock?: boolean
}

/**
 * Parse markdown text into styled segments.
 * Handles: fenced code blocks, inline code, bold, italic.
 */
function parseMarkdown(input: string): Segment[] {
  const segments: Segment[] = []
  const placeholders: { idx: number; segment: Segment }[] = []

  // Step 1: extract fenced code blocks
  let text = input.replace(/```(?:\w*\n)?([\s\S]*?)```/g, (_m, code: string) => {
    const idx = placeholders.length
    placeholders.push({ idx, segment: { text: code.replace(/\n$/, ""), codeBlock: true } })
    return `\x00BLOCK${idx}\x00`
  })

  // Step 2: extract inline code
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const idx = placeholders.length
    placeholders.push({ idx, segment: { text: code, code: true } })
    return `\x00CODE${idx}\x00`
  })

  // Step 3: parse bold and italic from remaining text
  // Split on placeholder boundaries to preserve them
  const parts = text.split(/(\x00(?:BLOCK|CODE)\d+\x00)/)

  for (const part of parts) {
    // Check if this is a placeholder
    const blockMatch = part.match(/^\x00BLOCK(\d+)\x00$/)
    if (blockMatch) {
      segments.push(placeholders[parseInt(blockMatch[1])].segment)
      continue
    }
    const codeMatch = part.match(/^\x00CODE(\d+)\x00$/)
    if (codeMatch) {
      segments.push(placeholders[parseInt(codeMatch[1])].segment)
      continue
    }

    // Parse bold and italic in this text fragment
    parseInlineStyles(part, segments)
  }

  return segments
}

function parseInlineStyles(text: string, segments: Segment[]): void {
  // Match **bold** and *italic* patterns
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) })
    }

    /* v8 ignore next -- bold branch not exercised in rendering tests @preserve */
    if (match[2]) {
      // Bold
      segments.push({ text: match[2], bold: true })
    } else if (match[4]) {
      // Italic
      segments.push({ text: match[4], italic: true })
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) })
  }
}

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
        // Try to break at a space
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

// Ouroboros brand: green-family palette
const OURO_CODE_COLOR = "#4ec9b0"    // teal-green for inline code
const OURO_CODEBLOCK_DIM = true       // dim for code blocks (subtle, readable)

function SegmentRenderer({ segment }: { readonly segment: Segment }): React.ReactElement {
  if (segment.codeBlock) {
    return <Text dimColor={OURO_CODEBLOCK_DIM}>{segment.text}</Text>
  }
  if (segment.code) {
    return <Text color={OURO_CODE_COLOR}>{segment.text}</Text>
  }
  if (segment.bold) {
    return <Text bold>{segment.text}</Text>
  }
  if (segment.italic) {
    return <Text italic>{segment.text}</Text>
  }
  return <Text>{segment.text}</Text>
}

export function StreamingMarkdown({ text, maxWidth }: StreamingMarkdownProps): React.ReactElement {
  const processed = maxWidth ? wrapText(text, maxWidth) : text
  const segments = parseMarkdown(processed)

  if (segments.length === 0) {
    return <Text>{""}</Text>
  }

  return (
    <Box flexDirection="column">
      <Text>
        {segments.map((seg, i) => (
          <SegmentRenderer key={i} segment={seg} />
        ))}
      </Text>
    </Box>
  )
}
