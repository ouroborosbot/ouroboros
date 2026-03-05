# Doing: Runtime configuration schema validation & resolution (agent.json + secrets.json)

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Add a lightweight, dependency-free runtime configuration validation + resolution layer so malformed/partial configs (notably `ouroboros/<agent>/agent.json` and `~/.agentsecrets/<agent>/secrets.json`) fail fast with actionable, path-specific errors, while still supporting defaults + non-fatal warnings for unknown keys.

## Completion Criteria
- [ ] `agent.json` is validated (types, required keys, numeric ranges, enums) with clear, path-specific errors
- [ ] `secrets.json` is validated (types, numeric ranges, shape) with clear, path-specific errors
- [ ] Defaults + normalization are applied in exactly one place per config (`resolve*` functions)
- [ ] Unknown keys are surfaced as warnings (and can be made fatal via strict mode)
- [ ] Validation runs at startup/entrypoints (CLI, Teams, reflection single + loop) and exits with a multi-line report on errors
- [ ] `ouroboros/ARCHITECTURE.md` documents “Config validation & resolution” and how to safely add new config keys
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: Validation primitives — Tests
**What**: Add unit tests for dependency-free validation helpers: path building, issue aggregation, unknown-key detection, strict-mode behavior, and report formatting.
**Files**:
- `src/__tests__/config-validation.test.ts` (new)
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 1b: Validation primitives — Implementation
**What**: Implement a small validation core with explicit type guards (no npm deps).
- Define types like `ValidationIssue`, `ValidationResult`, and a `ConfigValidationError` that renders a multi-line report.
- Implement helpers for:
  - `isRecord(value)`
  - `expectString/Number/Boolean/Array` style checks
  - path formatting: `agent.json: phrases.thinking[0] ...`
  - unknown-key collection for objects (warn by default; error in strict mode)
  - numeric range checks
**Files**:
- `src/config/validation.ts` (new)
**Acceptance**: Unit 1a tests PASS (green).

---

### ⬜ Unit 2a: Agent config (agent.json) validation/resolution — Tests
**What**: Write failing tests covering the agent runtime config shape.
Scenarios to cover:
- happy path minimal config (no `context`, no `phrases` ⇒ defaults applied explicitly)
- missing required field (e.g., missing `provider`)
- wrong type (e.g., `phrases.thinking` is a string)
- out-of-range numeric (e.g., `context.maxTokens <= 0`, `contextMargin` not in `[0, 100]`)
- unknown provider name (enum validation)
- unknown keys produce warnings; strict mode converts to errors
**Files**:
- `src/__tests__/agent-config-validation.test.ts` (new) **or** extend `src/__tests__/identity.test.ts`
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 2b: Agent config (agent.json) validation/resolution — Implementation
**What**: Implement and wire validation + resolution for `agent.json`.
- In `src/config/validation.ts`, implement:
  - `validateAgentConfigRaw(raw, opts): ValidationResult`
  - `resolveAgentConfig(raw, opts): { config: AgentConfig; warnings: ValidationIssue[] }`
    - apply defaults (`DEFAULT_AGENT_CONTEXT`, `DEFAULT_AGENT_PHRASES`) in one place
    - normalize simple string fields (trim)
- Update `src/identity.ts` `loadAgentConfig()` to:
  - validate parsed JSON and throw `ConfigValidationError` on errors with `agent.json:`-prefixed paths
  - emit warnings (console + `emitNervesEvent`) for unknown keys / non-fatal issues
  - preserve existing behavior: auto-fill missing `phrases` (but via resolver); only write back when placeholders were applied
**Files**:
- `src/config/validation.ts` (modify)
- `src/identity.ts` (modify)
**Acceptance**: Unit 2a tests PASS (green) and existing identity tests are updated as needed.

### ⬜ Unit 2c: Identity test suite alignment — Tests
**What**: Update/extend existing identity tests to reflect the new validation behavior (especially error messages and warning behavior).
**Files**:
- `src/__tests__/identity.test.ts` (modify)
**Acceptance**: Identity test suite PASS (green) without weakening assertions (keep descriptive error expectations).

---

