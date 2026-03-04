# Planning: Runtime Cleanup Pass

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
- Produce an explicit self-audit of mistakes made in that task and map each to corrective action.
- Define file-level acceptance checks proving unrelated work remains untouched.

### Out of Scope
- Re-doing the entire migration topic from scratch.
- Modifying work that was not made in the runtime/deployment-hardening task being cleaned up.
- Introducing new architecture/policy not explicitly approved during this planning thread.
- Implementing any code changes before planning approval.

## Completion Criteria
- [ ] Cleanup principles are locked: remove non-value changes and relocate misplaced changes.
- [ ] Scope boundary is locked: only task-owned runtime/deployment-hardening changes are touched.
- [ ] A file-by-file cleanup inventory exists with disposition per item: keep/remove/move.
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
- [ ] Confirm exact candidate change-set boundary for cleanup (which commits/files are included).
- [ ] Confirm signoff artifact format (short rationale table vs detailed per-file notes).

## Decisions Made
- Start new planning doc (do not resume previous completed planning docs).
- Use git history as context baseline before interview.
- Make no cleanup assumptions before your explicit direction.
- This is a cleanup pass, not a redo of the whole topic.
- Priority order is locked: (1) remove non-value changes, (2) move misplaced changes.
- Do not touch changes outside the runtime/deployment-hardening task footprint.

## Context / References
- `/Users/arimendelow/Projects/ouroboros-agent-harness` current branch: `slugger/runtime-cleanup-pass`
- Recent history checked: `e613c72`, `c880a06`, `a43d583` and prior task completion commits on `main`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md`

## Notes
Starting from current `main` state (including reverts already applied).

Self-audit (what I got wrong in the recent hardening PR work):
- I introduced synthetic runtime/SLO scaffolding as if it were high-confidence value before validating that it was useful now.
- I placed non-runtime validation/policy logic in runtime-area code (`src`/`nerves`) instead of keeping boundaries clean.
- I made placement and structure decisions before sufficiently collaborating on those decisions.
- I shipped a task package that was broader and messier than necessary for the stated goal.

## Progress Log
- 2026-03-03 20:36 Created
