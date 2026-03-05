# Doing: Teams adapter duplicate-activity deduplication (idempotency for Bot Framework retries)

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Prevent duplicate tool executions / double-sends when the Bot Framework retries delivery of the *same* Teams activity. Add a lightweight in-memory dedupe layer keyed by `(conversationId, activityId)` with a short TTL and bounded size, integrated early in the Teams `app.on("message")` handler with a nerves event for observability.

## Completion Criteria
- [ ] `src/senses/activity-dedupe.ts` exists and provides an in-memory, TTL-based, size-bounded dedupe cache keyed by `(conversationId, activityId)`.
- [ ] `src/senses/teams.ts` checks dedupe *before* confirmation resolution / turn coordination / token fetch / runAgent and short-circuits duplicates.
- [ ] Duplicate deliveries emit a nerves event `senses.teams.activity_deduped` with `conversationId` + `activityId` in `meta`.
- [ ] Behavior is documented via a short comment near the dedupe check (why it exists + keys + TTL).
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: Activity dedupe utility — Tests
**What**: Add red tests for a new dedupe utility that provides at-most-once behavior within a TTL window and bounds memory.

**Files**:
- Create: `src/__tests__/senses/activity-dedupe.test.ts`

**Test cases (must be RED first)**:
- First-seen returns `false` (not duplicate); second call with same `(conversationId, activityId)` returns `true`.
- TTL expiry: after advancing time beyond TTL, the same key is no longer considered a duplicate.
- Size cap (per conversation): when more than `maxEntriesPerConversation` unique activity IDs are recorded for the same conversation, the oldest entry is evicted; calling `isDuplicate` again for the evicted activity should return `false`.

**Acceptance**: Tests exist and FAIL (red).

---

### ⬜ Unit 1b: Activity dedupe utility — Implementation
**What**: Implement `src/senses/activity-dedupe.ts`.

**Files**:
- Create: `src/senses/activity-dedupe.ts`

**Implementation requirements**:
- In-memory cache keyed by `(conversationId, activityId)`.
- TTL eviction on access (no background timers required).
- Bounded memory:
  - `maxEntriesPerConversation` cap (evict oldest for that conversation when exceeded).
  - Optional global cap is acceptable, but per-conversation cap is required.
- Ergonomic API:
  - Provide a factory for testability, e.g. `createActivityDedupe({ ttlMs, maxEntriesPerConversation, now })`.
  - Provide a default singleton instance suitable for Teams adapter use.
  - Method: `isDuplicate({ conversationId, activityId }): boolean` that records the key on first-seen.

**Acceptance**: Unit 1a tests PASS (green).

---

### ⬜ Unit 2a: Teams adapter dedupe integration — Tests
**What**: Add a failing adapter-level test ensuring two identical activities only trigger downstream processing once, and that a nerves event is emitted on the deduped delivery.

**Files**:
- Modify: `src/__tests__/senses/teams.test.ts`

**Test design (must be RED first)**:
- Mock `@microsoft/teams.apps` `App` to capture the registered `"message"` handler (pattern already used in this file).
- Mock `runAgent` (from `src/heart/core`) and assert it is called exactly once.
- Mock `emitNervesEvent` (from `src/nerves/runtime`) and assert it is called once with:
  - `event: "senses.teams.activity_deduped"`
  - `meta.conversationId` and `meta.activityId`
- Invoke captured message handler twice with the same:
  - `activity.conversation.id = "conv-dup"`
  - `activity.id = "activity-1"`
  - same text

**Acceptance**: New/updated test(s) exist and FAIL (red).

---

### ⬜ Unit 2b: Teams adapter dedupe integration — Implementation
**What**: Integrate dedupe into `src/senses/teams.ts` so duplicates are no-ops before any side effects.

**Files**:
- Modify: `src/senses/teams.ts`
- (If needed) Modify: `src/senses/activity-dedupe.ts` (to expose the singleton import used by teams)

**Implementation details**:
- Import the dedupe singleton (e.g. `teamsActivityDedupe`) and `emitNervesEvent`.
- In `app.on("message")` handler, compute:
  - `convId = activity.conversation?.id || "unknown"`
  - `activityId = activity.id` (skip dedupe if falsy)
- Perform dedupe check **before**:
  - `resolvePendingConfirmation(...)`
  - `_turnCoordinator.tryBeginTurn(...)`
  - any token fetches
  - `handleTeamsMessage(...)`
- On duplicate:
  - Emit `emitNervesEvent({ event: "senses.teams.activity_deduped", component: "senses/teams", message: "duplicate activity ignored", meta: { conversationId: convId, activityId } })`
  - `return` (ack/no-op)
- Add a short comment explaining:
  - Bot Framework retries can redeliver the same activity
  - we dedupe by `(conversationId, activityId)`
  - TTL window and size cap values

**Acceptance**: Unit 2a tests PASS (green). No other tests regress.

---

### ⬜ Unit 3: Maintainership note (docs/comments)
**What**: Ensure future maintainers understand the behavior and constraints.

**Files**:
- Modify: `src/senses/teams.ts` (comment near the dedupe check; if already added in Unit 2b, confirm it is sufficient)

**Acceptance**:
- The dedupe behavior is documented in-code (keys + TTL/cap + rationale).
- Comment is concise and located adjacent to the dedupe check.

## Progress Log
- 2026-03-05 Created from reflection proposal
