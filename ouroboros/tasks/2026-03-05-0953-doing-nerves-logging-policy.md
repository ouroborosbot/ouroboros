# Doing: Nerves Logging Policy Enforcement

**Status**: drafting
**Execution Mode**: direct
**Created**: TBD
**Planning**: ./2026-03-05-0953-planning-nerves-logging-policy.md
**Artifacts**: ./2026-03-05-0953-doing-nerves-logging-policy/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Achieve 100% automatic nerves observability enforcement: replace the manual `REQUIRED_EVENTS` manifest with 5 automatic audit rules, enforce `no-console` via ESLint, add `emitNervesEvent` calls to every observable code path in production, and document the logging policy.

## CI Note
The coverage gate runs on PR checks (`.github/workflows/coverage.yml` runs `npm run test:coverage`). The doer focuses on getting everything passing locally. If CI surfaces gaps after the PR is created, work-merger handles the iteration.

## Completion Criteria
- [ ] ESLint installed and configured with `no-console: "error"` for `src/**/*.ts` (excluding tests)
- [ ] All 8 console exception sites annotated with correct category and reason
- [ ] `npm run lint` passes cleanly (zero violations)
- [ ] `npm run lint` integrated into `scripts/run-coverage-gate.cjs`
- [ ] `REQUIRED_EVENTS` removed from contract.ts (manual manifest eliminated)
- [ ] Nerves audit implements 5 automatic rules: every-test-emits, start/end-pairing, error-context, source-coverage, file-completeness
- [ ] All `emitNervesEvent` calls use static string literals for `event` and `component` (no template literals, no variables)
- [ ] Per-test event tracking implemented in global-capture.ts
- [ ] Schema envelope validation and SENSITIVE_PATTERNS redaction check preserved
- [ ] All 20 production files have nerves events (every file with executable code; only types.ts skipped)
- [ ] All nerves events observed during test runs (Rule 4: source coverage passes)
- [ ] `emit-new-events.test.ts` removed (no longer needed)
- [ ] Logging Policy section added to AGENTS.md
- [ ] Logging policy mention added to CONTRIBUTING.md
- [ ] `subagents/work-merger.md` updated with nerves review checklist item
- [ ] `npm test` still passes
- [ ] No warnings
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] `npm run test:coverage` gate passes locally (lint + vitest 100% + nerves audit 5 rules all green)

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

---

## Phase A: ESLint and Console Enforcement

### ⬜ Unit 1: Install ESLint and create config
**What**: Install `eslint` and `typescript-eslint` as devDependencies. Create `eslint.config.js` (flat config) with `no-console: "error"` scoped to `src/**/*.ts`, explicitly ignoring `src/__tests__/**` from the no-console rule. Add `"lint": "eslint src/"` script to `package.json`.
**Output**: `eslint.config.js` created, `package.json` updated with deps and lint script
**Acceptance**: `npx eslint --print-config src/identity.ts` shows no-console as error; test files are not affected by no-console

### ⬜ Unit 2: Annotate 8 console exception sites
**What**: Add `// eslint-disable-next-line no-console -- <category>: <reason>` above each of the 8 legitimate console.* calls:
- `src/cli-entry.ts:9` -- `pre-boot guard: --agent check before imports`
- `src/teams-entry.ts:9` -- `pre-boot guard: --agent check before imports`
- `src/senses/cli.ts:377` -- `terminal UX: startup banner`
- `src/senses/cli.ts:420` -- `terminal UX: session cleared`
- `src/senses/cli.ts:424` -- `terminal UX: command dispatch result`
- `src/senses/cli.ts:474` -- `terminal UX: goodbye`
- `src/nerves/coverage/cli.ts:34` -- `meta-tooling: audit error message`
- `src/nerves/coverage/cli.ts:49` -- `meta-tooling: audit result message`
**Output**: 4 files updated with 8 disable comments
**Acceptance**: `npm run lint` passes with zero violations

