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
import React, { useState, useRef, useEffect } from "react"
import { Text, Box, Static, useInput } from "ink"

// ─── Ouroboros Brand Palette (ANSI RGB) ─────────────────────────────
// From packages/outlook-ui/src/style.css and ouroboros.bot
const OURO = {
  scale: "#2f8f4e",    // primary green
  glow: "#74e08f",     // bright green (highlights)
  bone: "#eef2ea",     // light text
  mist: "#a5b8a8",     // dim text
  shadow: "#708373",   // very dim
  fang: "#d35f47",     // error red
  gold: "#d6b56f",     // warning amber
  moss: "#183325",     // subtle bg accent
} as const

// ─── Snake Spinner ──────────────────────────────────────────────────
// Ouroboros: serpent eating its own tail. The animation cycles through
// a snake-like chase pattern.
const SNAKE_FRAMES = ["◜", "◠", "◝", "◞", "◡", "◟"]

function snakeColor(elapsedSec: number): string {
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
  activeTool: { name: string; args: Record<string, string> } | null
  errorMessage: string | null
  kickMessage: string | null
  inputSuppressed: boolean
}

export interface TuiProps {
  readonly agentName: string
  readonly model: string
  readonly completedMessages: CompletedMessage[]
  readonly live: LiveState
  readonly elapsedSeconds: number
  readonly contextPercent: number
  readonly onSubmit: (text: string) => void
  readonly onExit: () => void
}

// ─── Header ─────────────────────────────────────────────────────────

function Header({ agentName, model, contextPercent }: {
  readonly agentName: string
  readonly model: string
  readonly contextPercent: number
}): React.ReactElement {
  const ctxColor = contextPercent > 80 ? OURO.fang : contextPercent > 60 ? OURO.gold : OURO.scale
  return (
    <Box flexDirection="column">
      <Text color={OURO.scale} bold>{"  ◎ "}<Text color={OURO.glow} bold>{agentName}</Text></Text>
      <Text color={OURO.shadow}>{"    "}{model} · ctx: <Text color={ctxColor}>{contextPercent}%</Text></Text>
      <Text color={OURO.moss}>{"  ─────────────────────────────────────────"}</Text>
    </Box>
  )
}

// ─── Message Rendering ──────────────────────────────────────────────

function RoleLabel({ role }: { readonly role: string }): React.ReactElement {
  if (role === "user") return <Text color={OURO.bone} bold>{"  you"}</Text>
  if (role === "assistant") return <Text color={OURO.glow} bold>{"  ◎"}</Text>
  return <Text color={OURO.shadow}>{"  ⊘ "}{role}</Text>
}

function MessageBlock({ msg }: { readonly msg: CompletedMessage }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <RoleLabel role={msg.role} />
      {msg.content ? <Text color={msg.role === "user" ? OURO.bone : OURO.mist}>{"  "}{msg.content}</Text> : null}
      {msg.toolCalls?.map((tc, i) => {
        const icon = tc.success !== false ? "✓" : "✗"
        const color = tc.success !== false ? OURO.scale : OURO.fang
        return (
          <Text key={i} color={color}>{"  "}{icon} <Text color={OURO.scale} bold>{tc.name}</Text> <Text color={OURO.shadow}>{tc.argSummary}</Text></Text>
        )
      })}
      <Text>{""}</Text>
    </Box>
  )
}

// ─── Live Area (re-renders) ─────────────────────────────────────────

function Spinner({ phrase, elapsed }: {
  readonly phrase: string
  readonly elapsed: number
}): React.ReactElement {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setFrame(f => (f + 1) % SNAKE_FRAMES.length), 100)
    return () => clearInterval(iv)
  }, [])

  const color = snakeColor(elapsed)
  const timeStr = elapsed > 0 ? `${elapsed}s` : ""

  return (
    <Text color={color}>
      {"  "}{SNAKE_FRAMES[frame]} {timeStr ? <Text color={OURO.shadow}>{timeStr} · </Text> : ""}{phrase}
    </Text>
  )
}

function LiveArea({ live, elapsed }: {
  readonly live: LiveState
  readonly elapsed: number
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      {/* Streaming assistant text */}
      {live.streamingText ? (
        <Box flexDirection="column">
          <Text color={OURO.glow} bold>{"  ◎"}</Text>
          <Text color={OURO.mist}>{"  "}{live.streamingText}</Text>
        </Box>
      ) : null}

      {/* Active tool */}
      {live.activeTool ? (
        <Text color={OURO.scale}>{"  ⟳ "}<Text bold>{live.activeTool.name}</Text> <Text color={OURO.shadow}>{Object.values(live.activeTool.args)[0] ?? ""}</Text></Text>
      ) : null}

      {/* Spinner */}
      {live.loading ? (
        <Spinner phrase={live.spinnerPhrase} elapsed={elapsed} />
      ) : null}

      {/* Error */}
      {live.errorMessage ? (
        <Text color={OURO.fang}>{"  ✗ "}{live.errorMessage}</Text>
      ) : null}

      {/* Kick */}
      {live.kickMessage ? (
        <Text color={OURO.gold}>{"  ↻ "}{live.kickMessage}</Text>
      ) : null}
    </Box>
  )
}

// ─── Input ──────────────────────────────────────────────────────────

function InputArea({ onSubmit, suppressed }: {
  readonly onSubmit: (text: string) => void
  readonly suppressed: boolean
}): React.ReactElement {
  const [input, setInput] = useState("")
  const inputRef = useRef("")

  useInput((inputChar, key) => {
    if (suppressed) return
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
    <Box>
      <Text color={OURO.scale} bold>{"  ᐳ "}</Text>
      <Text color={OURO.bone}>{input}</Text>
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
  onExit,
}: TuiProps): React.ReactElement {
  // Ctrl-C handling
  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      onExit()
    }
  })

  return (
    <Box flexDirection="column">
      {/* Completed messages — rendered ONCE by Static, scroll up naturally */}
      <Static items={completedMessages}>
        {(msg, index) => {
          // First item: render header before it
          if (index === 0) {
            return (
              <Box key={msg.id} flexDirection="column">
                <Header agentName={agentName} model={model} contextPercent={contextPercent} />
                <Text>{""}</Text>
                <MessageBlock msg={msg} />
              </Box>
            )
          }
          return <MessageBlock key={msg.id} msg={msg} />
        }}
      </Static>

      {/* Live area — re-renders on every state change */}
      <LiveArea live={live} elapsed={elapsedSeconds} />

      {/* Input */}
      <InputArea onSubmit={onSubmit} suppressed={live.inputSuppressed} />
    </Box>
  )
}
