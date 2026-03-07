# Doing: Fix Round Gate 7 Deliverables

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-07 03:57
**Planning**: ./2026-03-07-0357-planning-fix-round-gate-7-deliverables.md
**Artifacts**: ./2026-03-07-0357-doing-fix-round-gate-7-deliverables/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Complete Gate 7 by shipping final docs, auditing all skipped tests called out by the master plan, and finishing with clean full verification artifacts.

## Completion Criteria
- [ ] `docs/testing-guide.md` exists and covers the full required walkthrough, expected outputs, and troubleshooting
- [ ] `ARCHITECTURE.md` reflects post-fix-round system design and command/runtime contracts
- [ ] All 18 skipped tests in `src/__tests__/heart/core.test.ts` are audited and either unskipped+fixed or explicitly marked with `// skip: kick detection deferred per audit`
- [ ] Full verification suite passes and logs are captured for Gate 7 artifacts
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

### ⬜ Unit 0: Gate 7 Baseline Audit
**What**: Inspect current docs and skipped-test inventory (`docs/`, `ARCHITECTURE.md`, `src/__tests__/heart/core.test.ts`) and capture baseline counts/notes.
**Output**: Baseline artifact notes under gate artifacts directory.
**Acceptance**: Baseline clearly identifies required doc deltas and exact skipped-test set to audit.

### ⬜ Unit 1: Testing Guide Authoring (TDD for doc contract)
**What**: Add/adjust tests (if needed) asserting testing-guide presence/contract, then write `docs/testing-guide.md` with the required walkthrough, expected outputs, and troubleshooting.
**Output**: Final `docs/testing-guide.md` and any test updates validating doc contract.
**Acceptance**: Guide includes all required flow steps (`ouro up` -> `ouro hatch` -> chat -> coding spawn -> `ouro msg` -> heartbeat -> `ouro stop`) with expected output cues and troubleshooting section.

### ⬜ Unit 2: ARCHITECTURE.md Post-Fix-Round Refresh
**What**: Update `ARCHITECTURE.md` to reflect final architecture decisions from subsystem audit outcomes and post-fix-round runtime behavior.
**Output**: Updated architecture documentation aligned with current codebase.
**Acceptance**: Doc covers unified process model, subsystem/body metaphor, removed components, daemon command surface, directory layout, and canonical bundle manifest.

### ⬜ Unit 3: 18 Skipped Tests Audit + Remediation (TDD)
**What**: Audit all skipped tests in `src/__tests__/heart/core.test.ts`; unskip and fix active behaviors or add required defer comment exactly where still intentionally deferred.
**Output**: Updated `core.test.ts` with audited skip state and any supporting code/test fixes.
**Acceptance**: Every previously skipped test has explicit disposition and suite remains green with required audit comments for deferred kick-detection cases.

### ⬜ Unit 4: Final Verification + Gate Artifacts
**What**: Run full verification (`npm run lint`, `npm run build`, `npm test --silent`, `npm run test:coverage -- --runInBand`) and store logs in artifacts.
**Output**: `04-lint.log`, `04-build.log`, `04-test.log`, `04-coverage.log` in artifacts directory.
**Acceptance**: All commands pass with no warnings; coverage gate and nerves audit pass.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each logical unit completion
- Push after each unit completion
- Run full relevant tests before marking a unit done
- **All artifacts**: Save outputs/logs to `./2026-03-07-0357-doing-fix-round-gate-7-deliverables/`
- Keep changes strictly scoped to Gate 7 deliverables

## Progress Log
- 2026-03-07 03:57 Created from planning doc.
- 2026-03-07 03:58 Granularity pass complete (no changes needed).
- 2026-03-07 03:59 Validation pass complete (paths and target files confirmed).
- 2026-03-07 03:59 Quality pass complete (no changes needed).
