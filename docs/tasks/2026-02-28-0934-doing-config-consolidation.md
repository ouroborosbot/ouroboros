# Doing: Remove Redundant Env Var Fallback Paths from Config

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-02-28 10:35
**Planning**: ./2026-02-28-0934-planning-config-consolidation.md
**Artifacts**: ./2026-02-28-0934-doing-config-consolidation/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Every config getter in config.ts reads config.json then checks process.env.* as a fallback override. config.json already has all real values populated, so the env var paths never trigger in practice -- but they are functional code that would execute if someone set env vars. Having two ways to configure the same thing creates confusion. Remove the env var fallback paths so config.json is the ONLY way to configure the system.

## Env Var Reference Manifest
Complete list of every process.env.* in src/ (excluding tests). Every line below must be removed except OUROBOROS_CONFIG_PATH.

```
KEEP  src/config.ts:110  process.env.OUROBOROS_CONFIG_PATH

config.ts getAzureConfig (Unit 3):
  src/config.ts:132  process.env.AZURE_OPENAI_API_KEY
  src/config.ts:133  process.env.AZURE_OPENAI_ENDPOINT
  src/config.ts:134  process.env.AZURE_OPENAI_DEPLOYMENT
  src/config.ts:135  process.env.AZURE_OPENAI_MODEL_NAME
  src/config.ts:136  process.env.AZURE_OPENAI_API_VERSION

config.ts getMinimaxConfig (Unit 3):
  src/config.ts:145  process.env.MINIMAX_API_KEY
  src/config.ts:146  process.env.MINIMAX_MODEL

config.ts getTeamsConfig (Unit 3):
  src/config.ts:155  process.env.CLIENT_ID
  src/config.ts:156  process.env.CLIENT_SECRET
  src/config.ts:157  process.env.TENANT_ID

config.ts getContextConfig (Unit 3):
  src/config.ts:166  process.env.OUROBOROS_MAX_TOKENS
  src/config.ts:167  process.env.OUROBOROS_CONTEXT_MARGIN
  src/config.ts:168  process.env.OUROBOROS_MAX_TOOL_OUTPUT

config.ts getOAuthConfig (Unit 3):
  src/config.ts:177  process.env.OAUTH_GRAPH_CONNECTION
  src/config.ts:178  process.env.OAUTH_ADO_CONNECTION

config.ts getAdoConfig (Unit 3):
  src/config.ts:187  process.env.ADO_ORGANIZATIONS
  src/config.ts:188  process.env.ADO_ORGANIZATIONS

teams.ts (Unit 5):
  src/channels/teams.ts:259  process.env.OUROBOROS_SKIP_CONFIRMATION
  src/channels/teams.ts:288  process.env.DISABLE_STREAMING
  src/channels/teams.ts:393  process.env.PORT

prompt.ts (Unit 4):
  src/mind/prompt.ts:80   process.env.AZURE_OPENAI_API_KEY
  src/mind/prompt.ts:81   process.env.AZURE_OPENAI_DEPLOYMENT

tools-base.ts (Unit 6):
  src/engine/tools-base.ts:222  process.env.PERPLEXITY_API_KEY
```

Total: 23 references to remove, 1 to keep (OUROBOROS_CONFIG_PATH).

## Completion Criteria
- [ ] All 6 existing config.ts getters stripped of process.env.* overrides (one-liner shallow copies)
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
- [ ] .gitignore .env entry removed
- [ ] teams-entry.ts comment updated
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings
- [ ] `grep -r 'process\.env\.' src/ --include='*.ts' | grep -v '__tests__' | grep -v 'OUROBOROS_CONFIG_PATH' | grep -v 'process\.argv'` returns nothing

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

### ✅ Unit 1a: New interfaces and getters -- Tests
**What**: Write failing tests for TeamsChannelConfig, IntegrationsConfig interfaces and their getters (getTeamsChannelConfig, getIntegrationsConfig). Test that getters return correct values from config.json, including defaults when sections are missing.
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: New tests exist and FAIL (red) because getTeamsChannelConfig/getIntegrationsConfig do not exist yet.

