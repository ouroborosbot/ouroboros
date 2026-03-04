# Planning: Ouroboros Migration - Turn Coordinator Locking Refactor

**Status**: approved
**Created**: 2026-03-03 22:17

## Goal
Remove Teams hard reject-on-cap behavior and replace silent same-conversation waiting with explicit steering feedback, using a channel-agnostic turn coordinator for turn ownership.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Remove the global hard reject path in Teams that denies turns based on in-flight cap checks.
- Introduce a channel-agnostic turn coordinator module that serializes turns by conversation/session key.
- Move current per-conversation lock behavior out of `src/senses/teams.ts` into the shared coordinator.
- Update Teams integration to use the shared coordinator and preserve single active-turn ownership per conversation.
- Add explicit steering follow-up behavior: when a same-conversation message arrives during an active turn, emit immediate deterministic feedback and treat the message as steering input (not silent waiting).
- Remove `teamsChannel.maxConcurrentConversations` entirely from config/types/defaults/tests and runtime code paths.
- Update tests to validate coordinator behavior, steering feedback behavior, and hard reject removal.

### Out of Scope
- Load balancer, multi-replica routing, or infrastructure-level scaling changes.
- Distributed locking across replicas/processes.
- Changes to unrelated CLI rendering or prompt/tool behavior.

## Completion Criteria
- [ ] Teams no longer hard-rejects messages based on a static concurrent-turn cap.
- [ ] `teamsChannel.maxConcurrentConversations` is fully removed from config schema/defaults/accessors and call sites.
- [ ] A shared turn coordinator exists and is used by Teams for per-conversation serialization.
- [ ] Same-conversation mid-turn follow-up messages receive immediate steering feedback (no silent queue UX).
- [ ] Single active-turn ownership per conversation is preserved; different conversations remain parallelizable.
- [ ] Existing confirmation flow remains deadlock-safe with the coordinator in place.
- [ ] Tests are updated to cover coordinator contract, steering feedback behavior, and removed cap behavior.
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
- None.

## Decisions Made
- Remove app-level hard reject-on-cap behavior from runtime request handling.
- Remove `teamsChannel.maxConcurrentConversations` entirely (no deprecated/no-op compatibility field).
- Keep single active-turn correctness constraints and make them channel-agnostic via a shared turn coordinator.
- Replace silent waiting UX with explicit steering follow-up feedback for same-conversation mid-turn messages.
- Treat load-balancing/replica-scale solutions as infrastructure concerns outside this code task.

## Context / References
- `src/senses/teams.ts` (`withConversationLock`, in-flight cap gate in `handleTeamsMessage`)
- `src/__tests__/senses/teams.test.ts` (serialization and cap tests)
- `src/config.ts` and `src/__tests__/config.test.ts` (teams channel config schema/defaults)
- Prior completed cleanup task docs:
  - `slugger/tasks/2026-03-03-2036-planning-ouroboros-migration-single-replica-hardening-cleanup.md`
  - `slugger/tasks/2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup.md`

## Notes
Default proposal: implement a shared coordinator utility keyed by `{channel}:{conversationId}` and have Teams call into it instead of owning lock maps directly, with explicit steering feedback path for same-conversation mid-turn messages.

## Progress Log
- 2026-03-03 22:17 Created.
- 2026-03-03 22:29 Locked full removal of `teamsChannel.maxConcurrentConversations` and removed compatibility/deprecation path from scope.
- 2026-03-04 10:48 Planning approved.
- 2026-03-04 10:54 Updated plan to require explicit steering follow-up feedback for same-conversation mid-turn messages (no silent queue UX).
