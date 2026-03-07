# Planning: Gate 5 Backlog P07 - Context Trimming Contract Tests

**Status**: drafting
**Created**: 2026-03-05 20:06

## Goal
Capture and execute P07 as post-inversion hardening work without reintroducing legacy autonomous-loop coupling.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Reframe archived reflection proposal P07 for current architecture (inner dialog + supervisor + governance/tooling as applicable)
- Define minimally sufficient implementation/tests for this proposal
- Preserve security and governance constraints from current harness

### Out of Scope
- Re-introducing removed autonomous reflection pipeline code
- Broad refactors unrelated to P07

## Completion Criteria
- [ ] Proposal P07 has architecture-aligned implementation scope
- [ ] Associated tests/contracts are defined and passing
- [ ] Security/governance implications are addressed where applicable
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
- [ ] Should this proposal be bundled with related backlog items during implementation?

## Decisions Made
- Seeded from Gate 5 triage as backlog item P07 (priority: medium).

## Context / References
- Source proposal ID: P07
- Canonical slug: `reflection-context-window-trimming-has-no-contract-tests-to-e`
- archive source: `ouroboros/tasks/2026-03-05-1121-planning-reflection-context-window-trimming-has-no-contract-tests-to-e.md`
- Gate 5 master plan: `self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md`

## Notes
- Triage rationale: Still valuable to lock in trimming behavior and prevent regressions.

## Progress Log
- 2026-03-05 20:06 Created from Gate 5 backlog triage