### ✅ Unit 1b: New interfaces and getters -- Implementation
**What**: Add to config.ts:
- `TeamsChannelConfig` interface: `{ skipConfirmation: boolean, disableStreaming: boolean, port: number }`
- `IntegrationsConfig` interface: `{ perplexityApiKey: string }`
- Add `teamsChannel: TeamsChannelConfig` and `integrations: IntegrationsConfig` to OuroborosConfig
- Add defaults to DEFAULT_CONFIG: `teamsChannel: { skipConfirmation: false, disableStreaming: false, port: 3978 }`, `integrations: { perplexityApiKey: "" }`
- Add `getTeamsChannelConfig()` and `getIntegrationsConfig()` getter functions returning shallow copies
**Files**: `src/config.ts`
**Acceptance**: Unit 1a tests PASS (green). New interfaces and getters exported.

### ✅ Unit 1c: New interfaces and getters -- Coverage
**What**: Verify 100% coverage on new code. Add edge case tests if needed (missing sections, partial config).
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: 100% coverage on new interfaces/getters, all tests green.

### ✅ Unit 2a: setTestConfig() -- Tests
**What**: Write failing tests for setTestConfig(partial). Test that it deep-merges partial config into _cachedConfig, works with resetConfigCache(), and correctly overrides specific fields while leaving others untouched.
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: New tests exist and FAIL (red) because setTestConfig does not exist yet.

### ✅ Unit 2b: setTestConfig() -- Implementation
**What**: Add setTestConfig(partial: DeepPartial<OuroborosConfig>) that calls loadConfig() (to ensure _cachedConfig exists), then deep-merges the partial into _cachedConfig. Export the function. Also export/define DeepPartial type.
**Files**: `src/config.ts`
**Acceptance**: Unit 2a tests PASS (green). setTestConfig exported.

### ✅ Unit 2c: setTestConfig() -- Coverage
**What**: Verify 100% coverage on setTestConfig. Add edge case tests if needed (empty partial, nested partial, overwrite then reset).
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: 100% coverage on setTestConfig, all tests green.

### ✅ Unit 3a: Strip env var fallbacks from 6 getters -- Tests
**What**: Remove the "env vars override config.json values" test cases from config.test.ts for all 6 getters (getAzureConfig, getMinimaxConfig, getTeamsConfig, getContextConfig, getOAuthConfig, getAdoConfig). Also remove the "parses ADO_ORGANIZATIONS env var" and "handles empty ADO_ORGANIZATIONS env var" tests. Verify existing non-env-var tests still reference the right behavior.
**Env vars covered**: All 18 process.env references in config.ts getters (lines 132-189).
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: All "env vars override" tests removed. Remaining config tests still pass.

### ✅ Unit 3b: Strip env var fallbacks from 6 getters -- Implementation
**What**: Remove all process.env.* override lines from all 6 getters. After this change:
- `getAzureConfig()` returns `{ ...config.providers.azure }` (removes 5 env var lines: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_MODEL_NAME, AZURE_OPENAI_API_VERSION)
- `getMinimaxConfig()` returns `{ ...config.providers.minimax }` (removes 2: MINIMAX_API_KEY, MINIMAX_MODEL)
- `getTeamsConfig()` returns `{ ...config.teams }` (removes 3: CLIENT_ID, CLIENT_SECRET, TENANT_ID)
- `getContextConfig()` returns `{ ...config.context }` (removes 3: OUROBOROS_MAX_TOKENS, OUROBOROS_CONTEXT_MARGIN, OUROBOROS_MAX_TOOL_OUTPUT)
- `getOAuthConfig()` returns `{ ...config.oauth }` (removes 2: OAUTH_GRAPH_CONNECTION, OAUTH_ADO_CONNECTION)
- `getAdoConfig()` returns `{ organizations: [...config.ado.organizations] }` (removes 3 lines covering ADO_ORGANIZATIONS x2)
**Files**: `src/config.ts`
**Acceptance**: All config.test.ts tests pass. Only OUROBOROS_CONFIG_PATH remains in config.ts process.env usage.

