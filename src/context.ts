import type OpenAI from "openai"
import type { Channel } from "./core"
import * as fs from "fs"
import * as path from "path"

export function estimateTokens(messages: OpenAI.ChatCompletionMessageParam[]): number {
  let totalChars = 0
  for (const msg of messages) {
    const m = msg as any
    if (m.content) {
      totalChars += String(m.content).length
    }
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        totalChars += (tc.function?.name || "").length
        totalChars += (tc.function?.arguments || "").length
      }
    }
  }
  return totalChars === 0 ? 0 : Math.ceil(totalChars / 4)
}

// System prompt cache: per channel, with 60s TTL
const _promptCache = new Map<string, { value: string; timestamp: number }>()

export function cachedBuildSystem(channel: Channel, buildFn: (ch: Channel) => string): string {
  const cached = _promptCache.get(channel)
  const now = Date.now()
  if (cached && now - cached.timestamp < 60000) {
    return cached.value
  }
  const value = buildFn(channel)
  _promptCache.set(channel, { value, timestamp: now })
  return value
}

export function resetSystemPromptCache(): void {
  _promptCache.clear()
}

// Hard cap on message array length to stay within API limits (e.g. 16K input items).
// Applies even when estimated tokens are under maxTokens.
const MAX_MESSAGES = 200

export function trimMessages(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
  contextMargin: number,
): OpenAI.ChatCompletionMessageParam[] {
  const totalTokens = estimateTokens(messages)
  const overTokens = totalTokens > maxTokens
  const overCount = messages.length > MAX_MESSAGES

  if (!overTokens && !overCount) {
    return [...messages]
  }

  const trimTarget = maxTokens * (1 - contextMargin / 100)

  // Compute per-message token costs
  const costs: number[] = messages.map((msg) => estimateTokens([msg]))

  let droppedTokens = 0
  let cutIndex = 1 // start after system prompt (index 0)

  // Drop messages until both token budget and count limit are satisfied
  while (cutIndex < messages.length) {
    const remainingCount = messages.length - cutIndex + 1 // +1 for system prompt
    const remainingTokens = totalTokens - droppedTokens
    if (remainingTokens <= trimTarget && remainingCount <= MAX_MESSAGES) break
    droppedTokens += costs[cutIndex]
    cutIndex++
  }

  return [messages[0], ...messages.slice(cutIndex)]
}

export function saveSession(filePath: string, messages: OpenAI.ChatCompletionMessageParam[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, messages }, null, 2))
}

export function loadSession(filePath: string): OpenAI.ChatCompletionMessageParam[] | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const data = JSON.parse(raw)
    if (data.version !== 1) return null
    return data.messages
  } catch {
    return null
  }
}

export function deleteSession(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e
  }
}