### ⬜ Unit 3: Integrate lint into coverage gate
**What**: Add `npm run lint` as a step in `scripts/run-coverage-gate.cjs`, running before vitest. If lint fails, the gate fails with a `type: "lint"` required action.
**Output**: Updated `scripts/run-coverage-gate.cjs`
**Acceptance**: `npm run test:coverage` runs lint as part of the gate; lint failure would cause gate failure

---

## Phase B: Automatic Audit Rules

### ⬜ Unit 4a: Per-test event tracking -- tests
**What**: Write tests for the new per-test event tracking in global-capture.ts. Tests should verify: events are captured per-test with test name association, events are reset between tests (isolated), per-test data is written to a file the audit can consume.
**Output**: Test file for per-test capture behavior
**Acceptance**: Tests exist and FAIL (red) -- the per-test tracking does not exist yet

### ⬜ Unit 4b: Per-test event tracking -- implementation
**What**: Update `src/__tests__/nerves/global-capture.ts` to add `beforeEach`/`afterEach` hooks that track current test name and associate events. Reset captured events between tests so each test's events are isolated. Write per-test data to `vitest-events-per-test.json` alongside the existing global ndjson file. `maxWorkers: 1` means no interleaving risk.
**Output**: Updated global-capture.ts with per-test tracking
**Acceptance**: Tests from 4a PASS (green). Existing tests still pass.

### ⬜ Unit 4c: Per-test event tracking -- coverage & refactor
**What**: Verify 100% coverage on new per-test tracking code. Refactor if needed.
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 5a: Strip REQUIRED_EVENTS from contract -- tests
**What**: Write tests for the updated contract.ts (no REQUIRED_EVENTS, no RequiredEvent interface, no getRequiredEventKeys, no getDeclaredLogpoints). Tests verify: `REQUIRED_ENVELOPE_FIELDS` still exported, `SENSITIVE_PATTERNS` still exported, `eventKey()` still works, old exports are gone.
**Output**: Updated `src/__tests__/nerves/coverage-contract.test.ts`
**Acceptance**: Tests FAIL (red) -- REQUIRED_EVENTS still exists

### ⬜ Unit 5b: Strip REQUIRED_EVENTS from contract -- implementation
**What**: Remove `REQUIRED_EVENTS`, `RequiredEvent` interface, `getRequiredEventKeys()`, `getDeclaredLogpoints()` from `src/nerves/coverage/contract.ts`. Keep `REQUIRED_ENVELOPE_FIELDS`, `SENSITIVE_PATTERNS`, `eventKey()`. Remove `src/__tests__/nerves/emit-new-events.test.ts` (artifact of old model). Update `global-capture.ts`: remove `getDeclaredLogpoints()` import and `mergeLogpointFile()` function (logpoints concept replaced by per-test tracking from Unit 4). Remove `getRequiredEventKeys` import from `audit.ts`.
**Output**: Cleaned contract.ts, deleted emit-new-events.test.ts, updated global-capture.ts, updated audit.ts imports
**Acceptance**: Tests from 5a PASS (green). No imports of removed exports remain.

### ⬜ Unit 5c: Strip REQUIRED_EVENTS -- coverage & refactor
**What**: Verify coverage, refactor if needed.
**Acceptance**: 100% coverage on changed code, tests still green

### ⬜ Unit 6a: Audit Rule 4 (source coverage) -- tests
**What**: Write tests for the static source scanner that extracts `component:event` keys from `emitNervesEvent` calls in production source files, and the audit check that verifies every discovered key was observed during tests. Test cases: single-line calls, multi-line calls, files with no calls (skipped), keys found but not observed (fail), all keys observed (pass). Scanner must only accept static string literals (no template literals, no variables).
**Output**: Tests in `src/__tests__/nerves/coverage-audit.test.ts` (or new file for source scanner)
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 6b: Audit Rule 4 (source coverage) -- implementation
**What**: Implement static regex scanner that reads `src/**/*.ts` (excluding `__tests__/` and `nerves/`), extracts `component` and `event` string literals from `emitNervesEvent` calls (multi-line aware), and returns the set of `component:event` keys. Integrate into audit.ts as a new check section. Cross-reference discovered keys against observed events from the test run.
**Output**: Source scanner function + audit integration
**Acceptance**: Tests from 6a PASS (green)

