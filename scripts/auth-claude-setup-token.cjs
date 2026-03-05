#!/usr/bin/env node

const readline = require("readline")
const { spawnSync } = require("child_process")
const { loadAgentSecrets, maskSecret, setNestedValue, writeSecrets } = require("./auth-common.cjs")

const ANTHROPIC_SETUP_TOKEN_PREFIX = "sk-ant-oat01-"

function parseArgs(argv) {
  let agent = null
  let token = null
  let skipSetup = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") return { help: true, agent: null, token: null, skipSetup: false }
    if (arg === "--agent") {
      const value = argv[i + 1]
      if (!value) throw new Error("Missing value for --agent")
      agent = value
      i += 1
      continue
    }
    if (arg === "--token") {
      const value = argv[i + 1]
      if (!value) throw new Error("Missing value for --token")
      token = value
      i += 1
      continue
    }
    if (arg === "--skip-setup") {
      skipSetup = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { help: false, agent, token, skipSetup }
}

function printHelp() {
  console.log("Usage: node scripts/auth-claude-setup-token.cjs --agent <name> [--token <setup-token>] [--skip-setup]")
  console.log("")
  console.log("Runs `claude setup-token` and writes providers.anthropic.setupToken to secrets.json.")
}

function runClaudeSetupToken() {
  const result = spawnSync("claude", ["setup-token"], { stdio: "inherit" })
  if (result.error) {
    throw new Error(`Failed to run 'claude setup-token': ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`'claude setup-token' exited with status ${result.status}.`)
  }
}

function promptForToken() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    rl.question("Paste the setup token from `claude setup-token`: ", (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function validateToken(token) {
  const trimmed = token.trim()
  if (!trimmed) {
    throw new Error("No setup token was provided.")
  }
  if (!trimmed.startsWith(ANTHROPIC_SETUP_TOKEN_PREFIX)) {
    throw new Error(`Invalid setup token format. Expected prefix ${ANTHROPIC_SETUP_TOKEN_PREFIX}`)
  }
  return trimmed
}

async function main() {
  const { help, agent, token, skipSetup } = parseArgs(process.argv.slice(2))
  if (help) {
    printHelp()
    return
  }
  if (!agent) {
    throw new Error("Missing required --agent <name> argument.")
  }

  if (!skipSetup) {
    console.log("Running `claude setup-token`...")
    runClaudeSetupToken()
  }

  const providedToken = token ?? (await promptForToken())
  const setupToken = validateToken(providedToken)

  const { secretsPath, secrets } = loadAgentSecrets(agent)
  setNestedValue(secrets, ["providers", "anthropic", "setupToken"], setupToken)
  writeSecrets(secretsPath, secrets)

  console.log(`Updated ${secretsPath}`)
  console.log(`providers.anthropic.setupToken = ${maskSecret(setupToken)}`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
