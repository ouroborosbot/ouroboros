# Planning: Gate 5 Backlog P31 - Tool Result Truncation Limits

**Status**: drafting
**Created**: 2026-03-05 20:06

## Goal
Capture and execute P31 as post-inversion hardening work without reintroducing legacy autonomous-loop coupling.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Reframe archived reflection proposal P31 for current architecture (inner dialog + supervisor + governance/tooling as applicable)
- Define minimally sufficient implementation/tests for this proposal
- Preserve security and governance constraints from current harness

### Out of Scope
- Re-introducing removed autonomous reflection pipeline code
- Broad refactors unrelated to P31

## Completion Criteria
- [ ] Proposal P31 has architecture-aligned implementation scope
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
- Seeded from Gate 5 triage as backlog item P31 (priority: high).

## Context / References
- Source proposal ID: P31
- Canonical slug: `reflection-tool-results-can-be-arbitrarily-large-causing-tran`
- archive source: `ouroboros/tasks/2026-03-05-1214-planning-reflection-tool-results-can-be-arbitrarily-large-causing-tran.md`
- Gate 5 master plan: `self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md`

## Notes
- Triage rationale: Still relevant to protect context window and transport stability.

## Progress Log
- 2026-03-05 20:06 Created from Gate 5 backlog triage
