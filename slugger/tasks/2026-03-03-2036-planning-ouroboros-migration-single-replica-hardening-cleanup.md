# Planning: Ouroboros Migration — Single-Replica Hardening Cleanup

**Status**: NEEDS_REVIEW
**Created**: 2026-03-03 20:36

## Goal
Clean up the recent runtime/deployment-hardening work by removing changes that are not currently providing value and moving misplaced changes into appropriate locations, while leaving unrelated work untouched.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Apply value-first cleanup: remove changes that are not providing current value.
- Apply placement cleanup: move changes that belong in a different place.
- Limit cleanup scope to the recent runtime/deployment-hardening task footprint and direct aftermath.
- Retain the runtime behavior hardening that provides current product/runtime value.
- Remove synthetic runtime-hardening gate scaffolding that is currently not meaningful signal.
- Keep task docs and task artifacts for auditability.
- Produce an explicit self-audit of mistakes made in that task and map each to corrective action.
- Define file-level acceptance checks proving unrelated work remains untouched.

### Out of Scope
- Re-doing the entire migration topic from scratch.
- Modifying work that was not made in the runtime/deployment-hardening task being cleaned up.
- Deleting task files created for audit trail (`slugger/tasks/...`) from this task set.
- Introducing new architecture/policy not explicitly approved during this planning thread.
- Implementing any code changes before planning approval.

## Completion Criteria
- [ ] Cleanup principles are locked: remove non-value changes and relocate misplaced changes.
- [ ] Scope boundary is locked: only task-owned runtime/deployment-hardening changes are touched.
- [ ] A file-by-file cleanup inventory exists with disposition per item: keep/remove/move.
- [ ] Cleanup inventory explicitly resolves every task-owned changed path with no `TBD` entries.
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

## Open Questions
- [x] What exact outcomes do you want from this cleanup pass?
- [x] Which current files/changes do you consider "nonsense" and why?
- [x] Which existing behavior must remain untouched during cleanup?
- [x] What evidence will count as "cleaned up correctly" for signoff?
- [x] Confirm exact candidate change-set boundary for cleanup (which commits/files are included).
- [x] Confirm signoff artifact format (short rationale table vs detailed per-file notes).

## Decisions Made
- Start new planning doc (do not resume previous completed planning docs).
- Use git history as context baseline before interview.
- Make no cleanup assumptions before your explicit direction.
- This is a cleanup pass, not a redo of the whole topic.
- Priority order is locked: (1) remove non-value changes, (2) move misplaced changes.
- Do not touch changes outside the runtime/deployment-hardening task footprint.
- Keep all task files/artifacts for this task set; do not prune audit trail files.
- Runtime behavior hardening is intended value and should be preserved.
- Synthetic runtime-hardening gate stack is currently meaningless signal and is cleanup target for removal.
- Signoff evidence format: concise file-by-file inventory table (`keep/remove/move` + one-line rationale) plus test/build/CI verification summary.

## Context / References
- `/Users/arimendelow/Projects/ouroboros-agent-harness` current branch: `slugger/single-replica-hardening-cleanup`
- Recent history checked: `e613c72`, `c880a06`, `a43d583` and prior task completion commits on `main`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md`

## Notes
Starting from current `main` state (including reverts already applied).

Cleanup boundary (current lock):
- **Keep** runtime behavior hardening and associated tests in:
  `src/repertoire/tools.ts`, `src/senses/teams.ts`, `src/heart/core.ts`,
  `src/nerves/index.ts`, `src/config.ts`,
  and corresponding runtime tests under `src/__tests__/...`.
- **Remove** synthetic runtime-hardening gate scaffolding:
  `src/nerves/runtime-hardening/*`,
  `scripts/run-runtime-hardening-load-validation.cjs`,
  runtime-hardening CI wiring in `scripts/run-coverage-gate.cjs` and `package.json`.
- **Keep** task docs and artifacts under:
  `slugger/tasks/2026-03-03-1430-*`.

File-by-file cleanup inventory (locked baseline, no ambiguity):
- **Keep (runtime behavior + tests)**
  - `src/config.ts`
  - `src/heart/core.ts`
  - `src/nerves/index.ts`
  - `src/repertoire/tools.ts`
  - `src/senses/teams.ts`
  - `src/__tests__/heart/core.test.ts`
  - `src/__tests__/nerves/non-blocking-sinks.test.ts`
  - `src/__tests__/nerves/sinks.test.ts`
  - `src/__tests__/repertoire/tools-remote-safety.test.ts`
  - `src/__tests__/repertoire/tools.test.ts`
  - `src/__tests__/senses/teams.test.ts`
- **Remove (synthetic gate stack + synthetic gate tests/wiring)**
  - `src/nerves/runtime-hardening/cli-main.ts`
  - `src/nerves/runtime-hardening/cli.ts`
  - `src/nerves/runtime-hardening/gate.ts`
  - `src/__tests__/nerves/runtime-hardening-ci-contract.test.ts`
  - `src/__tests__/nerves/runtime-hardening-cli-main.test.ts`
  - `src/__tests__/nerves/runtime-hardening-cli.test.ts`
  - `src/__tests__/nerves/runtime-hardening-gate.test.ts`
  - `scripts/run-runtime-hardening-load-validation.cjs`
  - Runtime-hardening wiring in `scripts/run-coverage-gate.cjs`
  - Runtime-hardening npm scripts in `package.json`:
    - `audit:runtime-hardening`
    - `validate:runtime-hardening:load`
- **Move**
  - None currently approved; synthetic gate stack is removal target, not relocation target, for this pass.
- **Always keep for audit**
  - `slugger/tasks/2026-03-03-1430-planning-ouroboros-migration-single-replica-runtime-hardening.md`
  - `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening.md`
  - `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/*`

Execution verification expectations for cleanup implementation:
- Runtime behavior retained:
  - remote local-tool blocking behavior still enforced
  - teams max-concurrency guardrail still enforced
  - prompt-refresh fallback behavior still enforced
  - non-blocking sink behavior still enforced
- Synthetic gate removed:
  - no `src/nerves/runtime-hardening/*` module remains
  - no runtime-hardening synthetic artifact generation in mandatory coverage gate flow
- Repo quality:
  - full tests pass
  - build passes
  - no warnings

Self-audit (what I got wrong in the recent hardening PR work):
- I introduced synthetic runtime/SLO scaffolding as if it were high-confidence value before validating that it was useful now.
- I placed non-runtime validation/policy logic in runtime-area code (`src`/`nerves`) instead of keeping boundaries clean.
- I made placement and structure decisions before sufficiently collaborating on those decisions.
- I shipped a task package that was broader and messier than necessary for the stated goal.

## Progress Log
- 2026-03-03 20:36 Created
- 2026-03-03 20:41 Captured cleanup principles from user, locked scope boundaries, and added explicit self-audit of mistakes to correct.
- 2026-03-03 20:56 Renamed branch and planning task slug/title to single-replica-hardening-cleanup for clearer traceability to migration topic #18 cleanup.
- 2026-03-03 21:03 Locked cleanup boundary with explicit keep/remove sets: preserve runtime hardening + all task files, remove synthetic runtime-hardening gate scaffolding and mandatory CI wiring.
- 2026-03-03 21:37 Added explicit per-file inventory (keep/remove/move) and implementation verification expectations to eliminate planning ambiguity before doing conversion.
