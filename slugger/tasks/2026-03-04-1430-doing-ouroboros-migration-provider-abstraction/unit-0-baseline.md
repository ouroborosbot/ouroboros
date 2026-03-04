## Git baseline

slugger/provider-abstraction
b33c0e7002d321b4eec4406abf43ccf96fe1ae15
?? slugger/tasks/2026-03-04-1430-doing-ouroboros-migration-provider-abstraction/

## Scripts
{
  "build": "tsc",
  "dev": "tsc && node dist/cli-entry.js --agent ouroboros",
  "dev:slugger": "tsc && node dist/cli-entry.js --agent slugger",
  "test": "vitest run",
  "test:coverage:vitest": "vitest run --coverage",
  "audit:nerves": "npm run build && node dist/nerves/coverage/cli-main.js",
  "test:coverage": "node scripts/run-coverage-gate.cjs",
  "teams": "tsc && node dist/teams-entry.js --agent ouroboros",
  "teams:no-stream": "tsc && node dist/teams-entry.js --agent ouroboros --disable-streaming",
  "manifest:package": "cd ouroboros/manifest && zip -r ../../manifest.zip manifest.json color.png outline.png"
}

## Candidate files
src/__tests__/config.test.ts
src/__tests__/heart/core.test.ts
src/__tests__/identity.test.ts
src/__tests__/mind/prompt.test.ts
src/__tests__/nerves/coverage-run-artifacts.test.ts
src/__tests__/senses/cli.test.ts
src/__tests__/senses/teams.test.ts
src/config.ts
src/heart/core.ts
src/heart/streaming.ts
src/identity.ts
src/mind/prompt.ts
src/nerves/coverage/cli-main.ts
src/nerves/coverage/run-artifacts.ts
src/nerves/runtime.ts
src/senses/cli.ts
src/senses/teams.ts
