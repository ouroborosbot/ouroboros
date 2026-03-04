# Planning: Ouroboros Migration - Turn Coordinator Steering Contract

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
- Preserve steering follow-ups as discrete ordered events (not last-wins replacement and not one lossy blob); model visibility must retain message ordering.
- Inject buffered steering follow-ups only at model-call boundaries (never mutate an in-flight model call); if no next boundary occurs before turn end, carry buffered follow-ups forward into the next turn for that conversation.
- Ensure steering path sends no adapter-authored plain-text acknowledgements; plain-text shown to the user for steering outcomes must come from model output.
- Non-plain-text channel-native progress signals (typing indicator/tool status) remain allowed.
- Remove `teamsChannel.maxConcurrentConversations` entirely from config/types/defaults/tests and runtime code paths.
- Update tests to validate coordinator behavior, all-follow-ups steering injection behavior, and hard reject removal.
- Do not add a steering-specific maximum buffer size in this task; steering follow-ups are handled as normal user messages under existing context/window and trimming behavior.

### Out of Scope
- Load balancer, multi-replica routing, or infrastructure-level scaling changes.
- Distributed locking across replicas/processes.
- Confirmation-flow redesign or confirmation-specific behavioral expansion.
- Changes to unrelated CLI rendering or prompt/tool behavior.

## Completion Criteria
- [ ] Teams no longer hard-rejects messages based on a static concurrent-turn cap.
- [ ] `teamsChannel.maxConcurrentConversations` is fully removed from config schema/defaults/accessors and call sites.
- [ ] A shared turn coordinator exists and is used by Teams for per-conversation serialization.
- [ ] Same-conversation follow-up messages during active turns are all preserved and injected into the active turn between model calls.
- [ ] No steering follow-up dedupe/idempotency layer is introduced in this task.
- [ ] Steering follow-ups are injected as ordered discrete user messages (not dropped, reordered, or collapsed with lost boundaries).
- [ ] Steering injection occurs only at model-call boundaries; no in-flight model-call mutation occurs.
- [ ] Buffered follow-ups that miss a boundary are carried into the next turn for the same conversation.
- [ ] Steering path introduces no adapter-authored plain-text acknowledgement messages to users.
- [ ] Model receives all follow-up user messages for steering (none dropped).
- [ ] Single active-turn ownership per conversation is preserved; different conversations remain parallelizable.
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
- Do not add follow-up dedupe/idempotency behavior in this task; preserve and inject follow-up messages as received.
- Steering follow-ups are represented and injected as discrete ordered messages, preserving per-message boundaries and chronology.
- Steering injection happens at next model-call boundary only; mid-call interruption/cancellation is not part of this task.
- If a turn finishes before a boundary consumes buffered steering input, buffered items carry forward and are injected into the next turn.
- Steering path must not emit adapter-authored plain text; user-visible plain text for steering outcomes must come from model output.
- No steering-specific buffer cap is added in this task; follow-up volume is governed by existing context trimming and model context-window behavior.
- Confirmation flow is intentionally not expanded in this task; existing behavior remains unchanged/out of scope.
- Treat load-balancing/replica-scale solutions as infrastructure concerns outside this code task.

## Context / References
- `src/senses/teams.ts` (`withConversationLock`, in-flight cap gate in `handleTeamsMessage`)
- `src/__tests__/senses/teams.test.ts` (serialization and cap tests)
- `src/config.ts` and `src/__tests__/config.test.ts` (teams channel config schema/defaults)
- `src/heart/core.ts` (model-call loop boundaries relevant for steering injection points)
- Prior completed cleanup task docs:
  - `slugger/tasks/2026-03-03-2036-planning-ouroboros-migration-single-replica-hardening-cleanup.md`
  - `slugger/tasks/2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup.md`

## Notes
Default proposal:
- shared coordinator keyed by `{channel}:{conversationId}` for active-turn ownership.
- steering buffer entries shaped as `{ conversationId, text, receivedAt }`.
- boundary drain operation converts buffered steering entries into ordered user-message inserts between model calls.
- carry-forward of undrained steering entries into next conversation turn.

## Progress Log
- 2026-03-03 22:17 Created.
- 2026-03-03 22:29 Locked full removal of `teamsChannel.maxConcurrentConversations` and removed compatibility/deprecation path from scope.
- 2026-03-04 10:48 Planning approved.
- 2026-03-04 10:54 Updated plan to require explicit steering follow-up feedback for same-conversation mid-turn messages (no silent queue UX).
- 2026-03-04 11:19 Updated steering contract: preserve all follow-up messages, inject between model calls, and avoid adapter-authored steering plain text.
- 2026-03-04 11:39 Historical (superseded at 12:21): locked detailed steering injection contract including dedupe by `activity.id`, ordered discrete injection, boundary-only injection, carry-forward semantics, and confirmation out of scope.
- 2026-03-04 11:53 Historical (superseded at 12:21): generalized dedupe contract to channel message identity (Teams mapping as adapter detail) and locked no steering-specific buffer cap.
- 2026-03-04 12:21 Removed follow-up dedupe/idempotency from plan scope; preserve-all steering now forwards follow-ups as received.
- 2026-03-04 13:17 Renamed task slug from `turn-coordinator-locking-refactor` to `turn-coordinator-steering-contract` to match current scope.
