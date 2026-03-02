# Doing: Ouroboros Migration — Testing Strategy (Phase 1)

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-02 14:27
**Planning**: ./2026-03-02-1404-planning-ouroboros-migration-testing-strategy.md
**Artifacts**: ./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Establish and enforce the testing baseline for the ouroboros migration by formalizing Vitest coverage thresholds and test conventions so all subsequent migration work ships with consistent, verifiable quality controls.

## Completion Criteria
- [ ] Vitest configuration enforces 100% coverage thresholds (lines, branches, functions, statements) for applicable source files.
- [ ] CI enforces `npm run test:coverage` as a required gate for relevant changes.
- [ ] Mandatory test convention documentation is finalized at `docs/cross-agent/testing-conventions.md`, with `CONTRIBUTING.md` containing concise entry-point guidance and a link to that doc.
- [ ] Test and coverage commands run successfully after updates.
- [ ] Any pre-existing uncovered paths surfaced by threshold enforcement are backfilled to meet the baseline.
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

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
**What**: Audit current testing baseline (`vitest.config.ts`, test scripts, existing CI workflows, and current contributor docs) and record concrete gaps against planning completion criteria.
**Output**: Gap checklist in `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/baseline-audit.md`.
**Acceptance**: Checklist explicitly covers thresholds, CI coverage gate, shared conventions doc location, and expected legacy coverage gap handling.

### ✅ Unit 1a: Coverage Threshold Enforcement — Red
**What**: Run `npm run test:coverage` after introducing threshold assertions to confirm baseline failure and identify uncovered legacy paths that must be backfilled.
**Output**: Failing test/coverage run log at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-1a-red.log` and uncovered file list.
**Acceptance**: Coverage run fails before backfill work, and failure output identifies concrete uncovered areas.

### ✅ Unit 1b: Coverage Threshold Enforcement — Green
**What**: Implement threshold enforcement in `vitest.config.ts` and add/update tests to close uncovered paths identified in Unit 1a.
**Output**: Updated config/tests plus a coverage gap resolution note at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-1b-gap-resolution.md`.
**Acceptance**: Targeted tests pass locally and uncovered legacy paths identified in Unit 1a are addressed.

### ✅ Unit 1c: Coverage Threshold Enforcement — Verify
**What**: Re-run full coverage suite and verify enforced thresholds hold with no warnings.
**Output**: Passing coverage run log at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-1c-green.log`.
**Acceptance**: `npm run test:coverage` succeeds with 100% thresholds enforced.

### ✅ Unit 2a: CI Coverage Gate — Red
**What**: Define CI gate checks and capture failing pre-change validation that demonstrates CI currently does not enforce `npm run test:coverage` (repo currently has no `.github/workflows` directory).
**Output**: CI gap note and red validation evidence at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-2a-red.md`.
**Acceptance**: Evidence clearly shows missing or insufficient CI coverage gating before implementation.

### ✅ Unit 2b: CI Coverage Gate — Green
**What**: Create `.github/workflows/coverage.yml` (or equivalent single-source CI workflow) to run `npm run test:coverage` for relevant changes.
**Output**: New/updated workflow file plus verification notes at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-2b-ci-gate.md`.
**Acceptance**: CI definition includes an explicit coverage step using `npm run test:coverage`, valid workflow paths, and relevant triggers.

### ⬜ Unit 2c: CI Coverage Gate — Verify
**What**: Validate CI workflow correctness via local checks (syntax/path review and command parity) and document expected pass/fail behavior.
**Output**: Validation record at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-2c-verify.md`.
**Acceptance**: CI gate behavior is documented and workflow references valid paths/scripts.

### ⬜ Unit 3a: Cross-Agent Testing Conventions — Red
**What**: Capture missing convention content by diffing current contributor guidance against required migration testing conventions.
**Output**: Content gap matrix at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-3a-gap-matrix.md`.
**Acceptance**: Matrix identifies all mandatory sections needed in `docs/cross-agent/testing-conventions.md`.

### ⬜ Unit 3b: Cross-Agent Testing Conventions — Green
**What**: Author `docs/cross-agent/testing-conventions.md` with mandatory, cross-agent testing conventions (coverage policy, TDD flow, mocking conventions, CI expectations, and artifact expectations).
**Output**: New `docs/cross-agent/testing-conventions.md`.
**Acceptance**: Document contains actionable mandatory guidance and aligns with repository structure and existing test tooling.

### ⬜ Unit 3c: Cross-Agent Testing Conventions — Verify
**What**: Validate clarity/completeness of the new conventions doc against the completion criteria checklist.
**Output**: Verification checklist at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-3c-verify.md`.
**Acceptance**: Checklist confirms no unresolved “what” decisions remain for testing strategy execution.

### ⬜ Unit 4a: CONTRIBUTING Entry Point — Red
**What**: Identify exact contributor entry-point gaps in `CONTRIBUTING.md` for routing to the cross-agent conventions doc.
**Output**: Gap note at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-4a-gap.md`.
**Acceptance**: Note lists missing anchor/link language that must be added.

### ⬜ Unit 4b: CONTRIBUTING Entry Point — Green
**What**: Update `CONTRIBUTING.md` with concise testing entry-point guidance and link to `docs/cross-agent/testing-conventions.md`.
**Output**: Updated `CONTRIBUTING.md`.
**Acceptance**: `CONTRIBUTING.md` remains concise while clearly directing contributors/agents to mandatory testing conventions.

### ⬜ Unit 4c: CONTRIBUTING Entry Point — Verify
**What**: Verify path/link correctness and contributor discoverability from the repo root.
**Output**: Validation note at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/unit-4c-verify.md`.
**Acceptance**: Link resolves and entry-point guidance is unambiguous.

### ⬜ Unit 5a: Final Suite Verification
**What**: Run full regression checks (`npm run test` and `npm run test:coverage`) after all changes are in place.
**Output**: Final run logs at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/final-test.log` and `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/final-coverage.log`.
**Acceptance**: Full suite and coverage commands pass with no warnings.

### ⬜ Unit 5b: Completion Criteria Audit
**What**: Perform a line-by-line audit against planning completion criteria and code coverage requirements before handoff.
**Output**: Audit checklist at `./2026-03-02-1404-doing-ouroboros-migration-testing-strategy/final-verification.md`.
**Acceptance**: Every completion criterion is explicitly marked met with linked evidence/artifact paths.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./[task-name]/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- [2026-03-02 14:27] Created from planning doc
- [2026-03-02 14:27] Granularity pass: split final verification into atomic units and stamped created timestamp
- [2026-03-02 14:28] Validation pass: confirmed paths/scripts and aligned CI unit with current repo state (no workflows directory yet)
- [2026-03-02 14:28] Quality pass: verified template completeness, acceptance coverage, and emoji unit headers
- [2026-03-02 14:29] Set status to READY_FOR_EXECUTION after completing mandatory conversion passes
- [2026-03-02 14:31] Unit 0 complete: baseline gaps documented in artifacts checklist
- [2026-03-02 14:33] Unit 1a complete: thresholds enabled and baseline investigation captured (no legacy gaps exposed)
- [2026-03-02 14:34] Unit 1b complete: gap-resolution note added and test/build checks passed
- [2026-03-02 14:35] Unit 1c complete: coverage/build verification artifacts recorded
- [2026-03-02 14:36] Unit 2a complete: CI red baseline captured (no workflows directory)
- [PENDING_UNIT2B_TS] Unit 2b complete: coverage workflow added and local validation passed
