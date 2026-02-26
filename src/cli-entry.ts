// Thin entrypoint for `npm run dev` / `node dist/cli-entry.js`.
// Separated from agent.ts so the CLI adapter is pure library code with clean
// 100% test coverage — entrypoints can't be covered by vitest since
// require.main !== module in the test runner.
import { main } from "./channels/cli"
main()
