# Doing: Remove Redundant Env Var Fallback Paths from Config

**Status**: drafting
**Execution Mode**: direct
**Created**: (pending commit)
**Planning**: ./tasks/2026-02-28-0934-planning-config-consolidation.md
**Artifacts**: ./doing-config-consolidation/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Every config getter in config.ts reads config.json then checks process.env.* as a fallback override. config.json already has all real values populated, so the env var paths never trigger in practice -- but they are functional code that would execute if someone set env vars. Having two ways to configure the same thing creates confusion. Remove the env var fallback paths so config.json is the ONLY way to configure the system.

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

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

### ⬜ Unit 1a: config.ts new interfaces and getters -- Tests
**What**: Write failing tests for TeamsChannelConfig, IntegrationsConfig interfaces and their getters (getTeamsChannelConfig, getIntegrationsConfig). Test that getters return correct values from config.json, including defaults when sections are missing.
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: New tests exist and FAIL (red) because getTeamsChannelConfig/getIntegrationsConfig do not exist yet.

### ⬜ Unit 1b: config.ts new interfaces and getters -- Implementation
**What**: Add TeamsChannelConfig and IntegrationsConfig interfaces, add `teamsChannel` and `integrations` sections to OuroborosConfig and DEFAULT_CONFIG, add getTeamsChannelConfig() and getIntegrationsConfig() getter functions.
**Files**: `src/config.ts`
**Acceptance**: Unit 1a tests PASS (green). New interfaces and getters exported.

### ⬜ Unit 1c: config.ts new interfaces and getters -- Coverage
**What**: Verify 100% coverage on new code. Add edge case tests if needed (missing sections, partial config).
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: 100% coverage on new interfaces/getters, all tests green.

### ⬜ Unit 2a: setTestConfig() -- Tests
**What**: Write failing tests for setTestConfig(partial). Test that it deep-merges partial config into _cachedConfig, works with resetConfigCache(), and correctly overrides specific fields.
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: New tests exist and FAIL (red) because setTestConfig does not exist yet.

### ⬜ Unit 2b: setTestConfig() -- Implementation
**What**: Add setTestConfig(partial: DeepPartial<OuroborosConfig>) that loads config (to ensure _cachedConfig exists), then deep-merges the partial into it. Export the function.
**Files**: `src/config.ts`
**Acceptance**: Unit 2a tests PASS (green). setTestConfig exported.

### ⬜ Unit 2c: setTestConfig() -- Coverage
**What**: Verify 100% coverage on setTestConfig. Add edge case tests if needed (empty partial, nested partial, overwrite then reset).
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: 100% coverage on setTestConfig, all tests green.

### ⬜ Unit 3a: Strip env var fallbacks from 6 getters -- Tests
**What**: Remove the "env vars override config.json values" tests from config.test.ts for all 6 getters (getAzureConfig, getMinimaxConfig, getTeamsConfig, getContextConfig, getOAuthConfig, getAdoConfig). Also remove the "parses ADO_ORGANIZATIONS env var" and "handles empty ADO_ORGANIZATIONS env var" tests. Verify existing non-env-var tests still reference the right behavior (config.json values returned directly).
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: All "env vars override" tests removed. Remaining config tests still pass.

### ⬜ Unit 3b: Strip env var fallbacks from 6 getters -- Implementation
**What**: Remove all process.env.* override lines from getAzureConfig(), getMinimaxConfig(), getTeamsConfig(), getContextConfig(), getOAuthConfig(), getAdoConfig(). Each getter becomes a one-liner returning a shallow copy (or array copy for AdoConfig).
**Files**: `src/config.ts`
**Acceptance**: All config.test.ts tests pass. No process.env references in getters (only OUROBOROS_CONFIG_PATH in loadConfig remains).

### ⬜ Unit 3c: Strip env var fallbacks from 6 getters -- Coverage
**What**: Verify 100% coverage on simplified getters. The getters are now trivial one-liners so coverage should be automatic from existing tests.
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: 100% coverage on all 6 getters, all tests green.

### ⬜ Unit 4a: prompt.ts providerSection -- Tests
**What**: Update prompt.test.ts tests for providerSection() to use setTestConfig() instead of process.env manipulation. Tests should verify that providerSection reads from config getters (getProvider/getAzureConfig) rather than env vars.
**Files**: `src/__tests__/mind/prompt.test.ts`
**Acceptance**: All prompt tests that previously set process.env.AZURE_OPENAI_API_KEY or process.env.AZURE_OPENAI_DEPLOYMENT now use setTestConfig(). Tests FAIL because prompt.ts still reads process.env.

### ⬜ Unit 4b: prompt.ts providerSection -- Implementation
**What**: Rewrite providerSection() in prompt.ts to use getProvider() and getAzureConfig().deployment instead of process.env.AZURE_OPENAI_API_KEY and process.env.AZURE_OPENAI_DEPLOYMENT. Import getProvider and getAzureConfig from config.ts (or from core.ts where getProvider lives).
**Files**: `src/mind/prompt.ts`
**Acceptance**: All prompt.test.ts tests pass. No process.env references in prompt.ts.

