import type OpenAI from "openai"
import { buildSystem } from "./prompt"
import type { BuildSystemOptions, Channel } from "./prompt"
import type { ResolvedContext } from "./friends/types"
import { emitNervesEvent } from "../nerves/runtime"

export async function refreshSystemPrompt(
  messages: OpenAI.ChatCompletionMessageParam[],
  channel: Channel,
  options?: BuildSystemOptions,
  context?: ResolvedContext,
): Promise<void> {
  const newSystem = await buildSystem(channel, options, context)

  if (messages.length > 0 && messages[0].role === "system") {
    messages[0] = { role: "system", content: newSystem }
  } else {
    messages.unshift({ role: "system", content: newSystem })
  }

  emitNervesEvent({
    event: "mind.system_prompt_refreshed",
    component: "mind",
    message: "system prompt refreshed",
    meta: { channel },
  })
}
