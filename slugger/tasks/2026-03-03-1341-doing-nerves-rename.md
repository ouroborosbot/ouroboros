# Doing: Rename Observability Namespace and Commands to Nerves

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-03 13:49
**Planning**: ./2026-03-03-1341-planning-nerves-rename.md
**Artifacts**: ./2026-03-03-1341-doing-nerves-rename/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Rename the repository's observability namespace and command surface from `observability` to `nerves` so terminology aligns with the project's body-system naming conventions.

## Completion Criteria
- [x] `src/observability/` is fully renamed to `src/nerves/` (or equivalent file move) with no orphaned runtime usage.
- [x] Runtime code compiles and uses `nerves` import paths consistently.
- [x] Test suite references `nerves` paths and passes without alias shims.
- [x] Coverage and `audit:nerves` gate remain green after rename.
- [ ] Documentation/path references required for current workflows are updated to the new namespace.
- [ ] No active (non-historical) user-facing command or doc in this repo still uses `observability` as the subsystem name.
- [x] 100% test coverage on all new code
- [x] All tests pass
- [x] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD — no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ✅ Unit 0: Setup/Research
**What**: Inventory all active `observability` namespace and command references in code, tests, scripts, and active docs; capture exact rename targets and expected untouched historical paths.
**Output**: Reference inventory artifact in `./2026-03-03-1341-doing-nerves-rename/rename-inventory.md`.
**Acceptance**: Inventory distinguishes active rename targets from historical records and is sufficient to drive deterministic edits.

### ✅ Unit 1a: Namespace and Command Rename — Tests
**What**: Add or update tests to fail first for the new namespace/command contract, including `audit:nerves` naming, `src/nerves` import-path expectations, and renamed coverage-cli output defaults.
**Acceptance**: New/updated tests exist and fail (red) before implementation.

### ✅ Unit 1b: Namespace and Command Rename — Implementation
**What**: Perform file moves and code edits to rename `src/observability` to `src/nerves` and `src/__tests__/observability` to `src/__tests__/nerves`, update imports/exports, and switch active command usage to `audit:nerves`.
**Acceptance**: Targeted tests pass (green), runtime/build path references resolve, no warnings.

### ✅ Unit 1c: Namespace and Command Rename — Coverage & Refactor
**What**: Refactor for clarity if needed while preserving behavior and verify coverage and audit gates for the renamed namespace.
**Acceptance**: 100% coverage on new code, tests remain green, coverage gate and `audit:nerves` gate pass.

### ✅ Unit 2a: Coverage/Audit Pipeline Integration — Tests
**What**: Add or update tests for coverage-gate integration so required actions/report parsing align with `nerves` naming and artifacts.
**Acceptance**: Tests fail first for any stale `observability` command/artifact assumptions.

### ✅ Unit 2b: Coverage/Audit Pipeline Integration — Implementation
**What**: Update `package.json`, `scripts/run-coverage-gate.cjs`, and coverage CLI wiring so the combined gate pipeline consistently references the renamed subsystem and command.
**Acceptance**: Coverage gate script and audit command run successfully using `audit:nerves`, `dist/nerves/coverage/cli-main.js`, and renamed expected artifact paths.

### ✅ Unit 2c: Coverage/Audit Pipeline Integration — Coverage & Refactor
**What**: Validate branch/error-path coverage for updated script logic and tighten implementation without behavior drift.
**Acceptance**: Updated script/tests are fully covered for new/changed lines and remain green.

### ⬜ Unit 3a: Documentation and Task Path Accuracy — Tests
**What**: Add lightweight assertions/checks or scripted validations (if present) for active docs/commands that must move from `observability` to `nerves`.
**Acceptance**: Validation fails when active required docs still contain stale subsystem naming.

### ⬜ Unit 3b: Documentation and Task Path Accuracy — Implementation
**What**: Update active docs and materially incorrect slugger task path mentions impacted by this rename while preserving historical records.
**Acceptance**: Active docs are updated, historical records remain intentionally untouched, and checks pass.

### ⬜ Unit 3c: Documentation and Task Path Accuracy — Coverage & Refactor
**What**: Run final hygiene checks for naming consistency and remove any unnecessary transitional wording.
**Acceptance**: No active in-scope docs or commands use `observability` as subsystem name; tests and checks remain green.

### ⬜ Unit 4: Final Verification and Handoff
**What**: Run full verification suite and capture artifacts for implementation handoff.
**Output**: Saved logs/results in `./2026-03-03-1341-doing-nerves-rename/` and updated completion checklist evidence.
**Acceptance**: Full test suite passes, coverage gate passes, `audit:nerves` gate passes, and completion criteria are demonstrably satisfiable.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-03-1341-doing-nerves-rename/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- [2026-03-03 13:49] Created from planning doc.
- [2026-03-03 13:50] Validation pass aligned units to existing repo paths and scripts (`src/observability`, `src/__tests__/observability`, `package.json`, `scripts/run-coverage-gate.cjs`).
- [2026-03-03 13:51] Quality pass complete; acceptance criteria, coverage requirements, and unit-status formatting verified for execution handoff.
- [2026-03-03 13:59] Unit 0 complete: captured active rename targets and historical exclusions in `rename-inventory.md`.
- [2026-03-03 14:00] Unit 1a complete: added failing rename contract tests for `audit:nerves` and coverage-gate naming, captured red run output.
- [2026-03-03 14:02] Unit 1b complete: moved observability module/test trees to `nerves`, updated imports and command wiring, and passed full test suite + build.
- [2026-03-03 14:04] Unit 1c complete: backfilled coverage for `src/nerves/coverage/cli-main.ts`; combined `test:coverage` gate and build both pass at 100%.
- [2026-03-03 14:05] Unit 2a complete: added failing coverage-pipeline contract assertions for `nerves audit` messaging and `nerves_coverage` summary key.
- [2026-03-03 14:07] Unit 2b complete: implemented `nerves audit` messaging and `nerves_coverage` outputs in coverage CLI/gate; targeted tests and combined gate pass.
- [2026-03-03 14:08] Unit 2c complete: reran combined coverage gate at 100% with `nerves` pipeline naming and verified clean build.
