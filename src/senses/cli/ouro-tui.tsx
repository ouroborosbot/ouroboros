/**
 * Ouroboros TUI — full terminal interface using Ink v3 + Static.
 *
 * Architecture:
 *   <Static> renders completed messages ONCE — they scroll up naturally.
 *   Only the "live" area (current streaming + spinner + input) re-renders.
 *   This avoids the screen-clearing problem that broke the previous Ink attempt.
 *
 * Design language: ouroboros brand palette from ouroboros.bot / Outlook UI.
 * ZERO business logic here — pure rendering from CliStore state.
 */
import React, { useState, useRef, useEffect, useCallback } from "react"
import { Text, Box, Static, useInput } from "ink"
import { StreamingMarkdown } from "./streaming-markdown"

// ─── Ouroboros Brand Palette (ANSI RGB) ─────────────────────────────
// From packages/outlook-ui/src/style.css and ouroboros.bot
const OURO = {
  scale: "#2f8f4e",    // primary green
  teal: "#4ec9b0",     // tool/accent teal
  glow: "#74e08f",     // bright green (highlights)
  bone: "#eef2ea",     // light text
  mist: "#a5b8a8",     // dim text
  shadow: "#708373",   // very dim
  fang: "#d35f47",     // error red
  gold: "#d6b56f",     // warning amber
  moss: "#183325",     // subtle bg accent
  separator: "#3a5a40", // dim line separator
} as const

// ─── Ring Spinner (growing/shrinking) ───────────────────────────────
const RING_FRAMES = ["∙", "○", "◎", "●", "◎", "○"]

function ringColor(elapsedSec: number): string {
  if (elapsedSec >= 45) return OURO.fang
  if (elapsedSec >= 15) return OURO.gold
  return OURO.scale
}

// ─── Types ──────────────────────────────────────────────────────────

export interface CompletedMessage {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  toolCalls?: Array<{ name: string; argSummary: string; success?: boolean }>
}

export interface LiveState {
  streamingText: string
  loading: boolean
  spinnerPhrase: string
  spinnerPhrasePool: string[]
  activeTool: { name: string; args: Record<string, string> } | null
  errorMessage: string | null
  kickMessage: string | null
  inputSuppressed: boolean
}

export type CtrlCAction = "abort" | "clear" | "warn" | "exit"

export interface TuiProps {
  readonly agentName: string
  readonly model: string
  readonly completedMessages: CompletedMessage[]
  readonly live: LiveState
  readonly elapsedSeconds: number
  readonly contextPercent: number
  readonly onSubmit: (text: string) => void
  readonly onCtrlC: (hasInput: boolean) => CtrlCAction
  readonly headerShown: boolean
}

// ─── Header ─────────────────────────────────────────────────────────

function Header({ agentName, model, contextPercent }: {
  readonly agentName: string
  readonly model: string
  readonly contextPercent: number
}): React.ReactElement {
  const cwd = process.cwd().replace(process.env.HOME ?? "", "~")
  const showCtx = contextPercent > 0
  const info = [agentName, model, cwd, showCtx ? `ctx ${contextPercent}%` : ""].filter(Boolean).join(" · ")
  // Snake body length adapts to content
  const bodyLen = Math.max(info.length + 2, 20)
  const pad = bodyLen - info.length
  const headOffset = bodyLen + 3 // " < " prefix = 3 chars before body
  return (
    <Box flexDirection="column">
      <Text color={OURO.scale}>{" ".repeat(headOffset)}{"____"}</Text>
      <Text color={OURO.scale}>{"  "}{" ".repeat(0)}{"_".repeat(bodyLen)}<Text color={OURO.glow}>{"/ O  \\___/"}</Text></Text>
      <Text color={OURO.scale}>{" <  "}<Text color={OURO.glow}>{info}</Text>{" ".repeat(pad)}{"_____/   \\"}</Text>
    </Box>
  )
}

// ─── Message Rendering ──────────────────────────────────────────────

