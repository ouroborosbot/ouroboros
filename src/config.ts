import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { loadAgentConfig, getAgentName, DEFAULT_AGENT_CONTEXT } from "./identity"
import { emitNervesEvent } from "./nerves/runtime"

export interface AzureProviderConfig {
  modelName: string
  apiKey: string
  endpoint: string
  deployment: string
  apiVersion: string
}

export interface MinimaxProviderConfig {
  model: string
  apiKey: string
}

export interface AnthropicProviderConfig {
  model: string
  setupToken: string
}

export interface OpenAICodexProviderConfig {
  model: string
  oauthAccessToken: string
}

export interface TeamsConfig {
  clientId: string
  clientSecret: string
  tenantId: string
}

export interface OAuthConfig {
  graphConnectionName: string
  adoConnectionName: string
  githubConnectionName: string
}

export interface ContextConfig {
  maxTokens: number
  contextMargin: number
}

export interface TeamsChannelConfig {
  skipConfirmation: boolean
  flushIntervalMs?: number
  port: number
}

export interface IntegrationsConfig {
  perplexityApiKey: string
}

export interface OuroborosConfig {
  providers: {
    azure: AzureProviderConfig
    minimax: MinimaxProviderConfig
    anthropic: AnthropicProviderConfig
    "openai-codex": OpenAICodexProviderConfig
  }
  teams: TeamsConfig
  oauth: OAuthConfig
  context: ContextConfig
  teamsChannel: TeamsChannelConfig
  integrations: IntegrationsConfig
}

const DEFAULT_SECRETS_TEMPLATE: Omit<OuroborosConfig, "context"> = {
  providers: {
    // Keep provider field ordering consistent: model first, then auth credentials,
    // then provider-specific transport fields.
    azure: {
      modelName: "",
      apiKey: "",
      endpoint: "",
      deployment: "",
      apiVersion: "2025-04-01-preview",
    },
    minimax: {
      model: "",
      apiKey: "",
    },
    anthropic: {
      model: "claude-opus-4-6",
      setupToken: "",
    },
    "openai-codex": {
      model: "gpt-5.2",
      oauthAccessToken: "",
    },
  },
  teams: {
    clientId: "",
    clientSecret: "",
    tenantId: "",
  },
  oauth: {
    graphConnectionName: "graph",
    adoConnectionName: "ado",
    githubConnectionName: "",
  },
  teamsChannel: {
    skipConfirmation: true,
    port: 3978,
  },
  integrations: {
    perplexityApiKey: "",
  },
}

function defaultRuntimeConfig(): OuroborosConfig {
  return {
    providers: {
      azure: { ...DEFAULT_SECRETS_TEMPLATE.providers.azure },
      minimax: { ...DEFAULT_SECRETS_TEMPLATE.providers.minimax },
      anthropic: { ...DEFAULT_SECRETS_TEMPLATE.providers.anthropic },
      "openai-codex": { ...DEFAULT_SECRETS_TEMPLATE.providers["openai-codex"] },
    },
    teams: { ...DEFAULT_SECRETS_TEMPLATE.teams },
    oauth: { ...DEFAULT_SECRETS_TEMPLATE.oauth },
    context: { ...DEFAULT_AGENT_CONTEXT },
    teamsChannel: { ...DEFAULT_SECRETS_TEMPLATE.teamsChannel },
    integrations: { ...DEFAULT_SECRETS_TEMPLATE.integrations },
  }
}

let _cachedConfig: OuroborosConfig | null = null
let _testContextOverride: ContextConfig | null = null

function resolveConfigPath(): string {
  const raw = loadAgentConfig().configPath
  if (
    raw.startsWith("~/.agentconfigs/") ||
    raw.includes("/.agentconfigs/")
  ) {
    throw new Error(
      `Legacy configPath '${raw}' is not supported. Use ~/.agentsecrets/<agent>/secrets.json.`,
    )
  }
  if (raw.startsWith("~")) {
    return path.join(os.homedir(), raw.slice(1))
  }
  return raw
}

function deepMerge(defaults: Record<string, unknown>, partial: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults }
  for (const key of Object.keys(partial)) {
    if (
      partial[key] !== null &&
      typeof partial[key] === "object" &&
      !Array.isArray(partial[key]) &&
      typeof defaults[key] === "object" &&
      defaults[key] !== null
    ) {
      result[key] = deepMerge(defaults[key] as Record<string, unknown>, partial[key] as Record<string, unknown>)
    } else {
      result[key] = partial[key]
    }
  }
  return result
}

