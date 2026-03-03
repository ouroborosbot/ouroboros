# Planning: Rename Observability Namespace to Nerves

**Status**: NEEDS_REVIEW
**Created**: 2026-03-03 13:41

## Goal
Rename the repository's observability namespace from `observability` to `nerves` so terminology aligns with the project's body-system naming conventions.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Rename source namespace and paths from `src/observability/` to `src/nerves/`.
- Update all runtime imports/exports referencing `observability` to `nerves`.
- Update test imports/paths from observability to nerves, including coverage/audit helpers.
- Update npm scripts, build entrypoints, and any generated path references tied to the old namespace.
- Update documentation references where `observability` is used as the subsystem name for this code path.
- Ensure task docs in `slugger/tasks` that reference old file paths are updated where materially incorrect.
- Preserve existing event schema, event names, and logging behavior (rename only, not behavior change).

### Out of Scope
- Redesigning logging schema, event taxonomy, or sink behavior.
- Adding new observability/nerves features unrelated to naming alignment.
- Rewriting historical prose that references "observability" conceptually where path-level correctness is not required.

## Completion Criteria
- [ ] `src/observability/` is fully renamed to `src/nerves/` (or equivalent file move) with no orphaned runtime usage.
- [ ] Runtime code compiles and uses `nerves` import paths consistently.
- [ ] Test suite references `nerves` paths and passes without alias shims.
- [ ] Coverage and observability audit gates remain green after rename.
- [ ] Documentation/path references required for current workflows are updated to the new namespace.
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
- [ ] Should the top-level coverage command name `audit:observability` also be renamed now (e.g. `audit:nerves`) or kept for compatibility in this task?

## Decisions Made
- Namespace name is locked to `nerves` (not `nervous-system`) for code paths and module naming.
- This task must follow strict planner/doer/merger gates on an agent branch (`slugger/nerves-rename`).
- Branch naming should follow `<agent>/<slug>`; avoid `codex/<agent>` prefix for this repo workflow.

## Context / References
- `/Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/slugger/tasks/2026-03-02-1501-planning-ouroboros-migration-observability.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/slugger/tasks/2026-03-02-1501-doing-ouroboros-migration-observability.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/package.json`

## Notes
This is intentionally a naming/structure migration task. Behavioral parity is required unless a follow-up decision explicitly expands scope.

## Progress Log
- [2026-03-03 13:41] Created planning doc for nerves namespace rename.
