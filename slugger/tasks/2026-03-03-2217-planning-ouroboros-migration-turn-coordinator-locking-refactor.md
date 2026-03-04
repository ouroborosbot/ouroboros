# Planning: Ouroboros Migration - Turn Coordinator Locking Refactor

**Status**: NEEDS_REVIEW
**Created**: 2026-03-03 22:17

## Goal
Remove Teams hard reject-on-cap behavior and replace silent same-conversation waiting with model-visible steering behavior, using a channel-agnostic turn coordinator for turn ownership.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Remove the global hard reject path in Teams that denies turns based on in-flight cap checks.
- Introduce a channel-agnostic turn coordinator module that serializes turns by conversation/session key.
- Move current per-conversation lock behavior out of `src/senses/teams.ts` into the shared coordinator.
- Update Teams integration to use the shared coordinator and preserve single active-turn ownership per conversation.
- Add explicit steering follow-up behavior: when same-conversation messages arrive during an active turn, capture all follow-ups in order and inject them into the active turn between model calls.
- Ensure steering path sends no adapter-authored plain-text acknowledgements; plain-text shown to the user for steering outcomes must come from model output.
- Remove `teamsChannel.maxConcurrentConversations` entirely from config/types/defaults/tests and runtime code paths.
- Update tests to validate coordinator behavior, all-follow-ups steering injection behavior, and hard reject removal.

### Out of Scope
- Load balancer, multi-replica routing, or infrastructure-level scaling changes.
- Distributed locking across replicas/processes.
- Changes to unrelated CLI rendering or prompt/tool behavior.

## Completion Criteria
- [ ] Teams no longer hard-rejects messages based on a static concurrent-turn cap.
- [ ] `teamsChannel.maxConcurrentConversations` is fully removed from config schema/defaults/accessors and call sites.
- [ ] A shared turn coordinator exists and is used by Teams for per-conversation serialization.
- [ ] Same-conversation follow-up messages during active turns are all preserved and injected into the active turn between model calls.
- [ ] Steering path introduces no adapter-authored plain-text acknowledgement messages to users.
- [ ] Model receives all follow-up user messages for steering (none dropped).
- [ ] Single active-turn ownership per conversation is preserved; different conversations remain parallelizable.
- [ ] Existing confirmation flow remains deadlock-safe with the coordinator in place.
- [ ] Tests are updated to cover coordinator contract, steering injection contract, and removed cap behavior.
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
- Steering semantics are `preserve-all`: every follow-up user message during an active turn is retained and injected for model visibility (no last-wins dropping).
- Steering path must not emit adapter-authored plain text; user-visible plain text for steering outcomes must come from model output.
- Treat load-balancing/replica-scale solutions as infrastructure concerns outside this code task.

## Context / References
- `src/senses/teams.ts` (`withConversationLock`, in-flight cap gate in `handleTeamsMessage`)
- `src/__tests__/senses/teams.test.ts` (serialization and cap tests)
- `src/config.ts` and `src/__tests__/config.test.ts` (teams channel config schema/defaults)
- Prior completed cleanup task docs:
  - `slugger/tasks/2026-03-03-2036-planning-ouroboros-migration-single-replica-hardening-cleanup.md`
  - `slugger/tasks/2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup.md`

## Notes
Default proposal: implement a shared coordinator utility keyed by `{channel}:{conversationId}` and have Teams call into it instead of owning lock maps directly, with follow-up buffering and between-call injection for same-conversation steering.

## Progress Log
- 2026-03-03 22:17 Created.
- 2026-03-03 22:29 Locked full removal of `teamsChannel.maxConcurrentConversations` and removed compatibility/deprecation path from scope.
- 2026-03-04 10:48 Planning approved.
- 2026-03-04 10:54 Updated plan to require explicit steering follow-up feedback for same-conversation mid-turn messages (no silent queue UX).
- 2026-03-04 11:19 Updated steering contract: preserve all follow-up messages, inject between model calls, and avoid adapter-authored steering plain text.
