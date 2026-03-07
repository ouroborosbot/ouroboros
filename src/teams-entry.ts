// Thin entrypoint for `npm run teams` / `node dist/teams-entry.js --agent <name>`.
// Separated from teams.ts so the Teams adapter is pure library code with clean
// 100% test coverage -- entrypoints can't be covered by vitest since
// require.main !== module in the test runner.
// All config comes from the conventional ~/.agentsecrets/<agent>/secrets.json path.

// Fail fast if --agent is missing (before any src/ code tries getAgentName())
if (!process.argv.includes("--agent")) {
  // eslint-disable-next-line no-console -- pre-boot guard: --agent check before imports
  console.error("Missing required --agent <name> argument.\nUsage: node dist/teams-entry.js --agent ouroboros")
  process.exit(1)
}

import { startTeamsApp } from "./senses/teams"
startTeamsApp()
