# Planning: Fix Round Gate 5 src Reorg

**Status**: approved
**Created**: 2026-03-07 02:35

## Goal
Execute Gate 5 as a pure structural refactor, moving source and test files to the target `src/` layout while preserving runtime behavior and ensuring all imports/entrypoints remain valid.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Move files/directories per Gate 5 reorg table from the master planning doc
- Update all production imports and re-exports affected by moved files
- Move/retarget tests to mirror the new `src/` layout and update test imports
- Update `package.json` entrypoint/script paths impacted by the reorg
- Verify repo scripts for stale path references after the reorg and fix them
- Validate no functional behavior regressions (pure refactor expectation)

### Out of Scope
- Gate 6 first-run UX and Adoption Specialist implementation
- Gate 7 docs/testing deliverables and skipped-test audit
- New feature work beyond path/import/script refactor required for Gate 5

## Completion Criteria
- [ ] `src/` layout matches the approved Gate 5 target structure
- [ ] All moved production files compile from new paths with no stale imports
- [ ] Test layout mirrors reorg and all moved tests pass from new locations
- [ ] `package.json` scripts and entrypoint references are updated and valid
- [ ] Refactor remains behavior-preserving (no intentional runtime contract changes)
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
- [x] None. Gate 5 scope and move table are fixed by the pre-approved master planning doc.

## Decisions Made
- Gate 5 will be executed as a strict pure-refactor pass: move/update only, no net feature expansion.
- File and test moves will follow the Gate 5 table from the master doc exactly.
- Any path discrepancies found during validation are resolved in Gate 5 rather than deferred.

## Context / References
- /Users/arimendelow/AgentBundles/slugger.ouro/tasks/2026-03-06-1505-planning-hands-on-fix-round-and-post-fix-validation.md
- Gate 5 section (`Execution Gates -> Gate 5: src/ Reorg`)
- Reorg table in `Scope -> src/ Reorg`
- `package.json`, `scripts/`, and `src/__tests__/` path mappings

## Notes
Gate 5 is a topology change gate. Safety comes from incremental move+fix cycles and full-suite validation after all path updates.

## Progress Log
- 2026-03-07 02:35 Created and approved for execution per pre-approved master gate plan.
