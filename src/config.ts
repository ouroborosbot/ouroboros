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

export interface ContextConfig {
  maxTokens: number
  contextMargin: number
}

export interface OuroborosConfig {
  providers: {
    azure: AzureProviderConfig
    minimax: MinimaxProviderConfig
  }
  teams: TeamsConfig
  context: ContextConfig
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
  context: {
    maxTokens: 80000,
    contextMargin: 25,
  },
}

let _cachedConfig: OuroborosConfig | null = null

function defaultConfigPath(): string {
  return path.join(os.homedir(), ".agentconfigs", "ouroboros", "config.json")
}

function deepMerge(defaults: any, partial: any): any {
  const result: any = { ...defaults }
  for (const key of Object.keys(partial)) {
    if (
      partial[key] !== null &&
      typeof partial[key] === "object" &&
      !Array.isArray(partial[key]) &&
      typeof defaults[key] === "object" &&
      defaults[key] !== null
    ) {
      result[key] = deepMerge(defaults[key], partial[key])
    } else {
      result[key] = partial[key]
    }
  }
  return result
}

export function loadConfig(): OuroborosConfig {
  if (_cachedConfig) return _cachedConfig

  const configPath = process.env.OUROBOROS_CONFIG_PATH || defaultConfigPath()

  let fileData: any = {}
  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    fileData = JSON.parse(raw)
  } catch {
    // ENOENT or parse error -- use defaults
  }

  _cachedConfig = deepMerge(DEFAULT_CONFIG, fileData) as OuroborosConfig
  return _cachedConfig
}

export function resetConfigCache(): void {
  _cachedConfig = null
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

  return ctx
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
