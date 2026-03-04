# Planning: Runtime Cleanup Pass

**Status**: drafting
**Created**: 2026-03-03 20:36

## Goal
Define the exact cleanup problem in the current repo state and produce an approved, testable plan for fixing only the agreed issues.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Capture your exact problem statement and constraints with no assumptions.
- Identify precise file-level cleanup targets based on your direction.
- Define acceptance criteria that verify the cleanup is correct.
- Produce an approval-ready planning doc for this cleanup task.

### Out of Scope
- Implementing any code changes before planning approval.
- Starting unrelated migration topics.
- Adding new architecture or policy not explicitly requested.

## Completion Criteria
- [ ] Problem statement is explicitly documented and approved by you.
- [ ] Cleanup scope is locked to specific files/behaviors and approved by you.
- [ ] Validation criteria are concrete and testable.
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
- [ ] What exact outcomes do you want from this cleanup pass?
- [ ] Which current files/changes do you consider "nonsense" and why?
- [ ] Which existing behavior must remain untouched during cleanup?
- [ ] What evidence will count as "cleaned up correctly" for signoff?

## Decisions Made
- Start new planning doc (do not resume previous completed planning docs).
- Use git history as context baseline before interview.
- Make no cleanup assumptions before your explicit direction.

## Context / References
- `/Users/arimendelow/Projects/ouroboros-agent-harness` current branch: `slugger/runtime-cleanup-pass`
- Recent history checked: `e613c72`, `c880a06`, `a43d583` and prior task completion commits on `main`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md`

## Notes
Starting from current `main` state (including reverts already applied). Cleanup definition will come from your answers below.

## Progress Log
- 2026-03-03 20:36 Created
