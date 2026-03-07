# Planning: Fix Round Gate 1 Cuts And Cleanup

**Status**: NEEDS_REVIEW
**Created**: 2026-03-06 23:18

## Goal
Delete dead subsystems and stale repository artifacts from Gate 1 so later gates build on a smaller, cleaner codebase with no dangling references.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Remove dead production code called out in Gate 1 (governance, supervisor, pipeline, cron scheduler, workspace provisioning, stale memory/import helpers)
- Remove/update imports and exports that reference deleted code
- Delete tests tied only to deleted production files
- Perform root cleanup (delete/move files and directories listed in Gate 1)
- Merge useful `CONSTITUTION.md` guidance into `AGENTS.md`, then remove `CONSTITUTION.md`
- Update `.gitignore` with `coverage/` and `dist/`
- Update `package.json` scripts per Gate 1 contract

### Out of Scope
- Any Gate 2+ schema or runtime behavior changes
- New feature additions
- Non-Gate-1 architecture refactors

## Completion Criteria
- [ ] All Gate 1 removals and file moves are complete
- [ ] No production or test references remain to deleted code
- [ ] `package.json` script surface matches Gate 1 requirements
- [ ] Root cleanup and docs consolidation are complete
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
- [ ] None

## Decisions Made
- Follow the master planning doc subsystem audit and Gate 1 execution section as source of truth.
- Execute Gate 1 only on branch `slugger/task-gate-1-cuts`.
- Preserve existing behavior except where dead code removal requires import/script cleanup.

## Context / References
- /Users/arimendelow/AgentBundles/slugger.ouro/tasks/2026-03-06-1505-planning-hands-on-fix-round-and-post-fix-validation.md
- /Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md

## Notes
Gate 1 is pure cuts and cleanup intended to reduce complexity before schema/runtime gates.

## Progress Log
- 2026-03-06 23:18 Created