export function loadConfig(): OuroborosConfig {
  if (_cachedConfig) {
    emitNervesEvent({
      event: "config.load",
      component: "config/identity",
      message: "config loaded from cache",
      meta: { source: "cache" },
    })
    return _cachedConfig
  }

  const configPath = resolveConfigPath()

  // Auto-create config directory if it doesn't exist
  const configDir = path.dirname(configPath)
  fs.mkdirSync(configDir, { recursive: true })

  let fileData: Record<string, unknown> = {}
  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    fileData = JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    const errorCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as NodeJS.ErrnoException).code === "string"
        ? (error as NodeJS.ErrnoException).code
        : undefined

    if (errorCode === "ENOENT") {
      try {
        fs.writeFileSync(configPath, JSON.stringify(DEFAULT_SECRETS_TEMPLATE, null, 2) + "\n", "utf-8")
      } catch (writeError) {
        emitNervesEvent({
          level: "warn",
          event: "config_identity.error",
          component: "config/identity",
          message: "failed writing default secrets config",
          meta: {
            phase: "loadConfig",
            path: configPath,
            reason: writeError instanceof Error ? writeError.message : String(writeError),
          },
        })
      }
    }

    emitNervesEvent({
      level: "warn",
      event: "config_identity.error",
      component: "config/identity",
      message: "config read failed; defaults applied",
      meta: {
        phase: "loadConfig",
        reason: error instanceof Error ? error.message : String(error),
      },
    })
    // ENOENT or parse error -- use defaults
  }

  const sanitizedFileData = { ...fileData }
  if ("context" in sanitizedFileData) {
    delete sanitizedFileData.context
    emitNervesEvent({
      level: "warn",
      event: "config_identity.error",
      component: "config/identity",
      message: "ignored legacy context block in secrets config",
      meta: {
        phase: "loadConfig",
        path: configPath,
      },
    })
  }

  _cachedConfig = deepMerge(
    defaultRuntimeConfig() as unknown as Record<string, unknown>,
    sanitizedFileData,
  ) as unknown as OuroborosConfig
  emitNervesEvent({
    event: "config.load",
    component: "config/identity",
    message: "config loaded from disk",
    meta: {
      source: "disk",
      used_defaults_only: Object.keys(fileData).length === 0,
    },
  })
  return _cachedConfig
}

export function resetConfigCache(): void {
  _cachedConfig = null
  _testContextOverride = null
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export function setTestConfig(partial: DeepPartial<OuroborosConfig>): void {
  loadConfig() // ensure _cachedConfig exists
  const contextPatch = partial.context as Partial<ContextConfig> | undefined
  if (contextPatch) {
    const base = _testContextOverride ?? DEFAULT_AGENT_CONTEXT
    _testContextOverride = deepMerge(
      base as unknown as Record<string, unknown>,
      contextPatch as unknown as Record<string, unknown>,
    ) as unknown as ContextConfig
  }
  _cachedConfig = deepMerge(
    _cachedConfig as unknown as Record<string, unknown>,
    partial as unknown as Record<string, unknown>,
  ) as unknown as OuroborosConfig
}

export function getAzureConfig(): AzureProviderConfig {
  const config = loadConfig()
  return { ...config.providers.azure }
}

export function getMinimaxConfig(): MinimaxProviderConfig {
  const config = loadConfig()
  return { ...config.providers.minimax }
}

export function getAnthropicConfig(): AnthropicProviderConfig {
  const config = loadConfig()
  return { ...config.providers.anthropic }
}

export function getOpenAICodexConfig(): OpenAICodexProviderConfig {
  const config = loadConfig()
  return { ...config.providers["openai-codex"] }
}

export function getTeamsConfig(): TeamsConfig {
  const config = loadConfig()
  return { ...config.teams }
}

export function getContextConfig(): ContextConfig {
  if (_testContextOverride) {
    return { ..._testContextOverride }
  }
  const defaults = DEFAULT_AGENT_CONTEXT
  const agentContext = loadAgentConfig().context
  if (!agentContext || typeof agentContext !== "object") {
    return { ...defaults }
  }
  return {
    maxTokens: typeof agentContext.maxTokens === "number" ? agentContext.maxTokens : defaults.maxTokens,
    contextMargin: typeof agentContext.contextMargin === "number"
      ? agentContext.contextMargin
      : defaults.contextMargin,
  }
}

export function getOAuthConfig(): OAuthConfig {
  const config = loadConfig()
  return { ...config.oauth }
}

export function getTeamsChannelConfig(): TeamsChannelConfig {
  const config = loadConfig()
  const { skipConfirmation, flushIntervalMs, port } = config.teamsChannel
  return { skipConfirmation, flushIntervalMs, port }
}

export function getIntegrationsConfig(): IntegrationsConfig {
  const config = loadConfig()
  return { ...config.integrations }
}

export function getLogsDir(): string {
  return path.join(os.homedir(), ".agentstate", getAgentName(), "logs")
}


function sanitizeKey(key: string): string {
  return key.replace(/[/:]/g, "_")
}

export function sessionPath(friendId: string, channel: string, key: string): string {
  const dir = path.join(os.homedir(), ".agentstate", getAgentName(), "sessions", friendId, channel)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, sanitizeKey(key) + ".json")
}

export function logPath(channel: string, key: string): string {
  return path.join(getLogsDir(), channel, sanitizeKey(key) + ".ndjson")
}
