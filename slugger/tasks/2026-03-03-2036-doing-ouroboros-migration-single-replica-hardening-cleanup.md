# Doing: Ouroboros Migration — Single-Replica Hardening Cleanup

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-03 21:50
**Planning**: ./2026-03-03-2036-planning-ouroboros-migration-single-replica-hardening-cleanup.md
**Artifacts**: ./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Clean up the recent runtime/deployment-hardening work by removing changes that are not currently providing value and moving misplaced changes into appropriate locations, while leaving unrelated work untouched.

## Completion Criteria
- [x] Cleanup principles are locked: remove non-value changes and relocate misplaced changes.
- [x] Scope boundary is locked: only task-owned runtime/deployment-hardening changes are touched.
- [x] A file-by-file cleanup inventory exists with disposition per item: keep/remove/move.
- [x] Cleanup inventory explicitly resolves every task-owned changed path with no `TBD` entries.
- [ ] Runtime behavior hardening changes are retained and validated.
- [ ] Synthetic runtime-hardening gate stack is removed from runtime tree and mandatory CI coverage gate flow.
- [ ] Task planning/doing/audit artifacts are retained for future auditing.
- [ ] A self-audit explicitly states what I got wrong and how each issue is corrected.
- [ ] Validation criteria are concrete and testable (including untouched-file guarantees).
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

### ✅ Unit 0: Baseline Inventory Lock
**What**: Produce a complete `main..HEAD` file inventory and lock per-path disposition (`keep/remove/move`) as the execution baseline for cleanup.
**Output**: `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-0-inventory.md`.
**Acceptance**: Every changed path in task-owned scope is accounted for with no `TBD` entries; keep/remove rules match approved planning doc.

### ✅ Unit 1a: Synthetic Gate Removal Contract — Tests (Red)
**What**: Add failing tests that assert synthetic runtime-hardening gate wiring must be absent from final state:
- no runtime-hardening scripts in `package.json`
- no runtime-hardening branch/summary/action wiring in mandatory coverage gate script
- no runtime-hardening CLI module contract entrypoints expected in CI wiring
**Output**: Red run artifact `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-1a-red-run.txt`.
**Acceptance**: New cleanup contract tests fail against current branch state before implementation.

### ⬜ Unit 1b: Synthetic Gate Removal — Implementation (Green)
**What**: Remove synthetic runtime-hardening gate stack and mandatory CI wiring while preserving approved runtime behavior hardening.
**Output**: Updated codebase with synthetic gate stack removed; green run artifacts:
- `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-1b-test-run.txt`
- `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-1b-build-run.txt`
**Acceptance**: Unit 1a tests pass; removed targets are absent; runtime behavior files remain unchanged in intent; full tests/build pass without warnings.

### ⬜ Unit 1c: Cleanup Coverage & Refactor
**What**: Run coverage gate after cleanup removals, backfill any coverage gaps introduced by cleanup-only changes, and refactor tests/code for clarity without changing behavior.
**Output**:
- `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-1c-coverage-run.txt`
- `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-1c-build-run.txt`
**Acceptance**: 100% coverage on changed code, tests green, build green, no warnings.

### ⬜ Unit 2a: Runtime Hardening Retention Verification
**What**: Verify retained runtime hardening behaviors still hold after synthetic stack removal via targeted tests and evidence capture:
- remote local-tool blocking behavior
- teams concurrency cap behavior
- prompt refresh fallback behavior
- non-blocking sink behavior
**Output**: `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-2a-runtime-retention.txt`.
**Acceptance**: Targeted runtime behavior tests all pass and map explicitly to retained keep-list files.

### ⬜ Unit 2b: Task Audit Retention Verification
**What**: Verify task planning/doing/audit artifacts from `slugger/tasks/2026-03-03-1430-*` remain present and tracked after cleanup.
**Output**: `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-2b-task-audit-manifest.txt`.
**Acceptance**: Manifest confirms task docs/artifacts retained; no cleanup step deletes audit files.

### ⬜ Unit 2c: Final Verification and Cleanup Audit
**What**: Run final verification (`npm test`, `npm run test:coverage`, `npm run build`) and produce concise file-by-file cleanup inventory table (`keep/remove/move`) with one-line rationale plus completion-criteria mapping.
**Output**:
- `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-2c-test-run.txt`
- `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-2c-coverage-run.txt`
- `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/unit-2c-build-run.txt`
- `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/final-audit.md`
**Acceptance**: All completion criteria satisfied with explicit artifact-backed evidence and no warnings.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-03 21:50 Created from planning doc.
- 2026-03-03 21:51 Pass 1 complete: created first draft doing doc with explicit unit boundaries and artifacts contract.
- 2026-03-03 21:52 Pass 2 complete: granularity pass tightened unit acceptance details and split synthetic-removal assertions into explicit atomic checks.
- 2026-03-03 21:53 Pass 3 complete: validated referenced paths/contracts against current codebase (runtime-hardening module and scripts present; retained runtime hardening paths verified), no structural corrections needed.
- 2026-03-03 21:52 Pass 4 complete: quality scan verified checklist/testability/emoji requirements and set status to READY_FOR_EXECUTION.
- 2026-03-03 21:55 Unit 0 complete: baseline inventory locked at 50/50 `main..HEAD` paths with explicit keep/remove dispositions and no `TBD` entries (`unit-0-inventory.md`).
- 2026-03-03 21:57 Unit 1a complete: added synthetic gate removal contract assertions in `src/__tests__/nerves/rename-contract.test.ts`; captured intentional red run in `unit-1a-red-run.txt`.
