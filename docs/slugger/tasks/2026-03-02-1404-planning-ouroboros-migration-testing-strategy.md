# Planning: Ouroboros Migration — Testing Strategy (Phase 1)

**Status**: NEEDS_REVIEW
**Created**: 

## Goal
Establish and enforce the testing baseline for the ouroboros migration by formalizing Vitest coverage thresholds and test conventions so all subsequent migration work ships with consistent, verifiable quality controls.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Align `vitest.config.ts` coverage enforcement with the migration requirement of 100% statements, branches, functions, and lines.
- Document mandatory test conventions for new migration modules (test file placement, mocking patterns, and isolation rules) in repository docs.
- Validate test scripts and developer workflow commands for running full tests and coverage checks.
- Add or update tests only when required to satisfy new baseline enforcement introduced in this phase.

### Out of Scope
- Implementing provider abstraction, channels, memory system, daemon, or any migration feature beyond testing baseline setup.
- Large-scale refactors of existing business logic unrelated to testing baseline enforcement.
- Runtime observability or production deployment changes.

## Completion Criteria
- [ ] Vitest configuration enforces 100% coverage thresholds (lines, branches, functions, statements) for applicable source files.
- [ ] Testing strategy guidance for migration work is documented in-repo and reflects current project structure.
- [ ] Test and coverage commands run successfully after updates.
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
- [ ] Should this first task also include introducing CI gating for `npm run test:coverage`, or remain local workflow only for now?
- [ ] Should we codify conventions in an existing doc (if present) or create a new `docs/testing-strategy.md` style reference in this repo?
- [ ] Should this phase include backfilling any currently uncovered legacy files if threshold enforcement exposes pre-existing gaps?

## Decisions Made
- Scope for this planning cycle is limited to the first ordered migration task: Testing Strategy.
- `implementation-order.md` is treated as the source of truth for task sequence.

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/implementation-order.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/testing-strategy.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/vitest.config.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/package.json`

## Notes
Current baseline already uses Vitest with V8 coverage and reporters configured; threshold enforcement values are not yet set in `vitest.config.ts`.

## Progress Log
- [] Created
