#!/usr/bin/env node

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")
const { loadAgentSecrets, maskSecret, setNestedValue, writeSecrets } = require("./auth-common.cjs")

function parseArgs(argv) {
  let agent = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") return { help: true, agent: null }
    if (arg === "--agent") {
      const value = argv[i + 1]
      if (!value) throw new Error("Missing value for --agent")
      agent = value
      i += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return { help: false, agent }
}

function printHelp() {
  console.log("Usage: node scripts/auth-openai-codex.cjs --agent <name>")
  console.log("")
  console.log("Bootstraps OpenAI Codex OAuth and writes providers.openai-codex.oauthAccessToken to secrets.json.")
}

function readCodexAccessToken() {
  const authPath = path.join(os.homedir(), ".codex", "auth.json")
  try {
    const raw = fs.readFileSync(authPath, "utf8")
    const parsed = JSON.parse(raw)
    const token = parsed?.tokens?.access_token
    return typeof token === "string" ? token.trim() : ""
  } catch {
    return ""
  }
}

function runCodexLogin() {
  const login = spawnSync("codex", ["login"], { stdio: "inherit" })
  if (login.error) {
    throw new Error(`Failed to run 'codex login': ${login.error.message}`)
  }
  if (login.status !== 0) {
    throw new Error(`'codex login' exited with status ${login.status}.`)
  }
}

function ensureCodexToken() {
  let token = readCodexAccessToken()
  if (token) return token

  console.log("No Codex OAuth token found. Running `codex login`...")
  runCodexLogin()
  token = readCodexAccessToken()
  if (token) return token
  throw new Error(
    "Codex login completed but no token was found in ~/.codex/auth.json. Re-run `codex login` and try again.",
  )
}

function main() {
  const { help, agent } = parseArgs(process.argv.slice(2))
  if (help) {
    printHelp()
    return
  }
  if (!agent) {
    throw new Error("Missing required --agent <name> argument.")
  }

  const token = ensureCodexToken()
  const { secretsPath, secrets } = loadAgentSecrets(agent)
  setNestedValue(secrets, ["providers", "openai-codex", "oauthAccessToken"], token)
  writeSecrets(secretsPath, secrets)

  console.log(`Updated ${secretsPath}`)
  console.log(`providers.openai-codex.oauthAccessToken = ${maskSecret(token)}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