### ✅ Unit 3c: Strip env var fallbacks from 6 getters -- Coverage
**What**: Verify 100% coverage on simplified getters. Getters are now trivial one-liners so coverage should be automatic from existing tests.
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: 100% coverage on all 6 getters, all tests green.

### ✅ Unit 4a: prompt.ts providerSection -- Tests
**What**: Update prompt.test.ts tests for providerSection() to use setTestConfig() instead of process.env.AZURE_OPENAI_API_KEY / process.env.AZURE_OPENAI_DEPLOYMENT manipulation. Tests should set azure config via setTestConfig({ providers: { azure: { apiKey: ..., deployment: ... } } }).
**Env vars covered**: process.env.AZURE_OPENAI_API_KEY (line 80), process.env.AZURE_OPENAI_DEPLOYMENT (line 81).
**Files**: `src/__tests__/mind/prompt.test.ts`
**Acceptance**: Tests updated. Tests FAIL because prompt.ts still reads process.env directly.

### ✅ Unit 4b: prompt.ts providerSection -- Implementation
**What**: Rewrite providerSection() to use getProvider() and getAzureConfig().deployment instead of process.env. Two import changes needed:
1. Add `getProvider` to existing import from `../engine/core` (currently imports only `getModel`)
2. Add new import: `import { getAzureConfig } from "../config"` (getAzureConfig is NOT re-exported from core.ts)
Rewritten function: check `getProvider() === "azure"`, then use `getAzureConfig().deployment || "default"`.
**Files**: `src/mind/prompt.ts`
**Acceptance**: All prompt.test.ts tests pass. No process.env references in prompt.ts.

### ⬜ Unit 4c: prompt.ts providerSection -- Coverage
**What**: Verify 100% coverage on providerSection. Both azure and minimax paths must be tested.
**Files**: `src/__tests__/mind/prompt.test.ts`
**Acceptance**: 100% coverage on providerSection, all tests green.

### ⬜ Unit 5a: teams.ts env var removal -- Tests
**What**: Update teams.test.ts tests that set OUROBOROS_SKIP_CONFIRMATION, DISABLE_STREAMING, or PORT to use setTestConfig() with the teamsChannel config section instead.
**Env vars covered**: OUROBOROS_SKIP_CONFIRMATION (line 259), DISABLE_STREAMING (line 288), PORT (line 393).
**Files**: `src/__tests__/channels/teams.test.ts`
**Acceptance**: Tests updated. Tests FAIL because teams.ts still reads process.env.

### ⬜ Unit 5b: teams.ts env var removal -- Implementation
**What**: Add `getTeamsChannelConfig` to existing config import on line 6 or 9 (teams.ts already imports `getOAuthConfig, getAdoConfig, sessionPath, getTeamsConfig` from `../config`). Three replacements:
1. Line 259: `process.env.OUROBOROS_SKIP_CONFIRMATION === "1"` becomes `getTeamsChannelConfig().skipConfirmation`
2. Lines 287-288: `process.argv.includes("--disable-streaming") || process.env.DISABLE_STREAMING === "1"` becomes `process.argv.includes("--disable-streaming") || getTeamsChannelConfig().disableStreaming` (keep process.argv, replace process.env)
3. Line 393: `parseInt(process.env.PORT || "3978", 10)` becomes `getTeamsChannelConfig().port`
Also update comment on line 286: remove "DISABLE_STREAMING=1 npm run teams" env var reference.
**Files**: `src/channels/teams.ts`
**Acceptance**: All teams.test.ts tests pass. No process.env references in teams.ts.

### ⬜ Unit 5c: teams.ts env var removal -- Coverage
**What**: Verify 100% coverage on modified teams.ts code paths. Both skipConfirmation true/false, disableStreaming true/false, and custom port must be covered.
**Files**: `src/__tests__/channels/teams.test.ts`
**Acceptance**: 100% coverage on modified lines, all tests green.

