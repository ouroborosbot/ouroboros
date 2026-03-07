# Planning: Gate 5 Backlog P11 - FriendStore External ID Lookup Optimization

**Status**: drafting
**Created**: 2026-03-05 20:06

## Goal
Capture and execute P11 as post-inversion hardening work without reintroducing legacy autonomous-loop coupling.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Reframe archived reflection proposal P11 for current architecture (inner dialog + supervisor + governance/tooling as applicable)
- Define minimally sufficient implementation/tests for this proposal
- Preserve security and governance constraints from current harness

### Out of Scope
- Re-introducing removed autonomous reflection pipeline code
- Broad refactors unrelated to P11

## Completion Criteria
- [ ] Proposal P11 has architecture-aligned implementation scope
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
- Seeded from Gate 5 triage as backlog item P11 (priority: low).

## Context / References
- Source proposal ID: P11
- Canonical slug: `reflection-friendstore-external-id-lookup-is-o-n-directory-sc`
- archive source: `ouroboros/tasks/2026-03-05-1142-planning-reflection-friendstore-external-id-lookup-is-o-n-directory-sc.md`
- Gate 5 master plan: `self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md`

## Notes
- Triage rationale: Valid optimization but lower urgency than security/hardening work.

## Progress Log
- 2026-03-05 20:06 Created from Gate 5 backlog triage
