import * as fs from "fs"
import * as path from "path"
import * as os from "os"

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
    skipConfirmation: false,
    disableStreaming: false,
    port: 3978,
  },
  integrations: {
    perplexityApiKey: "",
  },
}

let _cachedConfig: OuroborosConfig | null = null

function defaultConfigPath(): string {
  return path.join(os.homedir(), ".agentconfigs", "ouroboros", "config.json")
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
  if (_cachedConfig) return _cachedConfig

  const configPath = process.env.OUROBOROS_CONFIG_PATH || defaultConfigPath()

  let fileData: Record<string, unknown> = {}
  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    fileData = JSON.parse(raw) as Record<string, unknown>
  } catch {
    // ENOENT or parse error -- use defaults
  }

  _cachedConfig = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, fileData) as unknown as OuroborosConfig
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
  const az = { ...config.providers.azure }

  if (process.env.AZURE_OPENAI_API_KEY) az.apiKey = process.env.AZURE_OPENAI_API_KEY
  if (process.env.AZURE_OPENAI_ENDPOINT) az.endpoint = process.env.AZURE_OPENAI_ENDPOINT
  if (process.env.AZURE_OPENAI_DEPLOYMENT) az.deployment = process.env.AZURE_OPENAI_DEPLOYMENT
  if (process.env.AZURE_OPENAI_MODEL_NAME) az.modelName = process.env.AZURE_OPENAI_MODEL_NAME
  if (process.env.AZURE_OPENAI_API_VERSION) az.apiVersion = process.env.AZURE_OPENAI_API_VERSION

  return az
}

export function getMinimaxConfig(): MinimaxProviderConfig {
  const config = loadConfig()
  const mm = { ...config.providers.minimax }

  if (process.env.MINIMAX_API_KEY) mm.apiKey = process.env.MINIMAX_API_KEY
  if (process.env.MINIMAX_MODEL) mm.model = process.env.MINIMAX_MODEL

  return mm
}

export function getTeamsConfig(): TeamsConfig {
  const config = loadConfig()
  const t = { ...config.teams }

  if (process.env.CLIENT_ID) t.clientId = process.env.CLIENT_ID
  if (process.env.CLIENT_SECRET) t.clientSecret = process.env.CLIENT_SECRET
  if (process.env.TENANT_ID) t.tenantId = process.env.TENANT_ID

  return t
}

export function getContextConfig(): ContextConfig {
  const config = loadConfig()
  const ctx = { ...config.context }

  if (process.env.OUROBOROS_MAX_TOKENS) ctx.maxTokens = parseInt(process.env.OUROBOROS_MAX_TOKENS, 10)
  if (process.env.OUROBOROS_CONTEXT_MARGIN) ctx.contextMargin = parseInt(process.env.OUROBOROS_CONTEXT_MARGIN, 10)
  if (process.env.OUROBOROS_MAX_TOOL_OUTPUT) ctx.maxToolOutputChars = parseInt(process.env.OUROBOROS_MAX_TOOL_OUTPUT, 10)

  return ctx
}

export function getOAuthConfig(): OAuthConfig {
  const config = loadConfig()
  const o = { ...config.oauth }

  if (process.env.OAUTH_GRAPH_CONNECTION) o.graphConnectionName = process.env.OAUTH_GRAPH_CONNECTION
  if (process.env.OAUTH_ADO_CONNECTION) o.adoConnectionName = process.env.OAUTH_ADO_CONNECTION

  return o
}

export function getAdoConfig(): AdoConfig {
  const config = loadConfig()
  const a = { organizations: [...config.ado.organizations] }

  if (process.env.ADO_ORGANIZATIONS) {
    const raw = process.env.ADO_ORGANIZATIONS
    a.organizations = raw === "" ? [] : raw.split(",").map((s) => s.trim())
  }

  return a
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
  return path.join(os.homedir(), ".agentconfigs", "ouroboros", "sessions")
}

function sanitizeKey(key: string): string {
  return key.replace(/[/:]/g, "_")
}

export function sessionPath(channel: string, key: string): string {
  return path.join(getSessionDir(), channel, sanitizeKey(key) + ".json")
}