### ⬜ Unit 6a: tools-base.ts env var removal -- Tests
**What**: Update tools.test.ts tests that set PERPLEXITY_API_KEY to use setTestConfig() with the integrations config section instead: `setTestConfig({ integrations: { perplexityApiKey: "..." } })`.
**Env vars covered**: PERPLEXITY_API_KEY (line 222).
**Files**: `src/__tests__/engine/tools.test.ts`
**Acceptance**: Tests updated. Tests FAIL because tools-base.ts still reads process.env.

### ⬜ Unit 6b: tools-base.ts env var removal -- Implementation
**What**: Add new import: `import { getIntegrationsConfig } from "../config"` (tools-base.ts currently has NO config import). Replace `process.env.PERPLEXITY_API_KEY` (line 222) with `getIntegrationsConfig().perplexityApiKey`. Update error message on line 223 from "PERPLEXITY_API_KEY not set" to "perplexityApiKey not configured in config.json".
**Files**: `src/engine/tools-base.ts`
**Acceptance**: All tools.test.ts tests pass. No process.env references in tools-base.ts.

### ⬜ Unit 6c: tools-base.ts env var removal -- Coverage
**What**: Verify 100% coverage on web_search function. Both key-present and key-missing paths must be tested.
**Files**: `src/__tests__/engine/tools.test.ts`
**Acceptance**: 100% coverage on web_search, all tests green.

### ⬜ Unit 7: core.ts error message update
**What**: Update error message at line 46 of core.ts from `"no provider configured. set azure or minimax credentials in config.json or env vars."` to `"no provider configured. set azure or minimax credentials in config.json."` (remove " or env vars"). No tests assert on this message text, so only the source file changes.
**Files**: `src/engine/core.ts`
**Acceptance**: Error message updated. All tests pass.

### ⬜ Unit 8a: Migrate core.test.ts to setTestConfig()
**What**: Migrate all process.env.* manipulation in core.test.ts (185 references) to setTestConfig() calls. This is the largest test file. Replace env var setup/teardown blocks with setTestConfig + resetConfigCache patterns.
**Files**: `src/__tests__/engine/core.test.ts`
**Acceptance**: All core tests pass. No process.env references remain except OUROBOROS_CONFIG_PATH.

### ⬜ Unit 8b: Migrate streaming.test.ts to setTestConfig()
**What**: Migrate all process.env.* manipulation in streaming.test.ts (8 references, 4 blocks of MINIMAX env var setup) to setTestConfig() calls.
**Files**: `src/__tests__/engine/streaming.test.ts`
**Acceptance**: All streaming tests pass. No process.env references remain.

### ⬜ Unit 8c: Migrate remaining prompt.test.ts to setTestConfig()
**What**: Migrate any remaining process.env.* references in prompt.test.ts not already handled in Unit 4a (26 total, some handled in 4a).
**Files**: `src/__tests__/mind/prompt.test.ts`
**Acceptance**: All prompt tests pass. No process.env references remain.

### ⬜ Unit 8d: Migrate remaining teams.test.ts to setTestConfig()
**What**: Migrate any remaining process.env.* references in teams.test.ts not already handled in Unit 5a (47 total, some handled in 5a).
**Files**: `src/__tests__/channels/teams.test.ts`
**Acceptance**: All teams tests pass. No process.env references remain.

### ⬜ Unit 8e: Migrate remaining tools.test.ts to setTestConfig()
**What**: Migrate any remaining process.env.* references in tools.test.ts not already handled in Unit 6a (23 total, some handled in 6a).
**Files**: `src/__tests__/engine/tools.test.ts`
**Acceptance**: All tools tests pass. No process.env references remain.

### ⬜ Unit 8f: Migrate remaining config.test.ts to setTestConfig()
**What**: Migrate any remaining process.env.* references in config.test.ts not already handled in Unit 3a (20 total, some handled in 3a). OUROBOROS_CONFIG_PATH tests keep their process.env usage (that env var is intentionally kept).
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: All config tests pass. Only OUROBOROS_CONFIG_PATH process.env references remain.

