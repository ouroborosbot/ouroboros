// Thin entrypoint for `npm run teams` / `node dist/teams-entry.js`.
// Separated from teams.ts so the Teams adapter is pure library code with clean
// 100% test coverage — entrypoints can't be covered by vitest since
// require.main !== module in the test runner.
// All config comes from the config.json path specified in agent.json.
import { startTeamsApp } from "./channels/teams"
startTeamsApp()