function truncateArgs(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

function ToolResultLine({ tc }: { readonly tc: { name: string; argSummary: string; success?: boolean } }): React.ReactElement {
  const icon = tc.success !== false ? "✓" : "✗"
  const iconColor = tc.success !== false ? OURO.scale : OURO.fang
  const argColor = tc.success === false ? OURO.fang : OURO.shadow
  return (
    <Text>
      <Text color={iconColor}>{icon}</Text>{" "}
      <Text color={OURO.teal}>{tc.name}</Text>{" "}
      <Text color={argColor}>{truncateArgs(tc.argSummary, 60)}</Text>
    </Text>
  )
}

function MessageBlock({ msg }: { readonly msg: CompletedMessage }): React.ReactElement {
  if (msg.role === "tool") {
    return (
      <Box flexDirection="column">
        {msg.toolCalls?.map((tc, i) => <ToolResultLine key={i} tc={tc} />)}
      </Box>
    )
  }

  if (msg.role === "user") {
    // User messages: bold with a dim > echo, like Claude Code's ) prefix
    return (
      <Box flexDirection="column">
        <Text>{""}</Text>
        {msg.content ? <Text color={OURO.bone} bold>{msg.content}</Text> : null}
        <Text>{""}</Text>
      </Box>
    )
  }

  if (msg.role === "assistant") {
    return (
      <Box flexDirection="column">
        {msg.content ? <StreamingMarkdown text={msg.content} /> : null}
        <Text>{""}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text color={OURO.shadow}>{msg.content}</Text>
    </Box>
  )
}

// ─── Live Area (re-renders) ─────────────────────────────────────────

function Spinner({ phrasePool, elapsed }: {
  readonly phrasePool: string[]
  readonly elapsed: number
}): React.ReactElement {
  const [frame, setFrame] = useState(0)
  const [currentPhrase, setCurrentPhrase] = useState(() =>
    phrasePool.length > 0 ? phrasePool[Math.floor(Math.random() * phrasePool.length)] : ""
  )

  // Animate ring frames
  useEffect(() => {
    const iv = setInterval(() => setFrame(f => (f + 1) % RING_FRAMES.length), 120)
    return () => clearInterval(iv)
  }, [])

  // Rotate phrases every 3 seconds
  useEffect(() => {
    if (phrasePool.length <= 1) return
    const iv = setInterval(() => {
      setCurrentPhrase(phrasePool[Math.floor(Math.random() * phrasePool.length)])
    }, 3000)
    return () => clearInterval(iv)
  }, [phrasePool])

  const color = ringColor(elapsed)
  const timeStr = elapsed > 0 ? `${elapsed}s` : ""

  return (
    <Text color={color}>
      {RING_FRAMES[frame]} {timeStr ? <Text color={OURO.shadow}>{timeStr} · </Text> : ""}{currentPhrase}
    </Text>
  )
}

function ActiveToolLine({ tool }: {
  readonly tool: { name: string; args: Record<string, string> }
}): React.ReactElement {
  const argStr = Object.values(tool.args)[0] ?? ""
  return (
    <Text>
      <Text color={OURO.shadow}>∙</Text>{" "}
      <Text color={OURO.teal}>{tool.name}</Text>{" "}
      <Text color={OURO.shadow}>{truncateArgs(argStr, 60)}</Text>
    </Text>
  )
}

function LiveArea({ live, elapsed }: {
  readonly live: LiveState
  readonly elapsed: number
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      {/* Streaming assistant text — only shown if there IS streaming text */}
      {live.streamingText ? (
        <StreamingMarkdown text={live.streamingText} />
      ) : null}

      {live.activeTool ? (
        <ActiveToolLine tool={live.activeTool} />
      ) : null}

      {live.loading ? (
        <Spinner phrasePool={live.spinnerPhrasePool} elapsed={elapsed} />
      ) : null}

      {live.errorMessage ? (
        <Text color={OURO.fang}>{"✗ "}{live.errorMessage}</Text>
      ) : null}

      {live.kickMessage ? (
        <Text color={OURO.gold}>{"↻ "}{live.kickMessage}</Text>
      ) : null}
    </Box>
  )
}

// ─── Input ──────────────────────────────────────────────────────────

function InputArea({ onSubmit, suppressed, onCtrlC }: {
  readonly onSubmit: (text: string) => void
  readonly suppressed: boolean
  readonly onCtrlC: (hasInput: boolean) => CtrlCAction
}): React.ReactElement {
  const [input, setInput] = useState("")
  const [exitWarning, setExitWarning] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const inputRef = useRef("")

  // Blinking cursor
  useEffect(() => {
    const iv = setInterval(() => setCursorVisible(v => !v), 530)
    return () => clearInterval(iv)
  }, [])

  const handleCtrlC = useCallback(() => {
    const action = onCtrlC(inputRef.current.length > 0)
    if (action === "clear") {
      inputRef.current = ""
      setInput("")
      setExitWarning(false)
    } else if (action === "warn") {
      setExitWarning(true)
    }
    // "abort" and "exit" are handled by the parent (cli.ts)
  }, [onCtrlC])

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "c") {
      handleCtrlC()
      return
    }
    if (suppressed) return

    // Any non-Ctrl-C input clears exit warning
    setExitWarning(false)

    if (key.return) {
      const text = inputRef.current
      if (text.trim()) onSubmit(text)
      inputRef.current = ""
      setInput("")
      return
    }
    if (key.backspace || key.delete) {
      inputRef.current = inputRef.current.slice(0, -1)
      setInput(inputRef.current)
      return
    }
    if (!key.ctrl && !key.meta && inputChar) {
      inputRef.current += inputChar
      setInput(inputRef.current)
    }
  })

  if (suppressed) return <Text>{""}</Text>

  return (
    <Box flexDirection="column">
      {exitWarning ? (
        <Text color={OURO.shadow}>{"(press Ctrl-C again to exit)"}</Text>
      ) : null}
      <Box>
        <Text color={OURO.teal} bold>{"> "}</Text>
        <Text color={OURO.bone}>{input}</Text>
        {!suppressed && cursorVisible ? <Text color={OURO.scale}>{"█"}</Text> : <Text>{" "}</Text>}
      </Box>
    </Box>
  )
}

// ─── Main TUI Component ─────────────────────────────────────────────

export function OuroTui({
  agentName,
  model,
  completedMessages,
  live,
  elapsedSeconds,
  contextPercent,
  onSubmit,
  onCtrlC,
}: TuiProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {/* Header — always visible, rendered once via Static with a sentinel item */}
      <Static items={[{ id: "__header__" }, ...completedMessages] as any[]}>
        {(item: any, index: number) => {
          if (index === 0) {
            return (
              <Box key="header" flexDirection="column">
                <Header agentName={agentName} model={model} contextPercent={contextPercent} />
                <Text>{""}</Text>
              </Box>
            )
          }
          return <MessageBlock key={item.id} msg={item} />
        }}
      </Static>

      {/* Live area — re-renders on every state change */}
      <LiveArea live={live} elapsed={elapsedSeconds} />

      {/* Input */}
      <InputArea onSubmit={onSubmit} suppressed={live.inputSuppressed} onCtrlC={onCtrlC} />
    </Box>
  )
}
