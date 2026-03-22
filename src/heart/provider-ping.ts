import type { ProviderErrorClassification, ProviderRuntime } from "./core"
import type { AgentProvider } from "./identity"
import type {
  AnthropicProviderConfig,
  AzureProviderConfig,
  MinimaxProviderConfig,
  OpenAICodexProviderConfig,
} from "./config"
import { loadAgentSecrets } from "./daemon/auth-flow"
import { createAnthropicProviderRuntime } from "./providers/anthropic"
import { createAzureProviderRuntime } from "./providers/azure"
import { createMinimaxProviderRuntime } from "./providers/minimax"
import { createOpenAICodexProviderRuntime } from "./providers/openai-codex"
import { emitNervesEvent } from "../nerves/runtime"

export type PingResult =
  | { ok: true }
  | { ok: false; classification: ProviderErrorClassification; message: string }

type ProviderConfig =
  | AnthropicProviderConfig
  | AzureProviderConfig
  | MinimaxProviderConfig
  | OpenAICodexProviderConfig

const PING_TIMEOUT_MS = 10_000

function hasEmptyCredentials(provider: AgentProvider, config: ProviderConfig): boolean {
  switch (provider) {
    case "anthropic":
      return !(config as AnthropicProviderConfig).setupToken
    case "openai-codex":
      return !(config as OpenAICodexProviderConfig).oauthAccessToken
    case "minimax":
      return !(config as MinimaxProviderConfig).apiKey
    case "azure": {
      const azure = config as AzureProviderConfig
      return !(azure.apiKey && azure.endpoint && azure.deployment)
    }
    /* v8 ignore next 2 -- github-copilot ping: not yet wired @preserve */
    default:
      return true
  }
}

function createRuntimeForPing(provider: AgentProvider, config: ProviderConfig): ProviderRuntime {
  switch (provider) {
    case "anthropic":
      return createAnthropicProviderRuntime(config as AnthropicProviderConfig)
    case "azure":
      return createAzureProviderRuntime(config as AzureProviderConfig)
    case "minimax":
      return createMinimaxProviderRuntime(config as MinimaxProviderConfig)
    case "openai-codex":
      return createOpenAICodexProviderRuntime(config as OpenAICodexProviderConfig)
    /* v8 ignore next 2 -- github-copilot ping: not yet wired @preserve */
    default:
      throw new Error(`unsupported provider for ping: ${provider}`)
  }
}

const noopCallbacks = {
  onModelStart: () => {},
  onModelStreamStart: () => {},
  onTextChunk: () => {},
  onReasoningChunk: () => {},
  onToolStart: () => {},
  onToolEnd: () => {},
  onError: () => {},
}

export async function pingProvider(
  provider: AgentProvider,
  config: ProviderConfig,
): Promise<PingResult> {
  if (hasEmptyCredentials(provider, config)) {
    return { ok: false, classification: "auth-failure", message: "no credentials configured" }
  }

  let runtime: ProviderRuntime
  try {
    runtime = createRuntimeForPing(provider, config)
  } catch (error) {
    return {
      ok: false,
      classification: "auth-failure",
      message: error instanceof Error ? error.message : String(error),
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
    try {
      await runtime.streamTurn({
        messages: [{ role: "user", content: "ping" }],
        activeTools: [],
        callbacks: noopCallbacks,
        signal: controller.signal,
      })
      return { ok: true }
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    let classification: ProviderErrorClassification
    try {
      classification = runtime.classifyError(err)
    } catch {
      classification = "unknown"
    }
    emitNervesEvent({
      component: "engine",
      event: "engine.provider_ping_fail",
      message: `provider ping failed: ${provider}`,
      meta: { provider, classification, error: err.message },
    })
    return { ok: false, classification, message: err.message }
  }
}

export type HealthInventoryResult = Partial<Record<AgentProvider, PingResult>>

const PINGABLE_PROVIDERS: AgentProvider[] = ["anthropic", "openai-codex", "azure", "minimax"]

export interface HealthInventoryDeps {
  ping?: typeof pingProvider
}

export async function runHealthInventory(
  agentName: string,
  currentProvider: AgentProvider,
  deps: HealthInventoryDeps = {},
): Promise<HealthInventoryResult> {
  const ping = deps.ping ?? pingProvider
  const { secrets } = loadAgentSecrets(agentName)
  const providers = PINGABLE_PROVIDERS.filter((p) => p !== currentProvider)

  const results = await Promise.all(
    providers.map(async (provider) => {
      const config = secrets.providers[provider as keyof typeof secrets.providers]
      const result = await ping(provider, config as ProviderConfig)
      return [provider, result] as const
    }),
  )

  const inventory: HealthInventoryResult = {}
  for (const [provider, result] of results) {
    inventory[provider] = result
  }
  return inventory
}
