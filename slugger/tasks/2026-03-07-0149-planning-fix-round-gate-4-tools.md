# Planning: Fix Round Gate 4 Tools, Memory, and Trust

**Status**: approved
**Created**: 2026-03-07 01:49

## Goal
Implement Gate 4 tooling and trust-contract changes so memory/friend workflows are explicit, trust gating is enforced before model calls, and canonical bundle hygiene nudges are wired to runtime startup behavior.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Add `memory_save` tool for explicit fact writes to `facts.jsonl` with embedding-at-write and graceful degradation
- Add `get_friend_note` tool for targeted lookup of any friend record
- Add embedding fallback behavior in memory search when embeddings are missing/empty
- Update system prompt memory/friend guidance to first-person prescriptive contracts
- Implement trust-level enforcement (`family`, `friend`, `acquaintance`, `stranger`) in sense-layer gates before any LLM invocation
- Implement stranger one-time auto-reply tracking and silent-drop follow-ups with primary notification wiring
- Add `ouro link <agent> --friend <id> --provider <provider> --external-id <externalId>` command surface
- Implement hatchling first-imprint trust assignment (`family`) for first contact
- Wire canonical-manifest non-canonical-file nudge into startup/inner-dialog path
- Add/adjust tests for all new Gate 4 behavior with strict TDD and full new-code coverage

### Out of Scope
- Gate 5 file-system/source-tree reorganization
- Gate 6 first-run adoption specialist and hatch flow UX
- Gate 7 docs deliverables and skipped-tests audit finalization

## Completion Criteria
- [ ] `memory_save` and `get_friend_note` tools are implemented and tested end-to-end
- [ ] Embedding absence in memory paths degrades gracefully without hard failures
- [ ] Sense-layer trust gating prevents stranger traffic from reaching the LLM
- [ ] Stranger one-time auto-reply + subsequent silent-drop behavior is persisted and tested
- [ ] `ouro link` command writes expected friend identity links and is validated in tests
- [ ] Startup nudge for non-canonical bundle files is emitted and tested
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
- [x] None. Gate 4 behavior is fixed by the master planning doc's subsystem audit and Execution Gates section.

## Decisions Made
- Use explicit tool calls (`memory_save`, `get_friend_note`) as the only write/read extension path instead of marker-based implicit extraction.
- Enforce trust-level stranger gating as a hard pre-LLM code path in senses.
- Keep Gate 4 tightly scoped to tools/memory/trust behavior; defer structural/source moves to Gate 5.

## Context / References
- /Users/arimendelow/AgentBundles/slugger.ouro/tasks/2026-03-06-1505-planning-hands-on-fix-round-and-post-fix-validation.md
- src/mind/{memory.ts,prompt.ts,friends/**}
- src/repertoire/tools.ts and tool registration/execution paths
- src/senses/{cli.ts,teams.ts,inner-dialog.ts}
- src/daemon/daemon-cli.ts and command parsing/routing surfaces

## Notes
Gate 4 introduces security-sensitive sense-layer behavior; tests must prove no stranger path reaches model call sites.

## Progress Log
- 2026-03-07 01:49 Created and approved for execution per pre-approved master gate plan.