### ⬜ Unit 6c: Audit Rule 4 -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage, tests green

### ⬜ Unit 7a: Audit Rule 5 (file completeness) -- tests
**What**: Write tests for the file completeness check. Test cases: production file with emitNervesEvent call (pass), production file with zero calls (fail), pure type-only file with zero calls (pass -- exempt), file with only `type`/`interface`/`enum` but no `function`/`class`/`const` (exempt). Scanner detects exemption automatically via heuristic.
**Output**: Tests in coverage-audit.test.ts
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 7b: Audit Rule 5 (file completeness) -- implementation
**What**: Implement file completeness check in audit.ts. Uses the same source scanner from Rule 4 to discover which production files have `emitNervesEvent` calls. For files with zero calls, check if the file is type-only (no `function`/`class`/`const` declarations -- only `type`/`interface`/`enum`). Flag non-exempt files with zero calls.
**Output**: New audit check section
**Acceptance**: Tests from 7a PASS (green)

### ⬜ Unit 7c: Audit Rule 5 -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage, tests green

### ⬜ Unit 8a: Audit Rule 1 (every-test-emits) -- tests
**What**: Write tests for the audit check that verifies every test emitted at least one nerves event. Test cases: all tests emit (pass), one test emits zero events (fail), per-test data file missing (fail gracefully).
**Output**: Tests in coverage-audit.test.ts
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 8b: Audit Rule 1 (every-test-emits) -- implementation
**What**: Implement the every-test-emits check in audit.ts. Reads per-test event data from `vitest-events-per-test.json`, verifies every test has at least one event. No exemptions.
**Output**: New audit check section
**Acceptance**: Tests from 8a PASS (green)

### ⬜ Unit 8c: Audit Rule 1 -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage, tests green

### ⬜ Unit 9a: Audit Rule 2 (start/end pairing) -- tests
**What**: Write tests for the start/end pairing check. Naming convention: `_start` suffix, matched by `_end` or `_error` with same prefix. Test cases: `foo_start` with matching `foo_end` (pass), `foo_start` with matching `foo_error` (pass), `foo_start` with no match (fail), `foo_end` without `foo_start` (pass -- orphan ends are OK), pairing scoped within a single test.
**Output**: Tests in coverage-audit.test.ts
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 9b: Audit Rule 2 (start/end pairing) -- implementation
**What**: Implement start/end pairing check in audit.ts. For each test's events, find all events whose `event` field ends in `_start`, extract the prefix (everything before `_start`), and verify a corresponding event ending in `_end` or `_error` with the same prefix exists in that same test's event set.
**Output**: New audit check section
**Acceptance**: Tests from 9a PASS (green)

### ⬜ Unit 9c: Audit Rule 2 -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage, tests green

### ⬜ Unit 10a: Audit Rule 3 (error context) -- tests
**What**: Write tests for the error-context check. Test cases: error-level event with non-empty meta (pass), error-level event with empty meta `{}` (fail), error-level event with null/undefined meta (fail), non-error-level events with empty meta (pass -- only errors checked).
**Output**: Tests in coverage-audit.test.ts
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 10b: Audit Rule 3 (error context) -- implementation
**What**: Implement error-context check in audit.ts. Scan all events, for those with `level: "error"`, verify `meta` is a non-empty object (has at least one key).
**Output**: New audit check section
**Acceptance**: Tests from 10a PASS (green)

### ⬜ Unit 10c: Audit Rule 3 -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage, tests green

