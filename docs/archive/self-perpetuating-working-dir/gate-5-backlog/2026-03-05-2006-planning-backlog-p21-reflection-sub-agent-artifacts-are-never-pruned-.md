# Planning: Gate 5 Backlog P21 - Sub-agent Artifact Pruning Policy

**Status**: drafting
**Created**: 2026-03-05 20:06

## Goal
Capture and execute P21 as post-inversion hardening work without reintroducing legacy autonomous-loop coupling.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Reframe archived reflection proposal P21 for current architecture (inner dialog + supervisor + governance/tooling as applicable)
- Define minimally sufficient implementation/tests for this proposal
- Preserve security and governance constraints from current harness

### Out of Scope
- Re-introducing removed autonomous reflection pipeline code
- Broad refactors unrelated to P21

## Completion Criteria
- [ ] Proposal P21 has architecture-aligned implementation scope
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
- Seeded from Gate 5 triage as backlog item P21 (priority: medium).

## Context / References
- Source proposal ID: P21
- Canonical slug: `reflection-reflection-sub-agent-artifacts-are-never-pruned-so`
- archive source: `ouroboros/tasks/2026-03-05-1150-planning-reflection-reflection-sub-agent-artifacts-are-never-pruned-so.md`
- Gate 5 master plan: `self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md`

## Notes
- Triage rationale: Still relevant for long-running autonomous hygiene.

## Progress Log
- 2026-03-05 20:06 Created from Gate 5 backlog triage
