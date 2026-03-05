# Reflection Proposal: Teams input adapter has no idempotency/duplicate-delivery protection, risking duplicate tool executions and double-sends when Bot Framework retries an activity

**Generated:** 2026-03-05T13:56:33.458Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Teams input adapter has no idempotency/duplicate-delivery protection, risking duplicate tool executions and double-sends when Bot Framework retries an activity

## Proposal
Add a lightweight duplicate-activity deduplication layer to the Teams adapter so that if the Bot Framework delivers the same activity more than once (common during transient failures/retries), Ouroboros will process it at most once per conversation within a short TTL window.

Implementation steps:
1. **Create a small dedupe utility**
   - Add `src/senses/activity-dedupe.ts` implementing an in-memory, bounded dedupe cache keyed by `(conversationId, activityId)` with:
     - TTL eviction (e.g., 5–10 minutes)
     - size cap (e.g., max N entries per conversation, and/or a global cap)
     - API like `isDuplicate({ conversationId, activityId }): boolean` (where it records on first-seen).
2. **Integrate into `src/senses/teams.ts`**
   - Early in the activity handler (before any message enqueueing / tool execution), check dedupe:
     - If duplicate: short-circuit (acknowledge/no-op) to prevent double execution.
     - If new: proceed normally.
3. **Add observability for duplicates**
   - Emit a nerves event such as `senses.teams.activity_deduped` including `conversationId`, `activityId`, and timestamp so duplicates are diagnosable without being noisy.
4. **Add tests**
   - Create Jest tests for the dedupe utility (TTL and size cap behavior).
   - Add an adapter-level test for `teams.ts` asserting that two identical activities only invoke the downstream processing once (mock the downstream handler/dispatcher and verify call count).
5. **Document behavior**
   - Add a short note in Teams adapter docs/comments describing why dedupe exists and what keys/TTL are used, so future maintainers don’t remove it accidentally.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