### ⬜ Unit 11: Audit integration -- rewrite top-level report
**What**: Rewrite `auditNervesCoverage()` to produce a report with the new 5-rule structure plus preserved schema/redaction check. Update the report types (`NervesCoverageReport`, etc.) to reflect new sections: `source_coverage` (Rule 4), `file_completeness` (Rule 5), `every_test_emits` (Rule 1), `start_end_pairing` (Rule 2), `error_context` (Rule 3), `schema_redaction` (preserved). Remove old `event_catalog` and `logpoint_coverage` sections. Update `scripts/run-coverage-gate.cjs` if the report shape changed. Update `src/nerves/coverage/cli.ts` if needed.
**Output**: Updated audit.ts, report types, gate script, CLI
**Acceptance**: `npm test` passes. Audit produces a report with all 5 rules + schema/redaction.

---

## Phase C: Full Nerves Coverage -- Heart Domain

### ⬜ Unit 12a: heart/providers/anthropic.ts -- tests
**What**: Write failing tests that expect nerves events from anthropic provider code paths: API call start/end, streaming events, error handling. All events must use static string literals and follow start/end pairing convention.
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 12b: heart/providers/anthropic.ts -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths in anthropic.ts. Use static string literals for `event` and `component`. Follow `_start`/`_end`/`_error` naming for operations. Error events must have non-empty meta with context.
**Acceptance**: Tests from 12a PASS (green)

### ⬜ Unit 12c: heart/providers/anthropic.ts -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

### ⬜ Unit 13a: heart/providers (azure, minimax, openai-codex) -- tests
**What**: Write failing tests that expect nerves events from the 3 remaining provider files: init, error paths.
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 13b: heart/providers (azure, minimax, openai-codex) -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths in azure.ts, minimax.ts, openai-codex.ts.
**Acceptance**: Tests from 13a PASS (green)

### ⬜ Unit 13c: heart/providers (azure, minimax, openai-codex) -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

### ⬜ Unit 14a: heart/streaming.ts -- tests
**What**: Write failing tests that expect nerves events from stream processing: chunk processing start/end, stream errors, stream completion.
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 14b: heart/streaming.ts -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths in streaming.ts.
**Acceptance**: Tests from 14a PASS (green)

### ⬜ Unit 14c: heart/streaming.ts -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

### ⬜ Unit 15a: heart (turn-coordinator, api-error) -- tests
**What**: Write failing tests that expect nerves events from turn-coordinator.ts and api-error.ts.
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 15b: heart (turn-coordinator, api-error) -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths.
**Acceptance**: Tests from 15a PASS (green)

### ⬜ Unit 15c: heart (turn-coordinator, api-error) -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

---

## Phase C: Full Nerves Coverage -- Mind Domain

### ⬜ Unit 16a: mind (first-impressions, channel, store, tokens) -- tests
**What**: Write failing tests that expect nerves events from first-impressions.ts, channel.ts, store.ts (factory), and tokens.ts. These are small files (13-38 lines each).
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 16b: mind (first-impressions, channel, store, tokens) -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths in these 4 files.
**Acceptance**: Tests from 16a PASS (green)

### ⬜ Unit 16c: mind (first-impressions, channel, store, tokens) -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

### ⬜ Unit 17a: mind/friends/store-file.ts -- tests
**What**: Write failing tests that expect nerves events from store-file.ts (178 lines, file I/O, error handling).
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 17b: mind/friends/store-file.ts -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths in store-file.ts.
**Acceptance**: Tests from 17a PASS (green)

### ⬜ Unit 17c: mind/friends/store-file.ts -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

---

## Phase C: Full Nerves Coverage -- Repertoire Domain

### ⬜ Unit 18a: repertoire/ado-semantic.ts -- tests
**What**: Write failing tests that expect nerves events from ado-semantic.ts (950 lines, largest file -- ADO semantic operations, API calls, errors).
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 18b: repertoire/ado-semantic.ts -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths in ado-semantic.ts.
**Acceptance**: Tests from 18a PASS (green)

### ⬜ Unit 18c: repertoire/ado-semantic.ts -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

### ⬜ Unit 19a: repertoire (ado-context, ado-templates) -- tests
**What**: Write failing tests that expect nerves events from ado-context.ts and ado-templates.ts.
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 19b: repertoire (ado-context, ado-templates) -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths.
**Acceptance**: Tests from 19a PASS (green)

