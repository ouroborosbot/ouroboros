# Planning: Fix Round Gate 6 First Run

**Status**: approved
**Created**: 2026-03-07 02:55

## Goal
Implement the complete Gate 6 first-run experience: Adoption Specialist bundle integration, `ouro hatch` onboarding flow, smart bare `ouro` routing, and `npx ouro.bot` wrapper behavior.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Implement Gate 6 first-run UX requirements from the master planning doc
- Copy pre-authored Adoption Specialist identities from `~/AgentBundles/AdoptionSpecialist.ouro/psyche/identities/` into repo-shipped bundle (no generated identity content)
- Implement/finish `ouro hatch` auth+verification flow and hatchling bundle creation contract
- Implement smart bare `ouro` routing (0 agents -> hatch, 1 -> chat, many -> choose)
- Implement `npx ouro.bot` thin wrapper path to `@ouro.bot/cli`
- Add/update tests covering first-run routing, hatch behavior, and specialist identity loading
- Run full gate validation and keep build/lint/tests clean

### Out of Scope
- Gate 7 docs deliverables (`docs/testing-guide.md`, `ARCHITECTURE.md` refresh, skipped-tests audit)
- New feature expansion beyond Gate 6 contract
- Creative writing of new specialist identities

## Completion Criteria
- [ ] Adoption Specialist bundle in repo includes copied pre-authored identity files and random identity selection behavior
- [ ] `ouro hatch` performs provider auth/verification flow and creates canonical hatchling bundle with required defaults
- [ ] Bare `ouro` routes correctly based on discovered-agent count
- [ ] `npx ouro.bot` first-run wrapper delegates correctly to CLI flow
- [ ] Gate 6 tests cover first-run contracts and pass
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
- [x] None. Gate 6 behavior is fully specified in the pre-approved master planning doc.

## Decisions Made
- Gate 6 implementation follows the master doc exactly with no scope reductions.
- Specialist identity content is copied from the pre-authored source and never generated.
- First-run flow remains CLI-first (auth before chat), matching subsystem audit decisions.

## Context / References
- /Users/arimendelow/AgentBundles/slugger.ouro/tasks/2026-03-06-1505-planning-hands-on-fix-round-and-post-fix-validation.md
- Execution Gates -> Gate 6: First-Run UX
- Subsystem audit sections 6 and 8 (daemon + bundles/identity)
- Adoption Specialist identity source: `/Users/arimendelow/AgentBundles/AdoptionSpecialist.ouro/psyche/identities/`

## Notes
Gate 6 is contract-heavy and user-facing. We prioritize deterministic onboarding behavior and strong tests over cosmetic expansion.

## Progress Log
- 2026-03-07 02:55 Created and approved for execution per pre-approved master gate plan.
