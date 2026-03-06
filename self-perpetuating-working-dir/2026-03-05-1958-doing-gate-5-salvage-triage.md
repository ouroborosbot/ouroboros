# Doing: Gate 5 Salvage + Triage

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-05 19:58
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-1958-doing-gate-5-salvage-triage/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Execute Gate 5 by re-landing valuable salvageable code from the reverted overnight run and triaging all 31 overnight proposals into an actionable, de-duplicated backlog aligned to the post-inversion architecture.

## Completion Criteria
- [ ] All salvageable code from revert set evaluated and re-landed where valuable
- [ ] All 31 overnight proposals triaged: each one filed as a backlog task doc, marked not-applicable, or archived with rationale
- [ ] High-merit items flagged as high priority in the backlog
- [ ] Proposals obsoleted by the inversion explicitly marked as such
- [ ] Raw overnight artifacts cleaned up (duplicates removed, originals archived)
- [ ] Valid historical task docs in `ouroboros.ouro/tasks/` untouched
- [ ] `npm test` green
- [ ] 100% coverage on any new/re-landed code

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

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ⬜ Unit 0: Baseline salvage inventory
**What**: Read `self-perpetuating-working-dir/gate-0-commit-map.md` and the archived overnight proposal files from `archive/self-perpetuating-run-2026-03-05` to build the canonical Gate 5 input set.
**Output**: `unit-0-salvage-inventory.md` and `unit-0-proposal-index.json` artifacts.
**Acceptance**: Inventory includes every reverted commit candidate and all 31 overnight proposals with source paths.

### ⬜ Unit 1: Salvage decision matrix
**What**: Classify each salvageable candidate as `re-land-now`, `re-land-later`, `not-applicable`, or `archive-only` with rationale against current inversion architecture.
**Output**: `unit-1-salvage-decision-matrix.md` artifact.
**Acceptance**: Every candidate is classified with rationale; no unresolved entries remain.

### ⬜ Unit 2a: Small salvage code tests (Red, conditional)
**What**: For each `re-land-now` small/self-contained code candidate, write failing tests that capture intended behavior before re-landing code.
**Output**: Red tests + `unit-2a-red-test-log.txt` artifact.
**Acceptance**: Added/updated tests fail before implementation; if no small candidates exist, artifact records explicit no-op rationale.

### ⬜ Unit 2b: Small salvage code implementation (Green, conditional)
**What**: Re-land small candidates via minimal cherry-pick or manual port so Unit 2a tests pass.
**Output**: Implementation commits + `unit-2b-green-test-log.txt` and `unit-2b-tsc-log.txt` artifacts.
**Acceptance**: All Unit 2a tests pass; `npx tsc --noEmit` is clean.

### ⬜ Unit 2c: Small salvage coverage/refactor (conditional)
**What**: Refactor as needed and close coverage on any new/re-landed code from Unit 2b.
**Output**: `unit-2c-coverage-log.txt` artifact.
**Acceptance**: 100% coverage on new/re-landed code; `npm test` green.

### ⬜ Unit 3: Substantial salvage flow (conditional)
**What**: For any `re-land-now` substantial candidate, create focused planning/doing docs in `self-perpetuating-working-dir/` and execute them before returning to Gate 5.
**Output**: Per-candidate planning/doing docs and execution artifacts, or explicit no-op artifact if none.
**Acceptance**: All substantial `re-land-now` candidates are either completed or explicitly reclassified with rationale.

### ⬜ Unit 4: Proposal triage and backlog authoring
**What**: Triage all 31 overnight proposals (dedupe + merit review) and file outcomes in backlog docs under `self-perpetuating-working-dir/gate-5-backlog/` using the existing planning-doc format.
**Output**: One triage outcome per proposal + `gate-5-backlog/index.md` summary.
**Acceptance**: Every proposal is accounted for exactly once as backlog item, not-applicable, or archived with rationale.

### ⬜ Unit 5: Priority + obsolescence tagging
**What**: Flag high-merit security items as high priority and explicitly mark inversion-obsoleted proposals.
**Output**: Updated backlog docs/index with `priority` and `status rationale` tags.
**Acceptance**: Security items visibly marked high priority; obsoleted items explicitly reference inversion rationale.

### ⬜ Unit 6: Artifact cleanup and preservation audit
**What**: Clean duplicate raw overnight artifacts, archive originals, and verify valid historical docs in `ouroboros.ouro/tasks/` remain untouched.
**Output**: `unit-6-cleanup-audit.md` artifact.
**Acceptance**: Duplicates removed, originals archived, and preservation audit shows no unintended edits to valid historical task docs.

### ⬜ Unit 7: Final verification and checklist sync
**What**: Run required verification (`npm test`, `npx tsc --noEmit`, and coverage if code changed), then sync Gate 5 completion checklists in doing/planning docs.
**Output**: `unit-7-verification.md` artifact.
**Acceptance**: Gate 5 completion criteria are evidence-backed and all required checks are green.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking implementation units done
- **All artifacts**: Save outputs/logs under `./self-perpetuating-working-dir/2026-03-05-1958-doing-gate-5-salvage-triage/`
- **Fixes/blockers**: Spawn sub-agent for simple fix loops; only stop for real requirement blockers
- **Decision updates**: Record triage decisions in backlog docs immediately

## Progress Log
- 2026-03-05 19:58 Created from Gate 5 section of approved planning doc
