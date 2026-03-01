import * as fs from "fs"
import * as path from "path"

export interface AgentConfig {
  name: string
  configPath: string
  phrases?: {
    thinking?: string[]
    tool?: string[]
    followup?: string[]
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
  if (_cachedAgentName) return _cachedAgentName

  const idx = process.argv.indexOf("--agent")
  if (idx === -1 || idx + 1 >= process.argv.length) {
    throw new Error(
      "Missing required --agent <name> argument. Usage: node cli-entry.js --agent ouroboros"
    )
  }

  _cachedAgentName = process.argv[idx + 1]
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
  if (_cachedAgentConfig) return _cachedAgentConfig

  const agentRoot = getAgentRoot()
  const configFile = path.join(agentRoot, "agent.json")

  let raw: string
  try {
    raw = fs.readFileSync(configFile, "utf-8")
  } catch {
    throw new Error(
      `Cannot read agent.json at ${configFile}. Does the agent directory exist?`
    )
  }

  try {
    _cachedAgentConfig = JSON.parse(raw) as AgentConfig
  } catch {
    throw new Error(
      `Invalid JSON in agent.json at ${configFile}. Check syntax.`
    )
  }

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
