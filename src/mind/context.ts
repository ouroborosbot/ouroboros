import type OpenAI from "openai"
import type { Channel } from "./prompt"
import { getContextConfig } from "../config"
import * as fs from "fs"
import * as path from "path"

export interface UsageData {
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  total_tokens: number
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
  actualTokenCount?: number,
): OpenAI.ChatCompletionMessageParam[] {
  const overTokens = actualTokenCount ? actualTokenCount > maxTokens : false

  if (!overTokens) {
    return [...messages]
  }

  const trimTarget = maxTokens * (1 - contextMargin / 100)

  // Estimate per-message cost proportionally from actualTokenCount
  const perMessageCost = actualTokenCount ? actualTokenCount / messages.length : 0

  let droppedTokens = 0
  let cutIndex = 1 // start after system prompt (index 0)

  // Drop oldest messages (after system prompt) until under budget
  while (cutIndex < messages.length) {
    const remainingTokens = (actualTokenCount || 0) - droppedTokens
    if (remainingTokens <= trimTarget) break
    droppedTokens += perMessageCost
    cutIndex++
  }

  return [messages[0], ...messages.slice(cutIndex)]
}

export function saveSession(filePath: string, messages: OpenAI.ChatCompletionMessageParam[], lastUsage?: UsageData): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const envelope: any = { version: 1, messages }
  if (lastUsage) envelope.lastUsage = lastUsage
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2))
}

export function loadSession(filePath: string): { messages: OpenAI.ChatCompletionMessageParam[]; lastUsage?: UsageData } | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const data = JSON.parse(raw)
    if (data.version !== 1) return null
    return { messages: data.messages, lastUsage: data.lastUsage }
  } catch {
    return null
  }
}

export function postTurn(
  messages: OpenAI.ChatCompletionMessageParam[],
  sessPath: string,
  usage?: UsageData,
): void {
  const { maxTokens, contextMargin } = getContextConfig()
  const trimmed = trimMessages(messages, maxTokens, contextMargin, usage?.input_tokens)
  messages.splice(0, messages.length, ...trimmed)
  saveSession(sessPath, messages, usage)
}

export function deleteSession(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e
  }
}
