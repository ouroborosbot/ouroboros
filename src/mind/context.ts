import type OpenAI from "openai"
import type { Channel } from "./prompt"
import * as fs from "fs"
import * as path from "path"

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
// Applies even when actualTokenCount is under maxTokens.
const MAX_MESSAGES = 200

export function trimMessages(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
  contextMargin: number,
  actualTokenCount?: number,
): OpenAI.ChatCompletionMessageParam[] {
  const overTokens = actualTokenCount ? actualTokenCount > maxTokens : false
  const overCount = messages.length > MAX_MESSAGES

  if (!overTokens && !overCount) {
    return [...messages]
  }

  const trimTarget = maxTokens * (1 - contextMargin / 100)

  // Estimate per-message cost proportionally from actualTokenCount
  const perMessageCost = actualTokenCount ? actualTokenCount / messages.length : 0

  let droppedTokens = 0
  let cutIndex = 1 // start after system prompt (index 0)

  // Drop oldest messages (after system prompt) until budget and count are satisfied
  while (cutIndex < messages.length) {
    const remainingCount = messages.length - cutIndex + 1 // +1 for system prompt
    const remainingTokens = (actualTokenCount || 0) - droppedTokens
    const tokensSatisfied = !actualTokenCount || remainingTokens <= trimTarget
    if (tokensSatisfied && remainingCount <= MAX_MESSAGES) break
    droppedTokens += perMessageCost
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
