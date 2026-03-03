import * as fs from "fs"
import * as path from "path"
import { emitNervesEvent } from "./nerves/runtime"

export interface AgentConfig {
  name: string
  configPath: string
  phrases: {
    thinking: string[]
    tool: string[]
    followup: string[]
  }
}

let _cachedAgentName: string | null = null
let _cachedAgentConfig: AgentConfig | null = null

/**
 * Parse `--agent <name>` from process.argv.
 * Caches the result after first parse.
 * Throws if --agent is missing or has no value.
 */
export function getAgentName(): string {
  if (_cachedAgentName) {
    emitNervesEvent({
      event: "identity.resolve",
      component: "config/identity",
      message: "resolved agent name from cache",
      meta: { source: "cache" },
    })
    return _cachedAgentName
  }

  const idx = process.argv.indexOf("--agent")
  if (idx === -1 || idx + 1 >= process.argv.length) {
    throw new Error(
      "Missing required --agent <name> argument. Usage: node cli-entry.js --agent ouroboros"
    )
  }

  _cachedAgentName = process.argv[idx + 1]
  emitNervesEvent({
    event: "identity.resolve",
    component: "config/identity",
    message: "resolved agent name from argv",
    meta: { source: "argv" },
  })
  return _cachedAgentName
}

/**
 * Resolve repo root from __dirname.
 * In dev (tsx): __dirname is `<repo>/src`, so repo root is one level up.
 * In compiled (node dist/): __dirname is `<repo>/dist`, so repo root is one level up.
 */
export function getRepoRoot(): string {
  return path.resolve(__dirname, "..")
}

/**
 * Returns the agent-specific directory: `<repoRoot>/<agentName>/`
 */
export function getAgentRoot(): string {
  return path.join(getRepoRoot(), getAgentName())
}

/**
 * Load and parse `<agentRoot>/agent.json`.
 * Caches the result after first load.
 * Throws descriptive error if file is missing or contains invalid JSON.
 */
export function loadAgentConfig(): AgentConfig {
  if (_cachedAgentConfig) {
    emitNervesEvent({
      event: "identity.resolve",
      component: "config/identity",
      message: "loaded agent config from cache",
      meta: { source: "cache" },
    })
    return _cachedAgentConfig
  }

  const agentRoot = getAgentRoot()
  const configFile = path.join(agentRoot, "agent.json")

  let raw: string
  try {
    raw = fs.readFileSync(configFile, "utf-8")
  } catch (error) {
    emitNervesEvent({
      level: "error",
      event: "config_identity.error",
      component: "config/identity",
      message: "failed reading agent.json",
      meta: {
        path: configFile,
        reason: error instanceof Error ? error.message : String(error),
      },
    })
    throw new Error(
      `Cannot read agent.json at ${configFile}. Does the agent directory exist?`
    )
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    emitNervesEvent({
      level: "error",
      event: "config_identity.error",
      component: "config/identity",
      message: "invalid agent.json syntax",
      meta: {
        path: configFile,
        reason: error instanceof Error ? error.message : String(error),
      },
    })
    throw new Error(
      `Invalid JSON in agent.json at ${configFile}. Check syntax.`
    )
  }

  const PLACEHOLDER_PHRASES = {
    thinking: ["working"],
    tool: ["running tool"],
    followup: ["processing"],
  }

  const existingPhrases = parsed.phrases as Partial<AgentConfig["phrases"]> | undefined
  const needsFill = !existingPhrases ||
    !existingPhrases.thinking ||
    !existingPhrases.tool ||
    !existingPhrases.followup

  if (needsFill) {
    const filled = {
      thinking: existingPhrases?.thinking ?? PLACEHOLDER_PHRASES.thinking,
      tool: existingPhrases?.tool ?? PLACEHOLDER_PHRASES.tool,
      followup: existingPhrases?.followup ?? PLACEHOLDER_PHRASES.followup,
    }
    parsed.phrases = filled
    console.warn("agent.json is missing phrases, added placeholders")
    emitNervesEvent({
      level: "warn",
      event: "config_identity.error",
      component: "config/identity",
      message: "agent config missing phrase pools; placeholders applied",
      meta: { path: configFile },
    })
    fs.writeFileSync(configFile, JSON.stringify(parsed, null, 2) + "\n", "utf-8")
  }

  _cachedAgentConfig = parsed as unknown as AgentConfig
  emitNervesEvent({
    event: "identity.resolve",
    component: "config/identity",
    message: "loaded agent config from disk",
    meta: { source: "disk" },
  })
  return _cachedAgentConfig
}

/**
 * Clear all cached identity state.
 * Used in tests and when switching agent context.
 */
export function resetIdentity(): void {
  _cachedAgentName = null
  _cachedAgentConfig = null
}
