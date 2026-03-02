# Planning: Ouroboros Migration — Testing Strategy (Phase 1)

**Status**: NEEDS_REVIEW
**Created**: 2026-03-02 14:04

## Goal
Establish and enforce the testing baseline for the ouroboros migration by formalizing Vitest coverage thresholds and test conventions so all subsequent migration work ships with consistent, verifiable quality controls.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Align `vitest.config.ts` coverage enforcement with the migration requirement of 100% statements, branches, functions, and lines.
- Add CI gating for `npm run test:coverage` so coverage regressions fail automated checks.
- Document mandatory test conventions for migration work in an agent-oriented testing guide that builds on `CONTRIBUTIONS.md` without overloading it.
- Validate test scripts and developer workflow commands for running full tests and coverage checks.
- Add or update tests only when required to satisfy new baseline enforcement introduced in this phase.
- Backfill any legacy coverage gaps that are exposed by threshold enforcement changes in this phase.

### Out of Scope
- Implementing provider abstraction, channels, memory system, daemon, or any migration feature beyond testing baseline setup.
- Large-scale refactors of existing business logic unrelated to testing baseline enforcement.
- Runtime observability or production deployment changes.

## Completion Criteria
- [ ] Vitest configuration enforces 100% coverage thresholds (lines, branches, functions, statements) for applicable source files.
- [ ] CI enforces `npm run test:coverage` as a required gate for relevant changes.
- [ ] Testing strategy guidance for migration work is documented in-repo and reflects current project structure, extending `CONTRIBUTIONS.md` via focused agent-oriented guidance.
- [ ] Test and coverage commands run successfully after updates.
- [ ] Any pre-existing uncovered paths surfaced by threshold enforcement are backfilled to meet the baseline.
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
- [ ] None at this time.

## Decisions Made
- Scope for this planning cycle is limited to the first ordered migration task: Testing Strategy.
- `implementation-order.md` is treated as the source of truth for task sequence.
- Include CI gating for `npm run test:coverage` in this first task.
- Follow existing repository documentation patterns by building on `CONTRIBUTIONS.md` with focused agent-oriented testing guidance, without overloading `CONTRIBUTIONS.md` itself.
- Backfill and close any legacy coverage gaps exposed by threshold enforcement during this phase.

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/implementation-order.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/testing-strategy.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/vitest.config.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/package.json`

## Notes
Current baseline already uses Vitest with V8 coverage and reporters configured; threshold enforcement values are not yet set in `vitest.config.ts`.

## Progress Log
- [2026-03-02 14:04] Created
- [2026-03-02 14:05] Set status to NEEDS_REVIEW
- [2026-03-02 14:06] Corrected Created/Progress Log timestamps
- [PENDING_TIMESTAMP] Incorporated user feedback: include CI gating, CONTRIBUTIONS.md-based guidance, and backfill exposed legacy coverage gaps
