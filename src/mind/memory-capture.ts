import type OpenAI from "openai"
import * as path from "path"
import { getAgentRoot } from "../identity"
import { appendFactsWithDedup, ensureMemoryStorePaths, extractMemoryHighlights } from "./memory"
import { emitNervesEvent } from "../nerves/runtime"

export function captureTurnMemories(
  messages: OpenAI.ChatCompletionMessageParam[],
  source: string,
  now: () => Date = () => new Date(),
): void {
  const highlights = extractMemoryHighlights(messages)
  if (highlights.length === 0) return

  try {
    const createdAt = now().toISOString()
    const stores = ensureMemoryStorePaths(path.join(getAgentRoot(), "psyche", "memory"))
    appendFactsWithDedup(
      stores,
      highlights.map((text, index) => ({
        id: `${source}-${createdAt}-${index}`,
        text,
        source,
        createdAt,
        embedding: [],
      })),
    )
  } catch (error) {
    emitNervesEvent({
      level: "warn",
      event: "mind.memory_capture_error",
      component: "mind",
      message: "memory capture failed",
      meta: {
        source,
        reason: error instanceof Error ? error.message : String(error),
      },
    })
  }
}
