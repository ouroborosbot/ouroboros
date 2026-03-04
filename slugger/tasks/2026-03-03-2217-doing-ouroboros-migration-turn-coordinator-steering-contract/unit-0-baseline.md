# Unit 0 Baseline Inventory

## Runtime Call Sites (Current)

### Teams turn serialization + cap logic
- `src/senses/teams.ts:275-284`
  - `_convLocks` + `withConversationLock(convId, fn)` serializes by conversation.
- `src/senses/teams.ts:277`
  - `_inFlightTeamsTurns` global counter.
- `src/senses/teams.ts:309-323`
  - `handleTeamsMessage(...)` reads `getTeamsChannelConfig().maxConcurrentConversations`, hard-rejects on cap, increments `_inFlightTeamsTurns`.
- `src/senses/teams.ts:415-417`
  - finally-block decrements `_inFlightTeamsTurns`.
- `src/senses/teams.ts:457-515`
  - `startTeamsApp()` wraps each message in `withConversationLock(convId, ...)` before calling `handleTeamsMessage(...)`.

### Existing same-conversation follow-up handling
- No explicit steering/follow-up buffer exists today.
- Current same-conversation behavior is implicit queueing via `withConversationLock`.
- Existing pre-lock interception only handles confirmation replies:
  - `src/senses/teams.ts:254-273` (`_pendingConfirmations`, `resolvePendingConfirmation`)
  - `src/senses/teams.ts:466-476` (confirmation short-circuit before lock)

## Config Surfaces (Current)
- `src/config.ts:37-42`
  - `TeamsChannelConfig` includes `maxConcurrentConversations`.
- `src/config.ts:88-93`
  - default `teamsChannel.maxConcurrentConversations = 10`.
- `src/config.ts:216-219`
  - `getTeamsChannelConfig()` accessor used by Teams runtime.

## Test Surfaces (Current)

### Teams adapter tests
- `src/__tests__/senses/teams.test.ts:1976-2023`
  - `withConversationLock` same-conversation serialization and different-conversation parallel behavior.
- `src/__tests__/senses/teams.test.ts:2025-2059`
  - global in-flight cap overload behavior test (to be removed/replaced).

### Config tests
- `src/__tests__/config.test.ts:474-538`
  - `getTeamsChannelConfig` default/merge behavior coverage.
  - currently does not assert `maxConcurrentConversations`; will need update when field is removed.

## Safe Steering Injection Boundaries in `runAgent`

### Boundary A: before each model call
- `src/heart/core.ts:256-305`
  - loop iteration start, then model request (`streamResponsesApi`/`streamChatCompletion`).
  - safe to inject buffered user follow-ups into `messages` before starting the next model call.

### Boundary B: after model result + tool execution, before next model call
- `src/heart/core.ts:311-435`
  - model output parsed, optional tool loop runs, messages appended.
  - safe to inject buffered follow-ups after tool results are appended and before control returns to the next `while` iteration.

### Non-boundary zones (do not inject)
- `src/heart/core.ts:289-305`
  - active streaming model call in-flight.
- `src/heart/core.ts:378-434`
  - tool execution loop in progress; treat as in-turn work, not model boundary injection point.

## Contract Cases to Carry into Implementation
- Ordering: preserve follow-up arrival order and message boundaries.
- Carry-forward: if no subsequent boundary occurs before turn exit (`done = true` at `src/heart/core.ts:349-351` or `363-365`), hold follow-ups for next turn.
- No-dedupe scope: follow-ups are forwarded as received in this task.
