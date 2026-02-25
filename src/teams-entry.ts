// Thin entrypoint for `npm run teams` / `node dist/teams-entry.js`.
// Separated from teams.ts so the Teams adapter is pure library code with clean
// 100% test coverage — entrypoints can't be covered by vitest since
// require.main !== module in the test runner.
// All config now comes from ~/.agentconfigs/ouroboros/config.json (with env var overrides).
import { startTeamsApp } from "./teams"
startTeamsApp()