### ⬜ Unit 9: Cleanup -- delete .env, update .gitignore, update comments
**What**: Three cleanup items:
1. Delete `.env` file (untracked/gitignored, contains only CLIENT_ID/CLIENT_SECRET/TENANT_ID which are in config.json)
2. Remove the `.env` line from `.gitignore` (line 4, no longer needed)
3. Update `src/teams-entry.ts` line 5 comment: change "All config now comes from ~/.agentconfigs/ouroboros/config.json (with env var overrides)." to "All config comes from ~/.agentconfigs/ouroboros/config.json."
**Files**: `.env` (delete), `.gitignore` (remove .env line), `src/teams-entry.ts` (update comment)
**Acceptance**: .env file gone. .gitignore no longer mentions .env. teams-entry.ts comment updated. All tests still pass.

### ⬜ Unit 10a: Final verification
**What**: Run full test suite, check coverage, run the grep verification command from completion criteria.
**Output**: All tests pass, 100% coverage on new code, grep returns nothing.
**Acceptance**:
- `npx vitest run` -- all pass, no warnings
- `npx vitest run --coverage` -- 100% on all files
- `grep -r 'process\.env\.' src/ --include='*.ts' | grep -v '__tests__' | grep -v 'OUROBOROS_CONFIG_PATH' | grep -v 'process\.argv'` -- returns nothing
- All 23 env var references from the manifest are gone

### ⬜ Unit 10b: CLI smoke test
**What**: Run the CLI adapter end-to-end to verify config loads correctly from config.json without any env vars. Launch `npx tsx src/cli-entry.ts`, send a test message, confirm the bot responds (provider initializes, model replies, no crashes). This catches any runtime issues that unit tests might miss (e.g. config not loading at startup, import order problems, missing fields in real config.json).
**Acceptance**:
- CLI starts without errors
- Bot responds to a test prompt (proves provider config loaded from config.json)
- No "process.env" or "env var" related warnings/errors in output

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-28-0934-doing-config-consolidation/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-02-28 10:35 Created from planning doc (Pass 1 -- first draft)
- 2026-02-28 10:35 Pass 2 -- granularity: all units appropriately sized, no changes needed
- 2026-02-28 10:35 Pass 3 -- validation: verified all 23 env var references match manifest, confirmed import paths (getAzureConfig not re-exported from core.ts, tools-base.ts has no config import, teams.ts has two config imports), confirmed .env untracked/gitignored, no changes needed
- 2026-02-28 10:35 Pass 4 -- quality: all 21 units have acceptance criteria, no TBD items, all emoji prefixes present, env var manifest complete (23 to remove, 1 to keep), status set to READY_FOR_EXECUTION
- 2026-02-28 10:38 Unit 1a complete: 7 failing tests for getTeamsChannelConfig and getIntegrationsConfig
- 2026-02-28 10:39 Unit 1b complete: TeamsChannelConfig, IntegrationsConfig interfaces and getters added to config.ts
- 2026-02-28 10:39 Unit 1c complete: 100% line/function coverage on new getters, no additional tests needed
- 2026-02-28 10:40 Unit 2a complete: 6 failing tests for setTestConfig()
- 2026-02-28 10:40 Unit 2b complete: setTestConfig() with DeepPartial type added to config.ts
- 2026-02-28 10:41 Unit 2c complete: 100% line/function coverage on setTestConfig
- 2026-02-28 10:42 Unit 3a complete: removed 10 env var override tests from 6 getters (44->34 tests)
- 2026-02-28 10:43 Unit 3b complete: all 6 getters now return shallow copies directly, 18 env var references removed from config.ts
- 2026-02-28 10:43 Unit 3c complete: config.ts at 100% stmt/branch/func/line coverage
- 2026-02-28 10:45 Unit 4a complete: prompt.test.ts migrated from env vars to setTestConfig, 2 azure tests fail (red)
- 2026-02-28 10:46 Unit 4b complete: providerSection() uses getProvider/getAzureConfig, no process.env in prompt.ts