### ⬜ Unit 4c: prompt.ts providerSection -- Coverage
**What**: Verify 100% coverage on providerSection. Both azure and minimax paths must be tested.
**Files**: `src/__tests__/mind/prompt.test.ts`
**Acceptance**: 100% coverage on providerSection, all tests green.

### ⬜ Unit 5a: teams.ts env var removal -- Tests
**What**: Update teams.test.ts tests that set OUROBOROS_SKIP_CONFIRMATION, DISABLE_STREAMING, or PORT to use setTestConfig() with the new teamsChannel config section instead. Tests should verify teams.ts reads from getTeamsChannelConfig().
**Files**: `src/__tests__/channels/teams.test.ts`
**Acceptance**: All teams tests that previously set these 3 env vars now use setTestConfig(). Tests FAIL because teams.ts still reads process.env.

### ⬜ Unit 5b: teams.ts env var removal -- Implementation
**What**: Import getTeamsChannelConfig from config.ts. Replace process.env.OUROBOROS_SKIP_CONFIRMATION check (line 259) with getTeamsChannelConfig().skipConfirmation. Replace process.env.DISABLE_STREAMING check (line 288) with getTeamsChannelConfig().disableStreaming. Replace process.env.PORT (line 393) with getTeamsChannelConfig().port. Keep process.argv.includes("--disable-streaming") as-is.
**Files**: `src/channels/teams.ts`
**Acceptance**: All teams.test.ts tests pass. No process.env references in teams.ts (except process.argv which is out of scope).

### ⬜ Unit 5c: teams.ts env var removal -- Coverage
**What**: Verify 100% coverage on modified teams.ts code paths. Both skipConfirmation true/false, disableStreaming true/false, and custom port must be covered.
**Files**: `src/__tests__/channels/teams.test.ts`
**Acceptance**: 100% coverage on modified lines, all tests green.

### ⬜ Unit 6a: tools-base.ts env var removal -- Tests
**What**: Update tools.test.ts tests that set PERPLEXITY_API_KEY to use setTestConfig() with the new integrations config section. Tests should verify web_search reads from getIntegrationsConfig().perplexityApiKey.
**Files**: `src/__tests__/engine/tools.test.ts`
**Acceptance**: All tools tests that previously set PERPLEXITY_API_KEY now use setTestConfig(). Tests FAIL because tools-base.ts still reads process.env.

### ⬜ Unit 6b: tools-base.ts env var removal -- Implementation
**What**: Import getIntegrationsConfig from config.ts. Replace process.env.PERPLEXITY_API_KEY (line 222) with getIntegrationsConfig().perplexityApiKey. Update the error message on line 223 if it references env vars.
**Files**: `src/engine/tools-base.ts`
**Acceptance**: All tools.test.ts tests pass. No process.env references in tools-base.ts.

### ⬜ Unit 6c: tools-base.ts env var removal -- Coverage
**What**: Verify 100% coverage on web_search function. Both key-present and key-missing paths must be tested.
**Files**: `src/__tests__/engine/tools.test.ts`
**Acceptance**: 100% coverage on web_search, all tests green.

### ⬜ Unit 7: core.ts error message update
**What**: Update the error message at line 46 of core.ts from "set azure or minimax credentials in config.json or env vars." to "set azure or minimax credentials in config.json." Remove "or env vars".
**Files**: `src/engine/core.ts`, `src/__tests__/engine/core.test.ts`
**Acceptance**: Error message updated. Any tests asserting on this message updated to match. All tests pass.

### ⬜ Unit 8: Migrate remaining test files to setTestConfig()
**What**: Migrate all remaining process.env.* manipulation in test files to setTestConfig() calls:
- `src/__tests__/engine/core.test.ts` (~185 process.env references)
- `src/__tests__/engine/streaming.test.ts` (8 process.env references)
- `src/__tests__/mind/prompt.test.ts` (any remaining after Unit 4a)
- `src/__tests__/channels/teams.test.ts` (any remaining after Unit 5a)
- `src/__tests__/engine/tools.test.ts` (any remaining after Unit 6a)
- `src/__tests__/config.test.ts` (any remaining after Unit 3a, except OUROBOROS_CONFIG_PATH tests)
**Files**: All test files listed above.
**Acceptance**: All tests pass. Only OUROBOROS_CONFIG_PATH references remain in test process.env usage.

### ⬜ Unit 9: Cleanup -- delete .env, update comments
**What**: Delete the .env file. Update teams-entry.ts line 5 comment from "with env var overrides" to remove that phrase. Verify no other comments reference env var configuration.
**Files**: `.env`, `src/teams-entry.ts`
**Acceptance**: .env file gone. teams-entry.ts comment updated. All tests still pass.

### ⬜ Unit 10: Final verification
**What**: Run full test suite, check coverage, run the grep verification command from completion criteria.
**Output**: All tests pass, 100% coverage on new code, grep returns nothing.
**Acceptance**:
- `npx vitest run` -- all pass, no warnings
- `npx vitest run --coverage` -- 100% on all files
- `grep -r 'process\.env\.' src/ --include='*.ts' | grep -v '__tests__' | grep -v 'OUROBOROS_CONFIG_PATH' | grep -v 'process\.argv'` -- returns nothing

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./doing-config-consolidation/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