### ⬜ Unit 3a: Secrets config (secrets.json) validation/resolution — Tests
**What**: Write failing tests for schema validation of `~/.agentsecrets/<agent>/secrets.json`.
Scenarios to cover:
- happy path minimal/empty config `{}` ⇒ defaults applied
- wrong primitive type (e.g., `providers.azure.apiKey` is a number)
- wrong nested shape (e.g., `providers` is a string)
- out-of-range numeric (e.g., `teamsChannel.port` not in `[1, 65535]`; optional `flushIntervalMs` <= 0)
- unknown keys warning behavior (and strict-mode failure)
- legacy `context` block: ignored with a warning (and never merged into runtime context)
**Files**:
- `src/__tests__/secrets-config-validation.test.ts` (new) **or** extend `src/__tests__/config.test.ts`
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 3b: Secrets config (secrets.json) validation/resolution — Implementation
**What**: Implement and wire secrets validation + resolution into `loadConfig()`.
- In `src/config/validation.ts`, implement:
  - `validateSecretsConfigRaw(raw, opts): ValidationResult`
  - `resolveSecretsConfig(rawPartial, defaults, opts): { config: OuroborosConfig; warnings: ValidationIssue[] }`
    - apply defaults centrally (reuse existing `defaultRuntimeConfig()` + deep merge)
    - do **not** silently accept wrong types (fail with `ConfigValidationError`)
    - continue to ignore legacy `context` block, but surface a warning
- Update `src/config.ts` `loadConfig()` to:
  - after JSON parse succeeds: validate raw → throw on errors; otherwise resolve + cache
  - surface warnings (console + `emitNervesEvent`) once per load
  - keep current ENOENT behavior: auto-create default secrets template
**Files**:
- `src/config/validation.ts` (modify)
- `src/config.ts` (modify)
- `src/__tests__/config.test.ts` (modify as needed if behavior changes)
**Acceptance**: Unit 3a tests PASS (green) and full config test suite PASS.

---

### ⬜ Unit 4a: Startup validation runner — Tests
**What**: Add a small startup validator that entrypoints can call to fail fast with a single consolidated report.
- Test that it:
  - validates `agent.json` and `secrets.json`
  - prints a clear multi-line report on error
  - prints warnings (without failing) in non-strict mode
  - respects strict mode toggle (env var or explicit option)
**Files**:
- `src/__tests__/startup-validation.test.ts` (new)
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 4b: Startup validation runner — Implementation + wiring
**What**: Implement the runner and wire into all runtime entrypoints.
- Create `src/startup/validate-config.ts` exporting:
  - `validateStartupConfig(opts?): { warnings: ValidationIssue[] }` (throws `ConfigValidationError` on errors)
  - `validateStartupConfigOrExit(opts?): void` (prints report and `process.exit(1)`)
- Wire calls into these entrypoints **after** the `--agent` argument check and before starting the app:
  - `src/cli-entry.ts`
  - `src/teams-entry.ts`
  - `src/reflection/reflect-entry.ts`
  - `src/reflection/loop-entry.ts`
**Files**:
- `src/startup/validate-config.ts` (new)
- `src/cli-entry.ts` (modify)
- `src/teams-entry.ts` (modify)
- `src/reflection/reflect-entry.ts` (modify)
- `src/reflection/loop-entry.ts` (modify)
**Acceptance**: Unit 4a tests PASS (green). Manual spot-check: launching each entrypoint with an intentionally broken config fails fast with a readable report.

---

### ⬜ Unit 5a: Architecture documentation — Tests
**What**: Add/adjust any lightweight doc consistency checks if such tests already exist; otherwise skip.
**Files**: (none, unless a doc test harness exists)
**Acceptance**: If added, tests FAIL (red) before doc update.

### ⬜ Unit 5b: Architecture documentation — Update
**What**: Update `ouroboros/ARCHITECTURE.md` to document config validation & resolution.
Include:
- where validation runs (startup + config load)
- how defaults are applied (resolved config)
- how to add new keys safely (update schema/validator + defaults + tests)
- strict mode + warning behavior (document the chosen toggle, e.g. `OUROBOROS_CONFIG_STRICT=1`)
**Files**:
- `ouroboros/ARCHITECTURE.md` (modify)
**Acceptance**: Doc reflects the new initialization contract and references the correct modules/files.

## Progress Log
- 2026-03-05 Created from reflection proposal
