# Doing: Reasoning Item Persistence and API-Reported Token Usage

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-02-26 16:42
**Planning**: ./2026-02-26-1057-planning-reasoning-persistence.md
**Artifacts**: ./2026-02-26-1057-doing-reasoning-persistence/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Fix two bugs that cause the sliding context window to fail when using Azure Responses API reasoning models (gpt-5.2-chat) with `store: false`. Reasoning items are lost between turns (breaking reasoning continuity) and reasoning tokens are invisible to the token estimator (preventing context trimming from triggering). Replace the chars/4 token estimation heuristic with actual API-reported usage data from both providers. Add automatic context overflow recovery.

## Completion Criteria
- [ ] Reasoning items from `result.outputItems` are stored on assistant messages and persist through session save/load
- [ ] `toResponsesInput` restores reasoning items when rebuilding azureInput from loaded session messages
- [ ] Reasoning items emitted before assistant content in toResponsesInput (matching API item order)
- [ ] `estimateTokens` is deleted; all callers replaced with API-reported usage
- [ ] Azure streaming captures usage from `response.completed` event and returns it in `TurnResult`
- [ ] MiniMax streaming captures usage from final chunk (with `stream_options: { include_usage: true }`) and returns it in `TurnResult`
- [ ] `trimMessages` uses actual API-reported token count instead of estimated count
- [ ] Trimming runs retroactively after API call returns (not before the call)
- [ ] Post-turn trim+save is encapsulated in a shared `postTurn` function in context.ts (no duplication across adapters)
- [ ] `lastUsage` is stored in session JSON alongside messages
- [ ] Context trimming triggers correctly for sessions with large reasoning payloads
- [ ] Cold start (no prior usage data) handled gracefully -- no pre-call trimming, API errors caught
- [ ] Context overflow errors from both providers are caught and trigger automatic trim + retry
- [ ] User is informed when auto-trim happens (log message, not an error)
- [ ] Retry succeeds after trimming (or surfaces the error if trimming can't help)
- [ ] Within-turn reasoning accumulation in azureInput is preserved (existing behavior unchanged)
- [ ] Boot greeting removed from CLI `main()` and `bootGreeting` function deleted entirely (dead code after Feature 5 changes runAgent signature)
- [ ] System prompt refresh happens inside `runAgent`, not in adapters
- [ ] No duplicate `cachedBuildSystem` calls in adapter code
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

---

### Feature 1: Persist Reasoning Items

### ✅ Unit 1a: Store reasoning items on assistant messages -- Tests
**What**: Write failing tests in `src/__tests__/engine/core.test.ts` for storing reasoning items from `result.outputItems` on assistant messages as `_reasoning_items`. Tests cover:
- When `result.outputItems` contains reasoning items (type: "reasoning"), they are stored as `_reasoning_items` on the assistant message pushed to `messages`
- When `result.outputItems` contains no reasoning items, `_reasoning_items` is not set (or is empty array)
- When `result.outputItems` contains a mix of reasoning and non-reasoning items (e.g., function_call, message), only reasoning items are stored in `_reasoning_items`
- Existing behavior preserved: `azureInput.push(item)` for each outputItem still happens
- Reasoning item structure: `{ type: "reasoning", id: "r1", summary: [{ text: "...", type: "summary_text" }], encrypted_content: "enc..." }`
**Output**: Failing tests in `src/__tests__/engine/core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `_reasoning_items` is not yet stored on assistant messages

### ✅ Unit 1b: Store reasoning items on assistant messages -- Implementation
**What**: In `src/engine/core.ts` `runAgent`, after building the assistant message (line 144-154) and before `messages.push(msg)`, extract reasoning items from `result.outputItems` and store them as `msg._reasoning_items`. Filter for items where `item.type === "reasoning"`. Only set the field when there are reasoning items to store.
**Output**: Modified `src/engine/core.ts`
**Acceptance**: All Unit 1a tests PASS (green), existing tests still pass, no warnings

### ✅ Unit 1c: Restore reasoning items in toResponsesInput -- Tests
**What**: Write failing tests in `src/__tests__/engine/streaming.test.ts` for restoring `_reasoning_items` in `toResponsesInput`. Tests cover:
- When an assistant message has `_reasoning_items`, those items are emitted into the `input` array BEFORE the assistant content and function_call items (matching API item order)
- When an assistant message has no `_reasoning_items`, behavior is unchanged
- Reasoning items are emitted as-is (not wrapped or modified)
- Multiple assistant messages each with their own `_reasoning_items` are all restored in correct order
- An assistant message with `_reasoning_items`, content, AND tool_calls emits items in order: reasoning items, then content, then function_calls
**Output**: Failing tests in `src/__tests__/engine/streaming.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `toResponsesInput` does not yet handle `_reasoning_items`

### ✅ Unit 1d: Restore reasoning items in toResponsesInput -- Implementation
**What**: In `src/engine/streaming.ts` `toResponsesInput`, in the assistant message handler (line 29-46), check for `a._reasoning_items` and push each reasoning item to `input` before pushing content and function_calls.
**Output**: Modified `src/engine/streaming.ts`
**Acceptance**: All Unit 1c tests PASS (green), all existing tests still pass, no warnings

### ✅ Unit 1e: Reasoning persistence -- Coverage & Refactor
**What**: Verify 100% coverage on Units 1a-1d changes. Run full test suite. Refactor if needed. Verify edge cases: empty `_reasoning_items` array, `_reasoning_items` with only encrypted_content (no summary), session round-trip (save/load preserves `_reasoning_items` via JSON serialization).
**Output**: Coverage report confirms 100% on new code, clean refactor
**Acceptance**: 100% coverage on new code, all tests green, no warnings

---

### Feature 2: Capture Real API Usage, Delete estimateTokens

### ✅ Unit 2a: Add usage to TurnResult and capture Azure usage -- Tests
**What**: Write failing tests in `src/__tests__/engine/streaming.test.ts` for:
- `TurnResult` interface includes a `usage` field: `{ input_tokens: number, output_tokens: number, reasoning_tokens: number, total_tokens: number } | undefined`
- `streamResponsesApi` captures usage from `response.completed` event and returns it in `TurnResult.usage`
- When no `response.completed` event fires, `usage` is undefined
- Usage fields map correctly: `input_tokens`, `output_tokens`, `output_tokens_details.reasoning_tokens`, `total_tokens`
**Output**: Failing tests in `src/__tests__/engine/streaming.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `TurnResult` has no `usage` field and `streamResponsesApi` does not capture usage

### ✅ Unit 2b: Add usage to TurnResult and capture Azure usage -- Implementation
**What**:
- Add `usage` field to `TurnResult` interface in `src/engine/streaming.ts`: `usage?: { input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number }`
- In `streamResponsesApi`, add a `response.completed` event handler in the switch statement to capture usage data from `event.response.usage`. Map `output_tokens_details.reasoning_tokens` to `reasoning_tokens`.
- Return `usage` in the TurnResult
**Output**: Modified `src/engine/streaming.ts`
**Acceptance**: All Unit 2a tests PASS (green), existing tests still pass, no warnings

### ✅ Unit 2c: Capture MiniMax usage -- Tests
**What**: Write failing tests in `src/__tests__/engine/streaming.test.ts` for:
- `streamChatCompletion` adds `stream_options: { include_usage: true }` to the create params
- `streamChatCompletion` captures `chunk.usage` from the final streaming chunk and returns it in `TurnResult.usage`
- Usage fields map correctly: `prompt_tokens` -> `input_tokens`, `completion_tokens` -> `output_tokens`, `completion_tokens_details.reasoning_tokens` -> `reasoning_tokens`, `total_tokens`
- When no usage chunk arrives, `usage` is undefined
**Output**: Failing tests in `src/__tests__/engine/streaming.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### ✅ Unit 2d: Capture MiniMax usage -- Implementation
**What**:
- In `streamChatCompletion` in `src/engine/streaming.ts`, inject `stream_options: { include_usage: true }` into `createParams` before calling `client.chat.completions.create`
- In the streaming loop, check for `chunk.usage` on each chunk. When present (final chunk), extract and map the fields to the normalized usage format.
- Return `usage` in the TurnResult
**Output**: Modified `src/engine/streaming.ts`
**Acceptance**: All Unit 2c tests PASS (green), existing tests still pass, no warnings

### ✅ Unit 2e: API usage capture -- Coverage & Refactor
**What**: Verify 100% coverage on Units 2a-2d changes (Azure and MiniMax usage capture). Run full test suite. Confirm no regressions.
**Output**: Coverage report confirms 100% on new usage capture code
**Acceptance**: 100% coverage on new code, all tests green, no warnings

Note: `estimateTokens` deletion is deferred to Feature 3 where it is replaced atomically with the new `trimMessages` signature. This avoids a broken intermediate state where `trimMessages` has no token counting mechanism.

---

### Feature 3: Retroactive Trimming with Real Token Counts

### ✅ Unit 3a: Rework trimMessages and delete estimateTokens -- Tests
**What**: Write new failing tests in `src/__tests__/mind/context.test.ts` for the reworked `trimMessages` AND remove all `estimateTokens` tests. The new `trimMessages` signature: `trimMessages(messages, maxTokens, contextMargin, actualTokenCount)` where `actualTokenCount` is the API-reported `input_tokens` from the last turn. Tests cover:
- When `actualTokenCount` exceeds `maxTokens`, messages are trimmed (oldest after system prompt dropped first)
- When `actualTokenCount` is under `maxTokens`, no trimming occurs (returns copy of messages)
- System prompt (index 0) is always preserved
- Trimming targets `maxTokens * (1 - contextMargin / 100)` -- drops messages proportionally until estimated remaining tokens are under target
- When `actualTokenCount` is 0 or undefined, no trimming occurs (cold start / first call)
- MAX_MESSAGES hard cap (200) is still enforced regardless of token count
- Edge cases: single message (system only), all messages would be trimmed (only system remains)
- All old `estimateTokens` tests are removed
- All old `trimMessages` tests that relied on `estimateTokens` behavior are replaced
**Output**: Rewritten trimMessages tests and removed estimateTokens tests in `src/__tests__/mind/context.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `trimMessages` still uses the old signature and `estimateTokens` still exists

### ✅ Unit 3b: Rework trimMessages and delete estimateTokens -- Implementation
**What**: Atomically rework `trimMessages` AND delete `estimateTokens` in `src/mind/context.ts`:
- Delete the `estimateTokens` function and its export
- New `trimMessages` signature: `trimMessages(messages, maxTokens, contextMargin, actualTokenCount?: number)`
- When `actualTokenCount` is undefined or 0, skip token-based trimming (but still enforce MAX_MESSAGES)
- When `actualTokenCount > maxTokens`: calculate `trimTarget = maxTokens * (1 - contextMargin / 100)`. Estimate per-message cost as `actualTokenCount / messages.length`. Drop oldest messages (after system prompt) until estimated remaining tokens <= trimTarget.
- Keep the MAX_MESSAGES hard cap logic
**Output**: Modified `src/mind/context.ts`
**Acceptance**: All Unit 3a tests PASS (green), no warnings, no references to `estimateTokens` remain

### ✅ Unit 3c: Store lastUsage in session and runAgent return type -- Tests
**What**: Write failing tests covering three tightly coupled changes:

**In `src/__tests__/mind/context.test.ts`** (saveSession/loadSession):
- `saveSession` accepts optional `lastUsage` parameter and includes it in the JSON envelope: `{ version: 1, messages, lastUsage }`
- `loadSession` returns `{ messages, lastUsage }` (updated return type) instead of just messages
- When `lastUsage` is undefined/not present in saved file, `loadSession` returns `lastUsage: undefined`
- Backward compatibility: loading a session without `lastUsage` still works (returns messages, undefined lastUsage)

**In `src/__tests__/engine/core.test.ts`** (runAgent return type):
- `runAgent` returns `Promise<{ usage?: UsageData }>` instead of `Promise<void>`
- The returned `usage` is from the LAST streaming call of the turn (the final API call before done=true)
- When the model responds without tool calls (single API call), usage is from that call
- When the model does multiple tool rounds, usage is from the last round's API call
- When an error occurs, usage may be undefined
**Output**: Failing tests in `src/__tests__/mind/context.test.ts` and `src/__tests__/engine/core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### ✅ Unit 3d: Store lastUsage in session and runAgent return type -- Implementation
**What**: Implement all three changes atomically so the codebase never enters an uncompilable state:

**In `src/mind/context.ts`**:
- Define and export a `UsageData` type: `{ input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number }`
- `saveSession(filePath, messages, lastUsage?)`: include `lastUsage` in the JSON envelope
- `loadSession(filePath)`: return `{ messages, lastUsage }` object instead of just `messages[]`

**In `src/engine/core.ts`**:
- Change `runAgent` return type from `Promise<void>` to `Promise<{ usage?: UsageData }>`
- Track the latest `result.usage` from each streaming call
- Return `{ usage: lastUsage }` at the end of the function (after the while loop)
- Import `UsageData` type from `src/mind/context.ts`

**In `src/channels/cli.ts`** (fix loadSession callers immediately):
- Update `loadSession` usage: `existing` is now `{ messages, lastUsage } | null`, so change `existing && existing.length > 0` to `existing?.messages && existing.messages.length > 0` and `existing` to `existing.messages` where messages are extracted

**In `src/channels/teams.ts`** (fix loadSession callers immediately):
- Same `loadSession` migration: `existing?.messages && existing.messages.length > 0`

This avoids the compile breakage that would occur if loadSession's return type changed without immediately updating its callers.
**Output**: Modified `src/mind/context.ts`, `src/engine/core.ts`, `src/channels/cli.ts`, `src/channels/teams.ts`
**Acceptance**: All Unit 3c tests PASS (green), all existing tests still pass, no warnings, no compile errors

### ✅ Unit 3e: Shared postTurn function -- Tests
**What**: Write failing tests in `src/__tests__/mind/context.test.ts` for a new `postTurn(messages, sessPath, usage?)` function that encapsulates the post-turn trim+save logic. Tests cover:
- When `usage` has `input_tokens` exceeding `maxTokens`, messages are trimmed and then saved with `lastUsage`
- When `usage` is undefined (cold start), no trimming occurs but session is still saved
- When `usage.input_tokens` is under `maxTokens`, no trimming occurs but session is still saved with `lastUsage`
- Messages array is mutated in place (splice, not copy) so the caller's reference stays current
- `saveSession` is called with the (possibly trimmed) messages and the usage data as `lastUsage`
- Edge case: empty messages array (only system prompt)
**Output**: Failing tests in `src/__tests__/mind/context.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `postTurn` does not yet exist

### ✅ Unit 3f: Shared postTurn function -- Implementation
**What**: In `src/mind/context.ts`, add and export a `postTurn(messages, sessPath, usage?)` function that:
1. Calls `getContextConfig()` to get `maxTokens` and `contextMargin`
2. Calls `trimMessages(messages, maxTokens, contextMargin, usage?.input_tokens)` to get trimmed messages
3. Mutates `messages` in place: `messages.splice(0, messages.length, ...trimmed)`
4. Calls `saveSession(sessPath, messages, usage)` to persist
This eliminates the duplicated trim+save code in both adapters. Each adapter just calls `postTurn(messages, sessPath, result.usage)` after `runAgent` returns.
**Output**: Modified `src/mind/context.ts`
**Acceptance**: All Unit 3e tests PASS (green), no warnings

### ✅ Unit 3g: Move trimming to after runAgent in CLI -- Tests
**What**: Write/update failing tests in `src/__tests__/channels/cli-main.test.ts` for the new trim flow:
- Trimming no longer happens before `runAgent` -- it happens after
- After `runAgent` returns, `postTurn` is called with messages, sessPath, and `result.usage`
- `postTurn` handles both trimming and saving (no direct `trimMessages`/`saveSession` calls in adapter)
- On cold start (first message, no prior usage), `postTurn` still runs (it handles undefined usage gracefully)
- Boot greeting block AND `bootGreeting` function are both deleted (dead code -- keeping function would cause compile error after Feature 5 changes runAgent signature)
- Remove all existing `bootGreeting` tests (they test dead code)
**Output**: Failing/updated tests in `src/__tests__/channels/cli-main.test.ts`
**Acceptance**: Tests exist and FAIL (red) because CLI still trims before runAgent

### ✅ Unit 3h: Move trimming to after runAgent in CLI -- Implementation
**What**: In `src/channels/cli.ts` `main()`:
- Remove the boot greeting block: delete the `if (!existing || existing.length === 0)` block that calls `bootGreeting` (lines 229-236) AND delete the `bootGreeting` function itself (lines 201-204). The function is dead code -- keeping it would cause a compile error after Feature 5 changes `runAgent`'s signature. Add a TODO comment where the block was: `// TODO: first-run experience (greeting) -- addressed separately`.
- Remove any `bootGreeting` tests from `src/__tests__/channels/cli-main.test.ts` (they test dead code)
- Remove the pre-call `trimMessages` block (lines 301-304)
- Capture the return value from `runAgent`: `const result = await runAgent(messages, cliCallbacks, currentAbort.signal)`
- After runAgent, call `postTurn(messages, sessPath, result.usage)` -- this replaces the inline trim+save logic
- Remove the old `saveSession` call (now handled by `postTurn`)
- Leave the system prompt refresh line (`messages[0] = ...`) in place for now -- Feature 5 will move it into `runAgent`
**Output**: Modified `src/channels/cli.ts`, `src/__tests__/channels/cli-main.test.ts`
**Acceptance**: All Unit 3g tests PASS (green), existing tests still pass, no warnings

### ✅ Unit 3i: Move trimming to after runAgent in Teams -- Tests
**What**: Write/update failing tests in `src/__tests__/channels/teams.test.ts` for the new trim flow:
- Trimming no longer happens before `runAgent` -- it happens after
- After `runAgent` returns, `postTurn` is called with messages, sessPath, and `result.usage`
- `postTurn` handles both trimming and saving (no direct `trimMessages`/`saveSession` calls in adapter)
**Output**: Failing/updated tests in `src/__tests__/channels/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### ✅ Unit 3j: Move trimming to after runAgent in Teams -- Implementation
**What**: In `src/channels/teams.ts` `handleTeamsMessage()`:
- Remove the pre-call `trimMessages` block (lines 170-173)
- Capture the return value from `runAgent`: `const result = await runAgent(messages, callbacks, controller.signal)`
- After runAgent, call `postTurn(messages, sessPath, result.usage)` -- this replaces the inline trim+save logic
- Remove the old `saveSession` call (now handled by `postTurn`)
- Leave the system prompt refresh line (`messages[0] = ...`) in place for now -- Feature 5 will move it into `runAgent`
**Output**: Modified `src/channels/teams.ts`
**Acceptance**: All Unit 3i tests PASS (green), existing tests still pass, no warnings

### ✅ Unit 3k: Retroactive trimming -- Coverage & Refactor
**What**: Verify 100% coverage on all Feature 3 changes. Run full test suite. Refactor if needed.
**Output**: Coverage report confirms 100% on new code
**Acceptance**: 100% coverage on new code, all tests green, no warnings

---

### Feature 4: Context Overflow Auto-Recovery

### ✅ Unit 4a: Detect context overflow errors -- Tests
**What**: Write failing tests in `src/__tests__/engine/core.test.ts` for context overflow detection and auto-recovery in `runAgent`. Tests cover:
- Azure overflow: when streaming throws an error with `error.code === "context_length_exceeded"`, `runAgent` catches it, trims messages aggressively, and retries
- Azure overflow (alternate): error message contains "context_length_exceeded"
- MiniMax overflow: when streaming throws an error with message containing "context window exceeds limit", same recovery
- After successful retry, `runAgent` completes normally (returns usage from retry)
- When retry also fails with overflow, the error is surfaced via `callbacks.onError`
- When the error is NOT a context overflow (e.g., network error), it is NOT caught by overflow recovery -- normal error handling applies
- The log callback (`callbacks.onError` or a new callback) informs the user that trimming happened
**Output**: Failing tests in `src/__tests__/engine/core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `runAgent` does not handle overflow errors

### ✅ Unit 4b: Implement context overflow auto-recovery
**What**: In `src/engine/core.ts` `runAgent`, in the catch block (line 201-208):
- Add overflow detection: check if the error matches Azure pattern (`error.code === "context_length_exceeded"` OR error message includes "context_length_exceeded") or MiniMax pattern (error message includes "context window exceeds limit")
- On overflow: call `stripLastToolCalls(messages)` first (clean up any partial tool state from mid-turn overflow), then call `trimMessages(messages, maxTokens, contextMargin, maxTokens * 2)` to force aggressive trimming (passing a token count double the limit forces heavy trimming)
- Log via `callbacks.onError(new Error("context trimmed, retrying..."))` or introduce a lighter callback
- Reset the loop state (`azureInput = null` to force rebuild from trimmed messages) and `continue` the while loop to retry
- Track retry count: only retry once. On second overflow, fall through to normal error handling.
- Import `trimMessages` and `getContextConfig` in `core.ts`

Note: With retroactive trimming after each turn (Feature 3), context overflow should rarely happen in practice -- this is a safety net for edge cases like cold start with a huge session or unexpectedly large reasoning output. The `stripLastToolCalls` before trimming handles the case where overflow occurs mid-tool-loop, ensuring the messages array is in a clean state before retry.
**Output**: Modified `src/engine/core.ts`
**Acceptance**: All Unit 4a tests PASS (green), existing tests still pass, no warnings

### ⬜ Unit 4c: Context overflow recovery -- Coverage & Refactor
**What**: Verify 100% coverage on all Feature 4 changes. Run full test suite. Edge cases: overflow on first call (cold start), overflow during tool execution mid-turn, overflow with only system message remaining (cannot trim further).
**Output**: Coverage report confirms 100% on new code
**Acceptance**: 100% coverage on new code, all tests green, no warnings

---

### Feature 5: Move System Prompt Refresh into runAgent

### ⬜ Unit 5a: runAgent refreshes system prompt -- Tests
**What**: Write failing tests in `src/__tests__/engine/core.test.ts` for `runAgent` accepting a `channel` parameter and refreshing the system prompt. Tests cover:
- `runAgent` accepts a `channel: Channel` parameter (after `callbacks`, before `signal`): `runAgent(messages, callbacks, channel, signal?)`
- At the start of `runAgent`, `messages[0]` is overwritten with a fresh system prompt via `cachedBuildSystem(channel, buildSystem)`
- When `channel` is `"cli"`, the system prompt is built for CLI
- When `channel` is `"teams"`, the system prompt is built for Teams
- Existing test calls that do not pass `channel` still work (parameter is optional with a default, or tests are updated)

Note: there are ~50 existing `runAgent` call sites in `core.test.ts` that use the current signature `runAgent(messages, callbacks, signal?)`. The tests should add `channel` parameter to the new tests. Existing tests can pass a default channel (e.g., `"cli"`) or the parameter can have a default value.
**Output**: Failing tests in `src/__tests__/engine/core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `runAgent` does not yet accept `channel` or refresh the system prompt

### ⬜ Unit 5b: Move system prompt refresh into runAgent -- Implementation
**What**:
**In `src/engine/core.ts`**:
- Add `channel: Channel` parameter to `runAgent` signature: `runAgent(messages, callbacks, channel, signal?)`
- At the top of the function (before the while loop), refresh the system prompt: `messages[0] = { role: "system", content: cachedBuildSystem(channel, buildSystem) }`
- Import `Channel` from `../mind/prompt` (already re-exported from core.ts as `export type { Channel } from "../mind/prompt"`)
- Import `cachedBuildSystem` from `../mind/context`
- Import `buildSystem` from `../mind/prompt` (already re-exported from core.ts as `export { buildSystem } from "../mind/prompt"`)

**In `src/channels/cli.ts`**:
- Remove the system prompt refresh line `messages[0] = { role: "system", content: cachedBuildSystem("cli", buildSystem) }` from `main()` (it now happens inside `runAgent`)
- Update `runAgent` call in `main()` to pass `"cli"` as channel: `runAgent(messages, cliCallbacks, "cli", currentAbort.signal)`
- `bootGreeting` was already deleted in Unit 3h -- no update needed for it.
- Remove `cachedBuildSystem` and `buildSystem` imports if they are no longer used in cli.ts (check if `loadSession` fallback still uses `cachedBuildSystem` for the initial system prompt -- if so, keep the import)

**In `src/channels/teams.ts`**:
- Remove the system prompt refresh line `messages[0] = { role: "system", content: cachedBuildSystem("teams", buildSystem) }` from `handleTeamsMessage()`
- Update `runAgent` call to pass `"teams"` as channel: `runAgent(messages, callbacks, "teams", controller.signal)`
- Remove `buildSystem` import if no longer used in teams.ts (check if `loadSession` fallback still uses `cachedBuildSystem` for the initial system prompt -- if so, keep the import)

**In `src/__tests__/engine/core.test.ts`**:
- Update all ~50 existing `runAgent` call sites to pass a channel parameter. Use `"cli"` as the default for existing tests. Alternatively, if `channel` has a default value in the signature, existing calls may not need updating.

Call sites to update (source files only):
- `src/channels/cli.ts`: `runAgent(messages, cliCallbacks, "cli", currentAbort.signal)` (line ~309)
- `src/channels/cli.ts`: `bootGreeting` deleted in Unit 3h -- no call site to update
- `src/channels/teams.ts`: `runAgent(messages, callbacks, "teams", controller.signal)` (line ~178)
**Output**: Modified `src/engine/core.ts`, `src/channels/cli.ts`, `src/channels/teams.ts`, `src/__tests__/engine/core.test.ts`
**Acceptance**: All Unit 5a tests PASS (green), all existing tests still pass, no warnings, no duplicate `cachedBuildSystem` calls in adapter code

### ⬜ Unit 5c: System prompt refresh -- Coverage & Refactor
**What**: Verify 100% coverage on all Feature 5 changes. Run full test suite. Confirm no regressions. Verify that `cachedBuildSystem` is no longer called from adapter code (only from `runAgent` in core.ts).
**Output**: Coverage report confirms 100% on new code
**Acceptance**: 100% coverage on new code, all tests green, no warnings

---

### Final

### ⬜ Unit 6: Full integration verification
**What**: Run the complete test suite. Verify all completion criteria are met. Verify no warnings. Run coverage report and confirm 100% on all new code.
**Output**: All tests pass, coverage confirmed, no warnings
**Acceptance**: All completion criteria checked off

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-26-1057-doing-reasoning-persistence/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-02-26 16:42 Created from planning doc
- 2026-02-26 16:44 Granularity pass: extracted runAgent return type change into its own unit (3e/3f), deferred estimateTokens deletion to Feature 3 for atomic replacement, renumbered units
- 2026-02-26 16:46 Validation pass: verified all line numbers, function signatures, event names, error shapes against actual source. Documented loadSession breaking change in Unit 3d with explicit migration notes in Units 3h/3j. Confirmed OpenAI SDK APIError.code property maps correctly for overflow detection.
- 2026-02-26 16:47 Quality pass: all 25 units have acceptance criteria, emoji status markers, What/Output/Acceptance fields. No TBD items. Completion criteria testable. Code coverage requirements included. No changes needed.
- 2026-02-26 16:57 Review pass: reordered Feature 3 units to avoid compile breakage (combined loadSession change + runAgent return type + adapter loadSession fixes into single atomic unit 3c/3d), noted stripLastToolCalls for overflow recovery, removed boot greeting from CLI main (sessions persist forever), preserved system prompt refresh pre-call in both adapters.
- 2026-02-26 17:06 Added Feature 5: move system prompt refresh into runAgent to eliminate duplicated adapter code. Removed "preserve system prompt refresh" notes from Feature 3 units (Feature 5 handles it). Renumbered Final unit from 5 to 6.
- 2026-02-26 17:17 Review pass 2: deduped post-turn trim+save into shared `postTurn` function in context.ts (Units 3e/3f), updated adapter units to call `postTurn` instead of inline trim+save. Deleted `bootGreeting` function entirely in Unit 3h (dead code after Feature 5 changes runAgent signature). Renumbered Feature 3 units: 3e-3i -> 3e-3k.
- 2026-02-26 17:23 Unit 1a complete: failing tests for _reasoning_items on assistant messages (2 fail as expected, 3 pass for negative/preservation cases)
- 2026-02-26 17:25 Feature 1 complete (Units 1a-1e): reasoning items persisted on assistant messages and restored in toResponsesInput. 100% coverage on core.ts, streaming.ts, context.ts.
- 2026-02-26 17:28 Feature 2 complete (Units 2a-2e): Azure and MiniMax usage capture with UsageData type. 100% coverage on streaming.ts.
- 2026-02-26 17:42 Unit 3g complete: CLI main tests updated for postTurn (no pre-call trimming), boot greeting removed, loadSessionReturn format updated. 10 tests fail (red).
- 2026-02-26 17:43 Unit 3h complete: deleted bootGreeting function and boot greeting block, removed pre-call trimMessages+saveSession, added postTurn after runAgent. Removed bootGreeting tests from cli.test.ts. 402 tests pass.
- 2026-02-26 17:45 Unit 3i complete: Teams tests updated for postTurn (no pre-call trimming), loadSessionReturn format updated. 2 tests fail (red).
- 2026-02-26 17:47 Units 3j complete: Teams adapter uses postTurn after runAgent, removed pre-call trimMessages+saveSession. 402 tests pass.
- 2026-02-26 17:49 Feature 3 complete (Units 3a-3k): retroactive trimming with real token counts, postTurn shared function, estimateTokens deleted. 100% coverage on all changed files. 402 tests pass.
- 2026-02-26 17:51 Unit 4a complete: 6 overflow recovery tests (5 fail as expected, 1 passes for non-overflow validation).
