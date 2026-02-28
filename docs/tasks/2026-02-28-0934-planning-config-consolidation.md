# Planning: Remove Redundant Env Var Fallback Paths from Config

**Status**: NEEDS_REVIEW
**Created**: 2026-02-28 09:34

## Goal
Every config getter in config.ts reads config.json then checks process.env.* as a fallback override. Three more env var reads live in teams.ts, one in tools-base.ts, and two in prompt.ts. config.json already has all real values populated, so the env var paths never trigger in practice -- but they are functional code that would execute if someone set env vars. Having two ways to configure the same thing creates confusion and makes it unclear which source wins. Remove the env var fallback paths so config.json is the ONLY way to configure the system. Also delete the .env file, which duplicates Teams credentials already in config.json.

## Scope

### In Scope
- Remove all process.env.* fallback override lines from the 6 existing config getters in config.ts (redundant -- config.json already has all values, and having two config paths creates confusion)
- Add TeamsChannelConfig and IntegrationsConfig interfaces + getters to config.ts (for settings that currently only exist as env vars in teams.ts and tools-base.ts)
- Add setTestConfig() helper to config.ts for test-friendly config injection (replaces tests that manipulated process.env)
- Fix prompt.ts providerSection() to use config getters instead of process.env
- Fix teams.ts to use getTeamsChannelConfig() instead of env vars (OUROBOROS_SKIP_CONFIRMATION, DISABLE_STREAMING, PORT)
- Fix tools-base.ts web_search to use getIntegrationsConfig() instead of process.env.PERPLEXITY_API_KEY
- Fix core.ts error message to remove "or env vars"
- Migrate all test files from process.env.* manipulation to setTestConfig() calls
- Delete .env file (duplicates Teams credentials already in config.json)
- Update teams-entry.ts comment that references "env var overrides"
- Keep process.argv.includes("--disable-streaming") in teams.ts (CLI flag, not env var)

### Out of Scope
- OUROBOROS_CONFIG_PATH env var (meta-config, intentionally kept)
- process.argv flags (not env vars)
- Changing config.json file format for existing sections
- Any runtime behavior changes beyond config source

## Completion Criteria
- [ ] All 6 existing getters stripped of process.env.* overrides (one-liner shallow copies)
- [ ] New interfaces (TeamsChannelConfig, IntegrationsConfig) exported from config.ts
- [ ] New getters (getTeamsChannelConfig, getIntegrationsConfig) exported from config.ts
- [ ] setTestConfig() exported from config.ts
- [ ] prompt.ts providerSection() uses getProvider()/getAzureConfig() instead of process.env
- [ ] teams.ts uses getTeamsChannelConfig() for skipConfirmation, disableStreaming, port
- [ ] tools-base.ts uses getIntegrationsConfig().perplexityApiKey
- [ ] core.ts error message says "set credentials in config.json" (no "or env vars")
- [ ] config.test.ts: "env vars override" tests removed, new getter/setTestConfig tests added
- [ ] All other test files migrated from process.env.* to setTestConfig()
- [ ] .env file deleted
- [ ] teams-entry.ts comment updated
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings
- [ ] grep -r 'process\.env\.' src/ --include='*.ts' | grep -v '__tests__' | grep -v 'OUROBOROS_CONFIG_PATH' | grep -v 'process\.argv' returns nothing

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- (none)

## Decisions Made
- This is removing a redundant code path, not a migration. config.json already has all real values. The env var overrides are functional fallbacks that would fire if set, but having two ways to configure the same thing creates confusion. We want exactly one path: config.json.
- The .env file is redundant -- it duplicates Teams credentials (CLIENT_ID, CLIENT_SECRET, TENANT_ID) already present in config.json. Delete it.
- OUROBOROS_CONFIG_PATH is the only env var kept (meta-config pointing to where config.json lives)
- TeamsChannelConfig defaults: { skipConfirmation: false, disableStreaming: false, port: 3978 }
- IntegrationsConfig defaults: { perplexityApiKey: "" }
- setTestConfig(partial) sets _cachedConfig directly via deepMerge, companion to resetConfigCache()
- process.argv.includes("--disable-streaming") stays in teams.ts (CLI flag, not env var)
- Test migration pattern: replace process.env.X = "val" with setTestConfig({ section: { key: "val" } })

## Context / References
- config.json already populated: providers.azure.* (all SET), providers.minimax.* (all SET), teams.* (all SET), context.* (all SET)
- .env file only contains CLIENT_ID, CLIENT_SECRET, TENANT_ID -- all duplicated in config.json teams section
- teams-entry.ts comment on line 5 says "with env var overrides" -- needs update
- Existing plan: ~/.claude/plans/jazzy-pondering-salamander.md
- src/config.ts: 6 getter functions with redundant env var fallback overrides (lines 128-193)
- src/mind/prompt.ts: providerSection() reads process.env.AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT (lines 80-83)
- src/channels/teams.ts: reads OUROBOROS_SKIP_CONFIRMATION (line 259), DISABLE_STREAMING (line 288), PORT (line 393)
- src/engine/tools-base.ts: reads PERPLEXITY_API_KEY (line 222)
- src/engine/core.ts: error message at line 46
- src/__tests__/config.test.ts: 570 lines, has "env vars override" tests to remove
- src/__tests__/engine/core.test.ts: 4507 lines, ~120 process.env references to migrate
- src/__tests__/engine/streaming.test.ts: 4 blocks of MINIMAX env var setup
- src/__tests__/mind/prompt.test.ts: ~30 process.env references
- src/__tests__/channels/teams.test.ts: 2739 lines, ~50 process.env references
- src/__tests__/engine/tools.test.ts: ~15 PERPLEXITY_API_KEY references

## Notes
New config.json structure additions:
```typescript
interface TeamsChannelConfig {
  skipConfirmation: boolean  // was OUROBOROS_SKIP_CONFIRMATION
  disableStreaming: boolean  // was DISABLE_STREAMING
  port: number               // was PORT
}

interface IntegrationsConfig {
  perplexityApiKey: string   // was PERPLEXITY_API_KEY
}
```

Test migration pattern:
```typescript
// BEFORE
process.env.MINIMAX_API_KEY = "test-key"
process.env.MINIMAX_MODEL = "test-model"

// AFTER
const { setTestConfig, resetConfigCache } = await import("../../config")
resetConfigCache()
setTestConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
```

## Progress Log
- 2026-02-28 09:34 Created
- 2026-02-28 10:05 Reframed as removing redundant fallback paths, not migration. Added .env deletion, updated context with config.json reality.
- 2026-02-28 10:26 Fixed framing: env var overrides are functional redundant fallbacks, not dead code. Consistent language throughout.
