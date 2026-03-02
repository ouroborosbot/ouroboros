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
- Define mandatory test convention documentation locations up front: keep `CONTRIBUTING.md` as the concise entry point and add a dedicated cross-agent testing conventions doc at `docs/cross-agent/testing-conventions.md`.
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
- [ ] Mandatory test convention documentation is finalized at `docs/cross-agent/testing-conventions.md`, with `CONTRIBUTING.md` containing concise entry-point guidance and a link to that doc.
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
- Use `CONTRIBUTING.md` as the concise contributor entry point and place detailed mandatory testing conventions in `docs/cross-agent/testing-conventions.md` to avoid overloading the top-level contributor guide.
- Backfill and close any legacy coverage gaps exposed by threshold enforcement during this phase.

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/implementation-order.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/testing-strategy.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/vitest.config.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/package.json`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/CONTRIBUTING.md`

## Notes
Current baseline already uses Vitest with V8 coverage and reporters configured; threshold enforcement values are not yet set in `vitest.config.ts`.

## Progress Log
- [2026-03-02 14:04] Created
- [2026-03-02 14:05] Set status to NEEDS_REVIEW
- [2026-03-02 14:06] Corrected Created/Progress Log timestamps
- [2026-03-02 14:09] Incorporated user feedback: include CI gating, CONTRIBUTIONS.md-based guidance, and backfill exposed legacy coverage gaps
- [2026-03-02 14:13] Defined upfront documentation location for mandatory test conventions (CONTRIBUTING.md entry point + docs/cross-agent/testing-conventions.md)
- [2026-03-02 14:18] Renamed shared conventions target to docs/cross-agent/testing-conventions.md for clearer cross-agent ownership
