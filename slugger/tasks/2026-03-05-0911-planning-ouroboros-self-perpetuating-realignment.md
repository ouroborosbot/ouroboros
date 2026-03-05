# Planning: Ouroboros Self-Perpetuating Realignment

**Status**: NEEDS_REVIEW
**Created**: 2026-03-05 09:12

## Goal
Stabilize and realign Ouroboros so agents can use the harness to improve themselves safely and continuously, instead of the harness hardcoding a brittle model-driven pipeline.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Audit and fix the reflect -> plan -> do -> merge handoff so it follows `work-planner`, `work-doer`, and `work-merger` gate semantics instead of bypassing them.
- Audit and unwind undesired self-perpetuating-run commits that landed directly on `main`, restoring `main` health while preserving traceability.
- Salvage valuable attempted work from the reverted set and reincorporate it through the correct `slugger/tasks` planning-doing flow with quality gates.
- Implement `.ouro` bundle support as first-class architecture for multi-agent residency, including initial `ouroboros.ouro` and `slugger.ouro` pathing conventions.
- Enable independent git control inside `.ouro` bundles so each bundle can back itself up to a private GitHub repo when user auth is available.
- Add `.ouro` bundle paths to harness `.gitignore` so harness-origin commits never accidentally upload bundle internals.
- Relocate shared governance docs (`ARCHITECTURE`, `CONSTITUTION`) out of `ouroboros/` to a shared location and enforce agent preflight loading.
- Clean and consolidate only the initial self-perpetuating-run reflection proposal debris from `ouroboros/tasks/` into `slugger/tasks/` with deduplication and actionable grouping, while preserving unrelated valid historical task docs in place.
- Add interruption/resume state so in-progress autonomous work recovers cleanly after stop/restart.
- Recalibrate constitution classification policy and reflection classification logic so additive work is default `within-bounds`, structural changes remain `requires-review`.
- Add fallback backlog intake from `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration.md` when local actionable tasks are exhausted.
- Preserve shipped-code-first behavior: proposals and plans must lead to executable doing docs and verified code changes.

### Out of Scope
- Full removal of human approval gates for planner/doer in this phase.
- Full migration of every historical agent artifact into `.ouro` bundles in this phase; only the approved initial bundle path and controls are required.
- New provider feature work not required for autonomous growth reliability.

## Completion Criteria
- [ ] A documented and tested orchestration contract exists for how agents invoke `work-planner` -> `work-doer` -> `work-merger` without shortcutting review gates.
- [ ] A commit-level recovery map identifies which `main` commits from the initial self-perpetuating run are to be reverted vs salvaged.
- [ ] `main` rollback is completed via explicit revert commits (no history rewrite), and post-revert validation confirms healthy baseline.
- [ ] Valuable attempted work from the reverted set is re-landed through approved planning/doing docs under `slugger/tasks`.
- [ ] `.ouro` bundle structure is implemented for the initial agent set and documented as the default pattern for future agents.
- [ ] `.ouro` bundles support independent git initialization/backup flow to private GitHub repos when user auth is present.
- [ ] Harness `.gitignore` explicitly excludes `.ouro` bundle internals to prevent accidental upload from harness commits.
- [ ] Shared governance docs are moved to agreed shared location and referenced by all participating agents before work starts.
- [ ] Initial self-perpetuating-run reflection artifacts are triaged, deduplicated, and rewritten/moved into correct agent task path with clear statuses, without disrupting valid pre-existing `ouroboros/tasks` work.
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
- [ ] Confirm exact rollback boundary on `main` for the initial self-perpetuating run (candidate start: commit `e3ecc1c`, March 5, 2026).
- [ ] Confirm initial `.ouro` bundle root location convention (repo root vs dedicated top-level bundle directory) before implementation lands.
- [ ] Final shared location decision for governance docs: repo root (`/ARCHITECTURE.md`, `/CONSTITUTION.md`) vs a shared docs namespace.
- [ ] Governance ownership contract: should `CONSTITUTION` remain human-only editable, or can agents propose edits via gated workflow.
- [ ] For the targeted initial-run artifact subset, decide archival policy: keep originals as archived artifacts vs replace with canonical consolidated docs.
- [ ] Scope target for first autonomous operator: `ouroboros` only vs a generic multi-agent task protocol from the start.

## Decisions Made
- Work for this task is tracked under `slugger/tasks/` because current branch agent context is `slugger/*`.
- The objective is capability-first (code the agent can use), not prescriptive automation-first (code that uses the agent).
- Pipeline recovery starts with correctness and gate compliance before autonomy expansion.
- Recovery scope includes repairing `main` by reverting undesired initial self-perpetuating-run commits, then re-incorporating worthwhile changes through the proper task workflow.
- `.ouro` bundle implementation is explicitly in scope for this task, including independent git control and harness-level ignore protections.
- Additive hardening changes default toward `within-bounds`; architectural boundary changes remain `requires-review`.
- No environment-variable-based configuration will be introduced.
- Valid historical task files under `ouroboros/tasks/` are preserved; cleanup/migration applies only to initial self-perpetuating-run artifacts.

## Context / References
- `main` commit window candidate: `e3ecc1c`..`448cfcd` (March 5, 2026 initial self-perpetuating run)
- `.gitignore`
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
`main` currently includes a dense run of March 5, 2026 self-perpetuating commits (many `docs(tasks)` plus reflection-loop edits). This plan now treats rollback + selective salvage as first-class scope.

## Progress Log
- 2026-03-05 09:12 Created
- 2026-03-05 09:14 Narrowed task-file cleanup scope to initial self-perpetuating-run artifacts; preserve valid historical ouroboros tasks
- 2026-03-05 09:15 Added main rollback + salvage/reincorporation scope for initial self-perpetuating-run commits
