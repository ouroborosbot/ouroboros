import type OpenAI from "openai"
import type { Channel } from "./core"

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

export function trimMessages(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
  contextMargin: number,
): OpenAI.ChatCompletionMessageParam[] {
  const totalTokens = estimateTokens(messages)
  if (totalTokens <= maxTokens) {
    return [...messages]
  }

  const trimTarget = maxTokens * (1 - contextMargin / 100)

  // Compute per-message token costs
  const costs: number[] = messages.map((msg) => estimateTokens([msg]))

  let droppedTokens = 0
  let cutIndex = 1 // start after system prompt (index 0)

  while (cutIndex < messages.length && totalTokens - droppedTokens > trimTarget) {
    droppedTokens += costs[cutIndex]
    cutIndex++
  }

  return [messages[0], ...messages.slice(cutIndex)]
}
