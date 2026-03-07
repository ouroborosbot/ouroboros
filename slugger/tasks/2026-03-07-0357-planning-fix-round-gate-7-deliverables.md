# Planning: Fix Round Gate 7 Deliverables

**Status**: approved
**Created**: 2026-03-07 03:57

## Goal
Complete Gate 7 by shipping final docs, auditing all skipped tests called out by the master plan, and finishing with clean full verification artifacts.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Implement Gate 7 from the master planning doc on branch `slugger/task-gate-7-deliverables`
- Write `docs/testing-guide.md` with the required end-to-end walkthrough (`ouro up` -> `ouro hatch` -> first chat -> coding spawn -> `ouro msg` round-trip -> heartbeat observation -> `ouro stop`), expected outputs, and troubleshooting
- Update `ARCHITECTURE.md` to reflect post-fix-round architecture: unified process model, body-metaphor subsystem map, removed subsystems, daemon command surface, directory layout, and canonical bundle manifest
- Audit all 18 skipped tests in `src/__tests__/heart/core.test.ts`; unskip+fix active behaviors or annotate deferred cases with `// skip: kick detection deferred per audit`
- Run full gate verification (`npm run lint`, `npm run build`, `npm test --silent`, `npm run test:coverage -- --runInBand`) and capture logs in gate artifacts

### Out of Scope
- New runtime features outside Gate 7 deliverables
- Additional refactors not required for docs/test-audit/final verification
- Rewriting prior gate behavior unless required to satisfy unskipped tests

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

## Open Questions
- [x] None. Gate 7 scope and deliverables are fully specified by the pre-approved master planning doc.

## Decisions Made
- Gate 7 implementation will follow the master execution-gate contract exactly without scope reduction.
- Skipped-test handling is deterministic: active production behavior must be unskipped and fixed; truly deferred behavior must include the exact required audit comment.
- Docs will prioritize operator usability and direct reproducibility over narrative detail.

## Context / References
- /Users/arimendelow/AgentBundles/slugger.ouro/tasks/2026-03-06-1505-planning-hands-on-fix-round-and-post-fix-validation.md
- Execution Gates -> Gate 7: Final Deliverables
- Subsystem audit decisions 1-10 (source of truth for final ARCHITECTURE summary)
- Target files: `docs/testing-guide.md`, `ARCHITECTURE.md`, `src/__tests__/heart/core.test.ts`

## Notes
Gate 7 is the final polish+validation gate. Documentation and test-audit outputs must stand alone with no extra context required.

## Progress Log
- 2026-03-07 03:57 Created and approved for execution per pre-approved master gate plan.
