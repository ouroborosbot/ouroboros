# Planning: Fix Round Gate 2 Schema And Data Model

**Status**: approved
**Created**: 2026-03-06 23:47

## Goal
Apply Gate 2 schema and contract changes so runtime/state code uses the new task lifecycle model, agent identity schema, friend storage shape, and canonical bundle manifest expectations.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Task status simplification to generic `validating` plus `validator` metadata and new scheduling/requester frontmatter fields
- `agent.json` schema changes (`version`, `enabled`; remove `name`, `configPath`) with config/identity runtime updates
- Friend store collapse to single-path records and friend schema expansion (`role`, `trustLevel`, `connections`)
- Prompt/canonical psyche cuts for removed files
- Canonical bundle manifest definition + non-canonical file detection scaffolding + bundle contract rewrite
- Full test updates for changed contracts

### Out of Scope
- Gate 3 runtime behavior rewrites (`ouro msg`, unified process model, daemon command surface overhaul)
- Gate 4 trust gating/tool additions
- Gate 5 src reorg moves
- Gate 6 first-run/auth/hatchling workflows
- Gate 7 final docs and skipped-tests audit

## Completion Criteria
- [ ] Task statuses and transitions use `validating` (no user-specific validating enums)
- [ ] Task frontmatter supports `validator`, `requester`, `cadence`, `scheduledAt`, `lastRun`
- [ ] `agent.json` runtime contract uses derived agent name and conventional secrets path
- [ ] Friend store uses unified record files in bundle `friends/` directory
- [ ] Canonical psyche/bundle manifest expectations match Gate 2 decisions
- [ ] Bundle skeleton contract test rewritten and passing
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
- [x] None. Gate 2 contract is pre-approved by master planning doc.

## Decisions Made
- Follow the master planning doc Gate 2 section and subsystem audit decisions as source of truth.
- Keep this gate focused on schema/data contracts and associated tests; defer behavior-heavy runtime shifts to Gate 3+.

## Context / References
- /Users/arimendelow/AgentBundles/slugger.ouro/tasks/2026-03-06-1505-planning-hands-on-fix-round-and-post-fix-validation.md (Execution Gates + Subsystem Audit)
- src/tasks/{types.ts,transitions.ts,board.ts,index.ts,parser.ts,middleware.ts}
- src/{identity.ts,config.ts}
- src/mind/friends/{types.ts,store-file.ts,resolver.ts}
- src/mind/prompt.ts
- src/__tests__/nerves/bundle-skeleton.contract.test.ts

## Notes
Gate 2 touches high-fanout contracts. Test-first edits should proceed by subsystem to keep failures scoped and quickly recoverable.

## Progress Log
- 2026-03-06 23:47 Created and approved for execution per pre-approved gate plan.
