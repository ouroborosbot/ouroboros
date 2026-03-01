// Thin entrypoint for `npm run teams` / `node dist/teams-entry.js --agent <name>`.
// Separated from teams.ts so the Teams adapter is pure library code with clean
// 100% test coverage -- entrypoints can't be covered by vitest since
// require.main !== module in the test runner.
// All config comes from the config.json path specified in agent.json.

// Fail fast if --agent is missing (before any src/ code tries getAgentName())
if (!process.argv.includes("--agent")) {
  console.error("Missing required --agent <name> argument.\nUsage: node dist/teams-entry.js --agent ouroboros")
  process.exit(1)
}

import { startTeamsApp } from "./channels/teams"
startTeamsApp()