### ⬜ Unit 19c: repertoire (ado-context, ado-templates) -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

### ⬜ Unit 20a: repertoire (tools-base, tools-github, tools-teams) -- tests
**What**: Write failing tests that expect nerves events from tools-base.ts, tools-github.ts, and tools-teams.ts.
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 20b: repertoire (tools-base, tools-github, tools-teams) -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths.
**Acceptance**: Tests from 20a PASS (green)

### ⬜ Unit 20c: repertoire (tools-base, tools-github, tools-teams) -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

---

## Phase C: Full Nerves Coverage -- Senses Domain

### ⬜ Unit 21a: senses (cli.ts, cli-logging.ts) -- tests
**What**: Write failing tests that expect nerves events from cli.ts (REPL, commands, session management) and cli-logging.ts (logger setup).
**Acceptance**: Tests FAIL (red)

### ⬜ Unit 21b: senses (cli.ts, cli-logging.ts) -- implementation
**What**: Add `emitNervesEvent` calls to all observable code paths.
**Acceptance**: Tests from 21a PASS (green)

### ⬜ Unit 21c: senses (cli.ts, cli-logging.ts) -- coverage & refactor
**What**: Verify coverage, refactor.
**Acceptance**: 100% coverage on new code, tests green

---

## Phase D: Documentation and Work-Merger Integration

### ⬜ Unit 22: Document logging policy in AGENTS.md
**What**: Add "Logging Policy" section to AGENTS.md (after Git Discipline) covering: all runtime logging uses `emitNervesEvent()`, never raw `console.*`; three console exception categories; annotation format; automatic enforcement via 5 audit rules (no manual manifest); start/end pairing naming convention (`_start`/`_end`/`_error`); error events must include context in meta; static string literals only for `event` and `component`; file completeness requirement; two-layer enforcement model (5 CI rules + work-merger judgment review).
**Output**: Updated AGENTS.md
**Acceptance**: Logging Policy section present with all required content

### ⬜ Unit 23: Document logging policy in CONTRIBUTING.md
**What**: Add brief logging policy mention in CONTRIBUTING.md under the Code section, pointing to the full policy in AGENTS.md.
**Output**: Updated CONTRIBUTING.md
**Acceptance**: Logging policy mention present in Code section

### ⬜ Unit 24: Update work-merger with nerves review step
**What**: Update `subagents/work-merger.md` to add a nerves review checklist item to its PR workflow. When reviewing code changes on the branch, work-merger checks for new code paths (functions, catch blocks, state transitions, I/O operations) that lack corresponding `emitNervesEvent` calls. This is the judgment layer that catches what the 5 deterministic audit rules cannot. Add as a step in the PR Workflow or CI Failure Self-Repair section.
**Output**: Updated `subagents/work-merger.md`
**Acceptance**: Nerves review checklist item present in work-merger spec

---

## Final Verification

### ⬜ Unit 25: End-to-end local verification
**What**: Run full gate locally: `npm run lint`, `npm test`, `npm run test:coverage`. Verify all pass with zero errors and zero warnings. Save output to artifacts directory.
**Output**: Clean lint, passing tests, passing coverage gate (lint + vitest 100% + nerves audit 5 rules all green)
**Acceptance**: All three commands exit 0. Output saved to `./2026-03-05-0953-doing-nerves-logging-policy/`

---

## Execution
- **TDD strictly enforced**: tests first then red then implement then green then refactor
- Commit after each phase (a, b, c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-05-0953-doing-nerves-logging-policy/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away
- **CI iteration**: The coverage gate runs on PR checks. work-merger handles CI failures after the PR is created. The doer focuses on getting everything passing locally.
- **Static string literals**: All `emitNervesEvent` calls must use string literals for `event` and `component`. No template literals, no variables. The scanner depends on this.
- **Start/end pairing**: Operations use `_start`/`_end`/`_error` naming convention. The audit enforces this per-test.

## Progress Log
- TBD Created from planning doc
