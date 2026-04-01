/**
 * TUI Store — mutable external state for the OuroTui component.
 *
 * Tracks two buckets:
 *   1. completedMessages — fed to Ink's <Static>, rendered once
 *   2. live — current turn state, re-renders on change
 *
 * ZERO business logic. Just state + notify.
 */
import { pickPhrase, getPhrases } from "../../mind/phrases"
import { formatKick, formatError } from "../../mind/format"
import type { CompletedMessage, LiveState } from "./ouro-tui"
import type { ChannelCallbacks } from "../../heart/core"
import { emitNervesEvent } from "../../nerves/runtime"

type Listener = () => void

export class TuiStore {
  private _completed: CompletedMessage[] = []
  private _live: LiveState = {
    streamingText: "",
    loading: false,
    spinnerPhrase: "",
    activeTool: null,
    errorMessage: null,
    kickMessage: null,
    inputSuppressed: false,
  }
  private _elapsed = 0
  private _spinnerStart = 0
  private _hadTool = false
  private _turnId = 0
  private _listeners = new Set<Listener>()

  get completedMessages(): readonly CompletedMessage[] { return this._completed }
  get live(): Readonly<LiveState> { return this._live }
  get elapsed(): number { return this._elapsed }

  subscribe(fn: Listener): () => void {
    this._listeners.add(fn)
    return () => { this._listeners.delete(fn) }
  }

  private notify(): void {
    for (const fn of this._listeners) fn()
  }

  // ─── Called by business logic (via callbacks) ───

  modelStart(): void {
    const phrases = getPhrases()
    const pool = this._hadTool ? phrases.followup : phrases.thinking
    this._live = {
      ...this._live,
      loading: true,
      spinnerPhrase: pickPhrase(pool),
      streamingText: "",
      activeTool: null,
      errorMessage: null,
      kickMessage: null,
    }
    this._spinnerStart = Date.now()
    this._turnId++
    this.notify()
  }

  appendText(text: string): void {
    this._live = {
      ...this._live,
      loading: false,
      streamingText: this._live.streamingText + text,
    }
    this.notify()
  }

  clearText(): void {
    this._live = { ...this._live, streamingText: "" }
    this.notify()
  }

  toolStart(name: string, args: Record<string, string>): void {
    this._hadTool = true
    this._live = {
      ...this._live,
      loading: true,
      activeTool: { name, args },
      spinnerPhrase: pickPhrase(getPhrases().tool),
    }
    this._spinnerStart = Date.now()
    this.notify()
  }

  toolEnd(name: string, argSummary: string, success: boolean): void {
    // Move tool result to completed messages (so it renders via Static)
    this._completed = [...this._completed, {
      id: `tool-${this._turnId}-${Date.now()}`,
      role: "tool" as const,
      content: "",
      toolCalls: [{ name, argSummary, success }],
    }]
    this._live = {
      ...this._live,
      loading: false,
      activeTool: null,
    }
    this.notify()
  }

  setError(msg: string): void {
    this._live = { ...this._live, loading: false, errorMessage: msg }
    this.notify()
  }

  setKick(): void {
    this._live = { ...this._live, loading: false, kickMessage: formatKick() }
    this.notify()
  }

  suppressInput(): void {
    this._live = { ...this._live, inputSuppressed: true }
    this.notify()
  }

  restoreInput(): void {
    this._live = { ...this._live, inputSuppressed: false }
    this.notify()
  }

  /** Commit current streaming text as a completed assistant message */
  commitAssistantMessage(): void {
    if (this._live.streamingText.trim()) {
      this._completed = [...this._completed, {
        id: `asst-${this._turnId}-${Date.now()}`,
        role: "assistant",
        content: this._live.streamingText.trim(),
      }]
    }
    this._live = {
      ...this._live,
      loading: false,
      streamingText: "",
      activeTool: null,
      errorMessage: null,
      kickMessage: null,
    }
    this.notify()
  }

  /** Add a user message to completed (for display) */
  addUserMessage(text: string): void {
    this._completed = [...this._completed, {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    }]
    this.notify()
  }

  updateElapsed(): void {
    if (this._live.loading) {
      this._elapsed = Math.floor((Date.now() - this._spinnerStart) / 1000)
    } else {
      this._elapsed = 0
    }
    // Don't notify for elapsed-only updates (timer handles its own re-render)
  }
}

// ─── Callbacks factory ──────────────────────────────────────────────

export function createTuiCallbacks(store: TuiStore): ChannelCallbacks & { flushMarkdown(): void } {
  emitNervesEvent({
    component: "senses",
    event: "senses.tui_callbacks_created",
    message: "TUI callbacks created",
    meta: {},
  })

  return {
    onModelStart: () => { store.modelStart() },
    onModelStreamStart: () => {},
    onClearText: () => { store.clearText() },
    onTextChunk: (text: string) => { store.appendText(text) },
    onReasoningChunk: () => {},
    onToolStart: (name: string, args: Record<string, string>) => { store.toolStart(name, args) },
    onToolEnd: (name: string, argSummary: string, success: boolean) => { store.toolEnd(name, argSummary, success) },
    onError: (error: Error, severity: "transient" | "terminal") => {
      store.setError(severity === "terminal" ? formatError(error) : error.message)
    },
    onKick: () => { store.setKick() },
    flushMarkdown: () => { store.commitAssistantMessage() },
  }
}
