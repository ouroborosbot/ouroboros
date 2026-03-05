# Planning: Ouroboros Self-Perpetuating Realignment

**Status**: drafting
**Created**: pending-initial-commit-timestamp

## Goal
Stabilize and realign Ouroboros so agents can use the harness to improve themselves safely and continuously, instead of the harness hardcoding a brittle model-driven pipeline.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Audit and fix the reflect -> plan -> do -> merge handoff so it follows `work-planner`, `work-doer`, and `work-merger` gate semantics instead of bypassing them.
- Relocate shared governance docs (`ARCHITECTURE`, `CONSTITUTION`) out of `ouroboros/` to a shared location and enforce agent preflight loading.
- Clean and consolidate reflection proposal debris from `ouroboros/tasks/` into `slugger/tasks/` with deduplication and actionable grouping.
- Add interruption/resume state so in-progress autonomous work recovers cleanly after stop/restart.
- Recalibrate constitution classification policy and reflection classification logic so additive work is default `within-bounds`, structural changes remain `requires-review`.
- Add fallback backlog intake from `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration.md` when local actionable tasks are exhausted.
- Preserve shipped-code-first behavior: proposals and plans must lead to executable doing docs and verified code changes.

### Out of Scope
- Full removal of human approval gates for planner/doer in this phase.
- Product rebranding implementation (`*.ouro` directory migration) beyond alignment needed for task routing and references.
- New provider feature work not required for autonomous growth reliability.

## Completion Criteria
- [ ] A documented and tested orchestration contract exists for how agents invoke `work-planner` -> `work-doer` -> `work-merger` without shortcutting review gates.
- [ ] Shared governance docs are moved to agreed shared location and referenced by all participating agents before work starts.
- [ ] Existing reflection task corpus is triaged, deduplicated, and rewritten/moved into correct agent task path with clear statuses.
- [ ] Resume state persists enough information to continue interrupted work from the last safe checkpoint.
- [ ] Constitution classification guidance and trigger classification behavior are aligned and validated against representative proposals.
- [ ] Backlog fallback to migration task file is implemented and documented.
- [ ] `npm test` passes in this branch after changes.
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
- [ ] Final shared location decision for governance docs: repo root (`/ARCHITECTURE.md`, `/CONSTITUTION.md`) vs a shared docs namespace.
- [ ] Governance ownership contract: should `CONSTITUTION` remain human-only editable, or can agents propose edits via gated workflow.
- [ ] Proposal cleanup policy: keep all original `ouroboros/tasks` docs as archived artifacts vs replace with canonical consolidated docs.
- [ ] Scope target for first autonomous operator: `ouroboros` only vs a generic multi-agent task protocol from the start.

## Decisions Made
- Work for this task is tracked under `slugger/tasks/` because current branch agent context is `slugger/*`.
- The objective is capability-first (code the agent can use), not prescriptive automation-first (code that uses the agent).
- Pipeline recovery starts with correctness and gate compliance before autonomy expansion.
- Additive hardening changes default toward `within-bounds`; architectural boundary changes remain `requires-review`.
- No environment-variable-based configuration will be introduced.

## Context / References
- `src/reflection/autonomous-loop.ts`
- `src/reflection/trigger.ts`
- `src/reflection/loop-entry.ts`
- `subagents/work-planner.md`
- `subagents/work-doer.md`
- `subagents/work-merger.md`
- `ouroboros/ARCHITECTURE.md`
- `ouroboros/CONSTITUTION.md`
- `ouroboros/tasks/`
- `slugger/tasks/`
- `tasks/ongoing/2026-02-28-1900-ouroboros-migration/branding-and-worldbuilding.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration.md`

## Notes
Current branch baseline is green (`npm test`: 50 files passed, 1474 tests total, 1456 passed, 18 skipped), so red-state recovery likely requires explicit audit of `main` and/or the incorrectly merged PR lineage.

## Progress Log
- [pending git timestamp] Created
