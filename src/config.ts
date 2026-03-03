import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { loadAgentConfig, getAgentName } from "./identity"
import { emitObservabilityEvent } from "./observability/runtime"

export interface AzureProviderConfig {
  apiKey: string
  endpoint: string
  deployment: string
  modelName: string
  apiVersion: string
}

export interface MinimaxProviderConfig {
  apiKey: string
  model: string
}

export interface TeamsConfig {
  clientId: string
  clientSecret: string
  tenantId: string
}

export interface OAuthConfig {
  graphConnectionName: string
  adoConnectionName: string
}

export interface AdoConfig {
  organizations: string[]
}

export interface ContextConfig {
  maxTokens: number
  contextMargin: number
  maxToolOutputChars: number
}

export interface TeamsChannelConfig {
  skipConfirmation: boolean
  disableStreaming: boolean
  port: number
}

export interface IntegrationsConfig {
  perplexityApiKey: string
}

export interface OuroborosConfig {
  providers: {
    azure: AzureProviderConfig
    minimax: MinimaxProviderConfig
  }
  teams: TeamsConfig
  oauth: OAuthConfig
  ado: AdoConfig
  context: ContextConfig
  teamsChannel: TeamsChannelConfig
  integrations: IntegrationsConfig
}

const DEFAULT_CONFIG: OuroborosConfig = {
  providers: {
    azure: {
      apiKey: "",
      endpoint: "",
      deployment: "",
      modelName: "",
      apiVersion: "2025-04-01-preview",
    },
    minimax: {
      apiKey: "",
      model: "",
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
  },
  ado: {
    organizations: [],
  },
  context: {
    maxTokens: 80000,
    contextMargin: 20,
    maxToolOutputChars: 20000,
  },
  teamsChannel: {
    skipConfirmation: true,
    disableStreaming: false,
    port: 3978,
  },
  integrations: {
    perplexityApiKey: "",
  },
}

let _cachedConfig: OuroborosConfig | null = null

function resolveConfigPath(): string {
  const raw = loadAgentConfig().configPath
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
    emitObservabilityEvent({
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
    emitObservabilityEvent({
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

  _cachedConfig = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, fileData) as unknown as OuroborosConfig
  emitObservabilityEvent({
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
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export function setTestConfig(partial: DeepPartial<OuroborosConfig>): void {
  loadConfig() // ensure _cachedConfig exists
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

export function getTeamsConfig(): TeamsConfig {
  const config = loadConfig()
  return { ...config.teams }
}

export function getContextConfig(): ContextConfig {
  const config = loadConfig()
  return { ...config.context }
}

export function getOAuthConfig(): OAuthConfig {
  const config = loadConfig()
  return { ...config.oauth }
}

export function getAdoConfig(): AdoConfig {
  const config = loadConfig()
  return { organizations: [...config.ado.organizations] }
}

export function getTeamsChannelConfig(): TeamsChannelConfig {
  const config = loadConfig()
  return { ...config.teamsChannel }
}

export function getIntegrationsConfig(): IntegrationsConfig {
  const config = loadConfig()
  return { ...config.integrations }
}

export function getSessionDir(): string {
  return path.join(os.homedir(), ".agentconfigs", getAgentName(), "sessions")
}

export function getLogsDir(): string {
  return path.join(os.homedir(), ".agentconfigs", getAgentName(), "logs")
}

function sanitizeKey(key: string): string {
  return key.replace(/[/:]/g, "_")
}

export function sessionPath(channel: string, key: string): string {
  return path.join(getSessionDir(), channel, sanitizeKey(key) + ".json")
}

export function logPath(channel: string, key: string): string {
  return path.join(getLogsDir(), channel, sanitizeKey(key) + ".ndjson")
}
