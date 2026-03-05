# Doing: Context Kernel Post-Testing Fixes

**Status**: READY_FOR_EXECUTION
**Execution Mode**: pending
**Created**: 2026-03-03 21:59
**Planning**: ./2026-03-03-2008-planning-context-kernel-fixes.md
**Artifacts**: ./2026-03-03-2008-doing-context-kernel-fixes/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

Gated execution: units are grouped into three gates. User tests between each gate before the next gate proceeds.

## Objective
Fix six bugs discovered during live testing of the context kernel on Microsoft 365 Copilot Chat and standard 1:1 Teams. Bug 1 (bot doesn't know who the user is) is the most fundamental. Bug 4 (kick loop) is the most disruptive. Fixes are structured in three gated groups with manual user testing between each.

## Completion Criteria
### Gate 1: Identity + Out-of-Order Messages
- [x] `teamsContext` populates `aadObjectId`, `tenantId`, and `displayName` from `activity`
- [x] Friend record has real display name when AAD name is available
- [x] Conversation-ID fallback works when AAD fields are absent
- [x] `safeSend` serialized via promise chain -- concurrent `ctx.send()` calls no longer race
- [x] Failed send in chain halts subsequent sends (via `markStopped()`) -- verified by test
- [ ] User confirms on Copilot Chat: messages arrive in correct order, displayName populated or fallback confirmed

### Gate 2: Kick Escape Hatch + Self-Trigger
- [x] `tool_choice = "required"` set when `lastKickReason` is truthy at core.ts:288 and core.ts:303
- [x] Kick message rewritten to not self-trigger `hasToolIntent()` -- verified by unit test
- [x] All existing kick patterns and test expectations unchanged
- [x] New tests for `tool_choice` forcing after any kick
- [x] New test verifying kick message does not trigger `hasToolIntent()`
- [ ] User confirms on Copilot Chat: no kick loop, no response spam, no timeout

### Gate 2 Follow-up: tool_choice + final_answer Hardening
- [x] `toolChoiceRequired` defaults to `true` in core.ts (still overridable via options)
- [x] `tool_choice` and `activeTools` setting restored to conditional on `toolChoiceRequired` (but now defaults on)
- [x] `toolBehaviorSection()` prompt rewritten: decision-tree framing, anti-no-op pattern
- [x] `toolsSection()` correctly includes `finalAnswerTool` when `toolChoiceRequired` defaults on
- [x] `finalAnswerTool` description reframed as primary response mechanism
- [x] `final_answer` text emitted via `callbacks.onTextChunk` -- test coverage verified
- [x] Long messages split into chunks (never truncated, never lose content)
- [x] P0 "Never Lose User-Facing Content" codified in CONTRIBUTING.md
- [x] Copilot Chat message ordering fixed via replyToId anchoring
- [x] Tool description voice standard codified in CONTRIBUTING.md
- [x] Streamed content noise cleared when valid final_answer exists (onClearText)
- [x] Robust final_answer extraction: `parsed.answer` and quoted JSON string both work
- [x] Truncated JSON and wrong-shape JSON trigger retry (model gets another chance)
- [x] Retry does not count against toolRounds (error recovery, not a tool round -- toolRounds removed entirely)
- [x] Preemptive message splitting removed — full message sent, split only on error recovery
- [x] Dead-stream fallback -- flush() routes through sendMessage when stream is stopped
- [x] ~~Async delivery pattern for 15s platform timeout -- deadline timer emits acknowledgment, real content via sendMessage~~ (REVERTED: replaced by chunked streaming)
- [x] Deadline timer (units 16a-16c) reverted cleanly
- [x] `--disable-streaming` / buffered mode removed entirely (no `disableStreaming`, no `buffered` flag, no `teams:no-stream` script, no `flagsSection`)
- [x] Chunked streaming implemented -- periodic flush every ~1s via `flushTextBuffer()`
- [x] Single unified streaming mode (no dual-mode branching)
- [x] `final_answer` tool call arguments streamed progressively via `FinalAnswerParser` state machine -- text appears as model generates, not all at once after stream ends
- [x] Both streaming paths (Chat Completions and Azure Responses API) intercept `final_answer` deltas and emit via `onTextChunk`
- [x] `onClearText` called when `final_answer` tool call starts to clear noise
- [x] `finalAnswerStreamed` flag on `TurnResult` -- core.ts skips redundant `onClearText`/`onTextChunk` when already streamed
- [x] Fallback: when parser prefix never matches, existing core.ts behavior unchanged
- [ ] User confirms on Teams: model uses final_answer cleanly, no 413 errors, no "Sorry something went wrong", prompt sections emit correctly, responses arrive in periodic chunks (not per-token, not all-at-once)

### Gate 3: Friend Context Instructions
- [x] Friend context instructions at prompt.ts:178-194 rewritten to be directive with displayName interpolation and aggressive saving
- [ ] `FriendRecord` has `totalTokens: number` field (schema version stays 1)
- [ ] Token accumulation: after each agent turn, `FriendRecord.totalTokens` is updated with `usage.total_tokens`
- [ ] `FriendResolver` auto-populates a `"name"` note from `displayName` on first contact (when displayName is not "Unknown")
- [ ] `isNewFriend` replaced with token threshold check (`totalTokens < ONBOARDING_TOKEN_THRESHOLD`)
- [ ] Onboarding instructions only appear below threshold -- they drop from the system prompt once exceeded
- [ ] Onboarding instruction text and threshold constant live in an auditable location (reviewed by user)
- [ ] User confirms on both surfaces: bot helps first, introduces along the way, proactively calls `save_friend_note` when learning anything about the user without being asked
- [ ] User confirms onboarding instructions disappear after sufficient conversation

### All Gates
- [ ] 100% test coverage on all new and modified code
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
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked · ⏪ Reverted

**CRITICAL: Every unit header MUST start with status emoji.**

---

### GATE 1: Identity + Out-of-Order Messages

### ✅ Unit 1a: Bug 1 (AAD extraction) -- Tests
**What**: Write failing tests for `teamsContext` AAD field population. Tests should verify that when `activity.from.aadObjectId`, `activity.conversation.tenantId`, and `activity.from.name` are present, they are copied into the `teamsContext` object. Also test the fallback case where these fields are absent (conversation-ID fallback still works).
**Output**: New test cases in `src/__tests__/senses/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `teamsContext` doesn't populate AAD fields yet

### ✅ Unit 1b: Bug 1 (AAD extraction) -- Implementation
**What**: Add three fields to the `teamsContext` object literal at `src/senses/teams.ts:492-506`:
```
aadObjectId: activity.from?.aadObjectId,
tenantId: activity.conversation?.tenantId,
displayName: activity.from?.name,
```
`activity` is already destructured at line 458. The `TeamsMessageContext` interface (line 298-305) already declares these optional fields. The resolver at line 344-350 already reads them. This is wiring only.
**Output**: Modified `src/senses/teams.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 1c: Bug 1 (AAD extraction) -- Coverage & Refactor
**What**: Verify 100% coverage on the modified `teamsContext` construction. Ensure both paths are covered: AAD fields present (provider="aad") and absent (provider="teams-conversation" fallback).
**Output**: Coverage report showing full branch coverage
**Acceptance**: 100% coverage on new/modified code, tests still green

### ✅ Unit 2a: Bug 2 (safeSend serialization) -- Tests
**What**: Write failing tests for `safeSend` promise chain serialization. Tests should verify:
1. Concurrent `safeSend` calls execute sends sequentially (not concurrently)
2. A failed send in the chain halts subsequent sends via `markStopped()`
3. The `stopped` flag prevents further sends after chain failure
Test via `createTeamsCallbacks` in `src/__tests__/senses/teams.test.ts`.
**Output**: New test cases in `src/__tests__/senses/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `safeSend` is still fire-and-forget

### ✅ Unit 2b: Bug 2 (safeSend serialization) -- Implementation
**What**: Replace fire-and-forget `catchAsync(sendMessage(text))` in `safeSend` (`src/senses/teams.ts:117-124`) with promise chain serialization:
```typescript
let sendChain = Promise.resolve()
function safeSend(text: string): void {
  if (stopped || !sendMessage) return
  sendChain = sendChain.then(() => sendMessage(text)).catch(() => markStopped())
}
```
Add `sendChain` variable before `safeSend` definition. No changes to call sites (`onToolEnd`, `onKick`, `onError`, `flushTextBuffer`). No changes to `safeEmit` or `safeUpdate`.
**Output**: Modified `src/senses/teams.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 2c: Bug 2 (safeSend serialization) -- Coverage & Refactor
**What**: Verify 100% coverage on the modified `safeSend` function. Ensure all branches covered: normal send, stopped flag, no sendMessage, chain failure halting.
**Output**: Coverage report showing full branch coverage
**Acceptance**: 100% coverage on new/modified code, tests still green

---

### GATE 1 CHECKPOINT
**Manual test**: User deploys and tests on Copilot Chat.
**Expected**: Messages arrive in correct order. displayName populated (or confirmed that Copilot Chat doesn't provide `activity.from.name`, in which case conversation-ID fallback is correct).
**Proceed to Gate 2 only after user confirms.**

---

### GATE 2: Kick Escape Hatch + Self-Trigger

### ✅ Unit 3a: Bug 4 (tool_choice forcing) -- Tests
**What**: Write failing tests for `tool_choice = "required"` when `lastKickReason` is truthy. Tests should verify that after any kick (not just narration), the next API call includes `tool_choice: "required"` for both Azure (Responses API) and non-Azure (Chat Completions) paths. Test in `src/__tests__/heart/core.test.ts`. Also verify all existing kick test expectations remain unchanged.
**Output**: New test cases in `src/__tests__/heart/core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `tool_choice` is only set when `options.toolChoiceRequired` is true, not when `lastKickReason` is truthy

### ✅ Unit 3b: Bug 4 (tool_choice forcing) -- Implementation
**What**: Two one-line changes in `src/heart/core.ts`:
1. Line 288 (Azure path): change `if (options?.toolChoiceRequired)` to `if (options?.toolChoiceRequired || lastKickReason)`
2. Line 303 (non-Azure path): change `if (options?.toolChoiceRequired)` to `if (options?.toolChoiceRequired || lastKickReason)`
`lastKickReason` is already in scope (set by the kick detection logic earlier in the loop). When truthy, it means a kick was applied this iteration and the model must be forced to call a tool.
**Output**: Modified `src/heart/core.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 3c: Bug 4 (kick message self-trigger) -- Tests
**What**: Write a test in `src/__tests__/heart/kicks.test.ts` that verifies the narration kick message does NOT trigger `hasToolIntent()`. Currently it will PASS (the message contains "I can" which matches `/\bi can\b/i`), so the test should assert `hasToolIntent(KICK_MESSAGES.narration) === false`, and it will FAIL because the current message self-triggers.
Note: KICK_MESSAGES is not exported. The test should import `detectKick` and use a narration-kicked response to extract the message, or test `hasToolIntent` with the known kick message text directly.
**Output**: New test case in `src/__tests__/heart/kicks.test.ts`
**Acceptance**: Test exists and FAILS (red) because current kick message contains "I can"

### ✅ Unit 3d: Bug 4 (kick message self-trigger) -- Implementation
**What**: Rewrite the narration kick message at `src/heart/kicks.ts:29` to avoid triggering any `TOOL_INTENT_PATTERNS`. Current message contains "I can" which matches `/\bi can\b/i`. Replace with a message that conveys the same meaning without matching any pattern. Example: `"I narrated instead of acting. Using the tool now -- if done, calling final_answer."` Verify the rewritten message does not match any pattern in `TOOL_INTENT_PATTERNS` by running `hasToolIntent()` against it.
**Output**: Modified `src/heart/kicks.ts`
**Acceptance**: All tests PASS (green), no warnings. The self-trigger test now passes.

### ✅ Unit 3e: Bug 4 -- Coverage & Refactor
**What**: Verify 100% coverage on changes in `core.ts` (tool_choice conditions) and `kicks.ts` (rewritten message). All existing kick tests must still pass with no changes to their expectations.
**Output**: Coverage report showing full branch coverage
**Acceptance**: 100% coverage on new/modified code, all tests green, no warnings

---

### GATE 2 FOLLOW-UP: tool_choice + final_answer Hardening

These units address issues discovered during Gate 2 live testing. The core problem: `tool_choice: required` and `finalAnswerTool` were hardcoded unconditionally in core.ts, bypassing the `toolChoiceRequired` option. Meanwhile, Teams never passed `toolChoiceRequired`, so prompt sections (`toolBehaviorSection`, `toolsSection`) that check this flag never emitted -- the model was forced to call tools but never told about `final_answer` in the prompt.

**Strategy**: Make `toolChoiceRequired` default to `true` (not hardcode it away). This restores the conditional checks everywhere while making them default-on. Teams gets the prompt sections automatically. CLI can still override.

### ✅ Unit 5a: Issue A (toolChoiceRequired default) -- Tests
**What**: Write failing tests in `src/__tests__/heart/core.test.ts` verifying:
1. When `runAgent` is called WITHOUT `toolChoiceRequired` in options, `tool_choice: "required"` is still set (because it defaults to true)
2. When `runAgent` is called with `toolChoiceRequired: false`, `tool_choice` is NOT set
3. When called without `toolChoiceRequired`, `activeTools` includes `finalAnswerTool`
4. When called with `toolChoiceRequired: false`, `activeTools` does NOT include `finalAnswerTool`

Tests should cover both Azure (Responses API) and non-Azure (Chat Completions) paths.
**Output**: New test cases in `src/__tests__/heart/core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `tool_choice` is currently hardcoded unconditionally (ignores option)

### ✅ Unit 5b: Issue A (toolChoiceRequired default) -- Implementation
**What**: Three changes in `src/heart/core.ts`:
1. Default `toolChoiceRequired` to `true`: near top of `runAgent`, add `const toolChoiceRequired = options?.toolChoiceRequired ?? true;`
2. Restore conditional `activeTools`: change line 262 from `const activeTools = [...baseTools, finalAnswerTool]` to `const activeTools = toolChoiceRequired ? [...baseTools, finalAnswerTool] : baseTools`
3. Restore conditional `tool_choice`: change lines 289 and 304 from unconditional `azureParams.tool_choice = "required"` / `createParams.tool_choice = "required"` to conditional `if (toolChoiceRequired || lastKickReason)` (preserving the kick override from Unit 3b)

Update the comment at lines 259-261 to reflect "defaults to true, overridable via options".
**Output**: Modified `src/heart/core.ts`
**Acceptance**: All tests PASS (green), no warnings. The Unit 3a/3b kick tests still pass (kick override preserved).

### ✅ Unit 5c: Issue A (toolChoiceRequired default) -- Coverage & Refactor
**What**: Verify 100% coverage on modified `runAgent` logic. Both `toolChoiceRequired: true` (default) and `toolChoiceRequired: false` branches must be covered for activeTools and tool_choice setting. Kick override path must also be covered.
**Output**: Coverage report showing full branch coverage
**Acceptance**: 100% coverage on new/modified code, all tests green, no warnings

### ✅ Unit 6a: Issue B (toolBehaviorSection prompt) -- Tests
**What**: Write failing tests in `src/__tests__/mind/prompt.test.ts` verifying:
1. `toolBehaviorSection()` emits content when called with NO options (defaults on)
2. `toolBehaviorSection()` emits content when called with `{ toolChoiceRequired: true }`
3. `toolBehaviorSection()` returns empty string when called with `{ toolChoiceRequired: false }`
4. The emitted content contains decision-tree framing: mentions calling tools for info and `final_answer` for responding
5. The emitted content contains anti-no-op pattern: warns against calling `get_current_time` or other no-ops before `final_answer`
6. The emitted content clarifies that `final_answer` IS a tool call satisfying the requirement

Also test `toolsSection()` (Issue E):
7. `toolsSection()` includes `final_answer` in tool list when called with no options (defaults on)
8. `toolsSection()` does NOT include `final_answer` when called with `{ toolChoiceRequired: false }`
**Output**: New test cases in `src/__tests__/mind/prompt.test.ts`
**Acceptance**: Tests exist and FAIL (red) because current `toolBehaviorSection` returns empty string when no options passed, and prompt text doesn't contain the new framing

### ✅ Unit 6b: Issue B + E (toolBehaviorSection + toolsSection) -- Implementation
**What**: Two changes in `src/mind/prompt.ts`:
1. `toolBehaviorSection()` at line 136: change guard from `if (!options?.toolChoiceRequired)` to `if (!(options?.toolChoiceRequired ?? true))` so it defaults on. Rewrite the prompt text:
   - Decision tree: "need more information? call a tool. ready to respond to the user? call `final_answer`."
   - Anti-pattern: "do NOT call `get_current_time` or other no-op tools just before `final_answer`. if you are done, call `final_answer` directly."
   - Clarification: "`final_answer` is a tool call -- it satisfies the tool_choice requirement."
   - Keep existing rule: `final_answer` must be the ONLY tool call in that turn.
2. `toolsSection()` at line 97: change from `options?.toolChoiceRequired ? [...channelTools, finalAnswerTool] : channelTools` to `(options?.toolChoiceRequired ?? true) ? [...channelTools, finalAnswerTool] : channelTools` so it defaults on.
**Output**: Modified `src/mind/prompt.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 6c: Issue B + E -- Coverage & Refactor
**What**: Verify 100% coverage on `toolBehaviorSection()` and `toolsSection()`. Both default-on and explicit-false paths must be covered.
**Output**: Coverage report showing full branch coverage
**Acceptance**: 100% coverage on new/modified code, tests still green

### ✅ Unit 7a: Issue C (finalAnswerTool description) -- Tests
**What**: Write a failing test in `src/__tests__/repertoire/tools.test.ts` (or the appropriate test file for tools-base.ts) verifying:
1. `finalAnswerTool.function.description` frames it as the primary response mechanism (contains "respond to the user" or similar), NOT as an alternative ("instead of calling another tool")
**Output**: New test case
**Acceptance**: Test exists and FAILS (red) because current description says "instead of calling another tool"

### ✅ Unit 7b: Issue C (finalAnswerTool description) -- Implementation
**What**: In `src/repertoire/tools-base.ts` at line 359-360, change the description from:
`"give your final text response. use this when you want to reply with text instead of calling another tool."`
to something like:
`"respond to the user with your message. call this tool when you are ready to deliver your response."`
**Output**: Modified `src/repertoire/tools-base.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 7c: Issue C -- Coverage & Refactor
**What**: Verify the `finalAnswerTool` export is covered. This is a static definition so coverage is inherent, but verify no regressions in tools.test.ts.
**Output**: Coverage report
**Acceptance**: 100% coverage, all tests green

### ✅ Unit 8a: Issue D (final_answer onTextChunk emission) -- Test Coverage Verification
**What**: Verify existing test coverage for the `final_answer` -> `callbacks.onTextChunk` path in `src/heart/core.ts` (lines 357-377). This was implemented in commits 43762ec and d7c184b. Check:
1. Test exists verifying `onTextChunk` is called with the parsed answer text when `final_answer` is the sole tool call
2. Test covers the JSON parse fallback (when `result.toolCalls[0].arguments` is malformed, falls back to `result.content`)
3. Test covers the `answer` being falsy (no `onTextChunk` call)
4. Test covers mixed-call rejection (final_answer combined with other tools is rejected)

If any coverage gaps exist, write additional tests.
**Output**: Coverage report or new tests if gaps found
**Acceptance**: 100% coverage on the final_answer interception block (lines 357-377), all tests green

### ✅ Unit 9a: Issue F (response size / 413 error) -- Tests
**What**: Write tests verifying:
1. The system prompt for Teams channel includes `max 4000 chars` (already present via `channelCapabilities.maxMessageLength` in `contextSection`)
2. The `toolBehaviorSection` or `final_answer` description reminds the model of message length constraints (optional -- verify if the existing channel traits line is sufficient)
3. A truncation safety net: if `final_answer` text exceeds the channel's `maxMessageLength`, it is truncated before emission via `onTextChunk`. Test in core.ts or the callback layer.

Focus: the truncation test should verify that when `final_answer` returns text longer than `maxMessageLength`, the emitted text is truncated to fit.
**Output**: New test cases
**Acceptance**: Tests exist. Truncation test FAILS (red) because no truncation logic exists yet.

### ✅ Unit 9b: Issue F (response size / 413 error) -- Implementation
**What**: Add truncation safety net in `src/heart/core.ts` at the `final_answer` interception block (around line 368). After parsing the answer text:
1. Get `maxMessageLength` from channel capabilities (pass channel caps into scope or look up from channel parameter)
2. If `answer.length > maxMessageLength` and `maxMessageLength !== Infinity`, truncate to `maxMessageLength - 20` chars and append `\n\n[truncated]`
3. Then emit via `callbacks.onTextChunk(answer)`

The channel capabilities are already available via `getChannelCapabilities(channel)` import. The `channel` parameter is already in scope in `runAgent`.
**Output**: Modified `src/heart/core.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 9c: Issue F -- Coverage & Refactor
**What**: Verify 100% coverage on the truncation logic. Cover: no truncation needed (under limit), truncation triggered (over limit), Infinity maxMessageLength (no truncation), no channel (no truncation).
**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

### ✅ Unit 10a: Codify tool description voice standard in docs
**What**: Add a "Tool Descriptions" section to CONTRIBUTING.md (the project's code style/conventions doc). The section should codify:
- Tool descriptions use imperative/descriptive voice ("respond to the user with a message", "search the web for information") -- this is what models are trained on
- System prompt instructions about tools use first person to match the bot's voice ("when i'm ready to respond, i call final_answer")
- Reference Anthropic's guidance: describe tools as you would to a new team member, make implicit context explicit
- Brief, 5-10 lines max
**Output**: Updated `CONTRIBUTING.md`
**Acceptance**: The convention is documented, consistent with existing doc style

### ✅ Unit 11a: Message splitting -- replace truncation with chunked delivery
**What**: Remove truncation logic from core.ts. Add `splitMessage()` to teams.ts that splits at paragraph > line > word > hard-cut boundaries. Update `flushTextBuffer()` and `flush()` to split long messages: first chunk to `safeEmit`, rest to `safeSend`. Add `MAX_MESSAGE_LENGTH = 4000` constant. Tests for splitMessage (7 cases) and flush splitting (3 cases). P0 "Never Lose User-Facing Content" section added to CONTRIBUTING.md.
**Output**: Modified `src/senses/teams.ts`, `src/heart/core.ts`, `src/__tests__/senses/teams.test.ts`, `src/__tests__/heart/core.test.ts`, `CONTRIBUTING.md`
**Acceptance**: No content is ever truncated or lost. All tests pass, 100% coverage on splitMessage

### ✅ Unit 12a: Copilot Chat message ordering -- replyToId anchoring
**What**: Follow-up messages from `safeSend` appeared above the user's message in Copilot Chat because `ctx.send(text)` creates messages without `replyToId`. Fix: change to `ctx.send({ type: "message", text, replyToId: activity.id })`. This anchors follow-up messages after the user's inbound activity without the blockquote that `ctx.reply()` adds. No impact on standard Teams 1:1 (replyToId ignored, always chronological).
**Output**: Modified `src/senses/teams.ts`
**Acceptance**: Follow-up chunks appear in correct order in Copilot Chat

### ✅ Unit 13a: final_answer noise suppression -- onClearText callback
**What**: When the model returns both `content` (e.g. refusal noise) AND a valid `final_answer` tool call, the streamed content was already in `textBuffer` and the final_answer text was appended -- showing both. Fix: add `onClearText?: () => void` to `ChannelCallbacks`. In `isSoleFinalAnswer` block, call `onClearText()` before emitting `parsed.answer`. In teams.ts, implement as `textBuffer = ""`. Also: stop falling back to `result.content` when JSON parsing fails (it was already streamed, re-emitting doubles it).
**Output**: Modified `src/heart/core.ts`, `src/senses/teams.ts`, `src/__tests__/heart/core.test.ts`
**Acceptance**: No doubled refusal text. Valid final_answer supersedes streamed noise. All tests pass

### ✅ Unit 14a: Remove artificial tool loop limit
**What**: Remove `toolRounds`, `MAX_TOOL_ROUNDS`, and the associated check from `src/heart/core.ts`. The harness is code for the model to use — it should provide feedback on errors, not enforce arbitrary limits. Natural limits already exist: context overflow (handled by `isContextOverflow`), user abort (handled by `signal.aborted`), API errors (handled by retry/error callbacks).

Remove:
- `export const MAX_TOOL_ROUNDS = 10` (line 104)
- `let toolRounds = 0` (line 241)
- `setMaxListeners(MAX_TOOL_ROUNDS + 5, signal)` → use a fixed generous value (e.g. 50)
- `toolRounds++` and the `if (toolRounds >= MAX_TOOL_ROUNDS)` block (lines 394-402) including `stripLastToolCalls` and error emission
- Commented-out `toolRounds` references in the kick detection block (lines 345-347)

Update tests: remove or update the tool loop limit test that asserts `MAX_TOOL_ROUNDS` behavior. Remove skipped tests that reference `MAX_TOOL_ROUNDS`.
**Output**: Modified `src/heart/core.ts`, `src/__tests__/heart/core.test.ts`
**Acceptance**: All tests pass, no references to `toolRounds` or `MAX_TOOL_ROUNDS` remain in src/

### ✅ Unit 14b: final_answer answer extraction -- tests
**What**: Write failing tests in `src/__tests__/heart/core.test.ts` verifying the full answer extraction logic for `isSoleFinalAnswer`:
1. `{"answer":"text"}` → uses `parsed.answer` (existing, should pass)
2. `"just a string"` (valid JSON string) → uses the string directly as the answer
3. `{"answer":"truncated...` (invalid JSON) → retries: pushes tool error result and continues the loop
4. `{"text":"hello"}` (valid JSON, no `answer` field) → retries: pushes tool error result
5. On successful retry after truncation, the valid answer is emitted normally
6. Streamed `content` noise is cleared (via `onClearText`) before emitting answer or retrying
**Output**: New test cases in `src/__tests__/heart/core.test.ts`
**Acceptance**: Tests exist and FAIL for cases 2, 3, 4 (current code doesn't handle these)

### ✅ Unit 14c: final_answer answer extraction -- implementation
**What**: Rewrite the answer extraction in `isSoleFinalAnswer` block of `src/heart/core.ts`:
```
try parse JSON:
  typeof parsed === "string" → answer = parsed
  parsed.answer exists       → answer = parsed.answer
  else                       → answer = undefined (will retry)
catch:
  → answer = undefined (truncated/invalid JSON, will retry)
```
When `answer` is defined: clear noise (`onClearText`), emit via `onTextChunk`, push message + `(delivered)`, done.
When `answer` is undefined (retry path):
1. Clear noise: `callbacks.onClearText?.()`
2. Push assistant message with tool_calls (keeps conversation valid)
3. Push tool result: `"your final_answer was incomplete or malformed. call final_answer again with your complete response."`
4. Keep azureInput in sync if applicable
5. `continue` the loop (do NOT set `done = true`)
**Output**: Modified `src/heart/core.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 14d: final_answer answer extraction -- coverage & refactor
**What**: Verify 100% coverage on the modified `isSoleFinalAnswer` block. All paths covered: valid answer, quoted string, truncated JSON retry, wrong-shape retry, retry then succeed. Verify Azure Responses API path stays in sync during retry (azureInput gets function_call_output).
**Output**: Coverage report
**Acceptance**: 100% coverage on modified code, all tests green

### ✅ Unit 15a: Remove preemptive message splitting -- try full send, split on error recovery
**What**: Remove preemptive `splitMessage` from `flushTextBuffer()` and `flush()` in `src/senses/teams.ts`. Same philosophy as removing MAX_TOOL_ROUNDS: don't enforce artificial limits in code, handle failures gracefully.

Changes:
1. Rename `MAX_MESSAGE_LENGTH` to `RECOVERY_CHUNK_SIZE` (only used for error recovery)
2. `flushTextBuffer()`: send full `textBuffer` without splitting — `safeEmit` or `safeSend` as before
3. `flush()`: send full `textBuffer` without splitting. Wrap `sendMessage` calls in try/catch — on failure, split with `splitMessage(textBuffer, RECOVERY_CHUNK_SIZE)` and retry each chunk
4. Update tests: existing split assertions → assert full text sent. Add error recovery test.
5. Keep `splitMessage` exported (used for recovery + still unit-tested)

**Note (post-completion)**: Dead-stream fallback (commit 406bffe) was added on top of this unit -- `flush()` routes through `sendMessage` when `stopped && sendMessage`. This remains valid and useful independent of the deadline timer work.

**Output**: Modified `src/senses/teams.ts`, `src/__tests__/senses/teams.test.ts`
**Acceptance**: Full text sent without preemptive splitting. Error recovery splits on failure. All tests pass, 100% coverage.

### ⏪ Unit 16a: Async delivery for platform 15s timeout -- tests (REVERTED)
**What**: The Copilot platform enforces a hard 15-second timeout for the initial `stream.emit()`. `stream.update()` (thinking phrases) does NOT satisfy this — the platform wants actual content. When the agent takes >15s, the stream dies and shows "Sorry, something went wrong." MS docs recommend: send an initial response within 15s, deliver real content as a follow-up message via `sendActivity`/`ctx.send`.

Write failing tests in `src/__tests__/senses/teams.test.ts` verifying:
1. **Buffered mode, fast response (<12s)**: content delivered via `safeEmit` on stream, no deadline fires, no `sendMessage` used for content
2. **Buffered mode, slow response (>12s)**: deadline fires, brief acknowledgment emitted on stream via `safeEmit`, `flush()` delivers real content via `sendMessage` (not stream)
3. **Streaming mode, fast first token (<12s)**: first `safeEmit` cancels the deadline timer, normal streaming continues
4. **Streaming mode, slow first token (>12s)**: deadline fires, acknowledgment emitted on stream, subsequent text still streams normally
5. **Timer cleanup**: timer is cleared when controller aborts (no leaked timers)

Use `vi.useFakeTimers()` to control the 12s deadline.
**Output**: New test cases in `src/__tests__/senses/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because no deadline timer exists yet

### ⏪ Unit 16b: Async delivery for platform 15s timeout -- implementation (REVERTED)
**What**: Implement the deadline timer in `createTeamsCallbacks` (`src/senses/teams.ts`):

1. Add constant `STREAM_DEADLINE_MS = 12_000` (12s, with 3s safety margin before 15s platform timeout)
2. Add state: `let deadlineFired = false`, `let deadlineTimer: NodeJS.Timeout | null = null`
3. Start the deadline timer in the constructor scope. When it fires:
   - Call `safeEmit("one moment — still working on this")` (satisfies the 15s platform requirement)
   - Set `deadlineFired = true`
   - Timer self-clears (`deadlineTimer = null`)
4. In `safeEmit`: on first real call (before deadline fires), cancel the deadline timer. Use a flag or check `deadlineTimer` to avoid cancelling after it already fired.
5. In `flush()`:
   - If `deadlineFired && sendMessage`: route content through `sendMessage` (with split-on-error recovery). The stream already has the acknowledgment.
   - If `!deadlineFired && !stopped`: route through `safeEmit` as normal (fast path)
   - If `stopped && sendMessage`: route through `sendMessage` (existing dead-stream fallback)
6. In `flushTextBuffer()`: same check — if `deadlineFired`, route through `safeSend` instead of `safeEmit`
7. Cleanup: clear `deadlineTimer` in `markStopped()` and when controller signal fires abort

Both streaming and buffered modes get the timer. In streaming mode, the first `onTextChunk` → `safeEmit` cancels it early. In buffered mode, `onTextChunk` accumulates in textBuffer (no `safeEmit`), so the timer fires if generation takes >12s.

**Output**: Modified `src/senses/teams.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⏪ Unit 16c: Async delivery -- coverage & refactor (REVERTED)
**What**: Verify 100% coverage on the deadline timer logic. All paths covered: fast path (timer cancelled), slow path (timer fires, sendMessage delivery), abort cleanup, streaming mode cancellation.
**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

> **Reverted**: Units 16a-16c implemented a 12s deadline timer that emits an acknowledgment message and routes content through `sendMessage`. Live testing revealed this approach is wrong for two reasons: (1) the deadline fires on every query in buffered mode because even fast responses take >12s through devtunnel (the timer can't distinguish "model is slow" from "network is slow"), showing a useless "one moment" message on every response, and (2) investigation found the real problem is per-token streaming causing 100+ HTTP POSTs throttled at 1 req/sec by Teams, not the 15s platform timeout. The correct fix is chunked streaming (periodic flush every ~1.5-2s), which keeps the stream alive, reduces HTTP roundtrips to ~10-15, and makes the deadline timer unnecessary. See Units 17-19 below.

> **Research findings** (documented for context):
> - Streaming is outbound HTTP POSTs to Bot Framework Connector Service, not through devtunnel ([MS docs: streaming UX](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/streaming-ux))
> - Teams throttles streaming to 1 req/sec with exponential backoff retries
> - SDK re-sends ALL cumulative text with each chunk -- payload grows linearly
> - SDK flushes sequentially -- each chunk must complete before next sends
> - SDK debounces at 500ms but throttle is 1/sec -- half the requests get throttled
> - The `--disable-streaming` rationale ("devtunnel buffers chunked responses") was wrong -- the slowness is from Teams platform throttling, not devtunnel
> - Buffered mode works in Teams 1:1 but breaks Copilot (15s platform timeout: [MS answers](https://learn.microsoft.com/en-us/answers/questions/2288017/m365-custom-engine-agents-timeout-message-after-15))
> - Async messaging pattern exists but is complex: [MS docs](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/custom-engine-agent-asynchronous-flow)
> - Streaming unavailable with function calling: same streaming-ux doc
> - DevtoolsPlugin for local dev: [MS docs](https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/developer-tools/devtools/chat)

### GATE 2 FOLLOW-UP CONTINUED: Chunked Streaming

These units replace units 16a-16c (deadline timer) and the `--disable-streaming` / buffered mode with a single unified approach: **chunked streaming**. Instead of per-token streaming (throttled, unusably slow) or buffering everything (breaks Copilot 15s timeout), we accumulate text in `textBuffer` and flush via `safeEmit` every ~1.5-2 seconds on a periodic timer.

**Benefits**:
- Keeps the stream alive (first emit well within 15s -- Copilot happy)
- Reduces HTTP roundtrips from hundreds to ~10-15 per response
- Stays within 1 req/sec Teams throttle
- Works identically through devtunnel or in production
- Eliminates dual-mode complexity (no more streaming vs buffered branching)

### ✅ Unit 17a: Revert deadline timer (units 16a-16c) -- git revert
**What**: Revert the commits that implemented the deadline timer. The commits to revert are all commits after 406bffe on this branch (see `git log --oneline 406bffe..HEAD` -- skip doc-only commits, revert the code commits: `73ba07d`, `6c2b1af`, `e4bd591`, and the revert-of-revert `8763d81`). The goal is to return `src/senses/teams.ts` and `src/__tests__/senses/teams.test.ts` to their state at commit 406bffe (before deadline timer was added). Verify with `git diff 406bffe -- src/senses/teams.ts src/__tests__/senses/teams.test.ts` that the diff is empty after reverting. If git revert is messy (due to the revert-of-revert chain), use `git checkout 406bffe -- src/senses/teams.ts src/__tests__/senses/teams.test.ts` and commit.
**Output**: Clean revert commit(s). `src/senses/teams.ts` and `src/__tests__/senses/teams.test.ts` match their 406bffe state.
**Acceptance**: `git diff 406bffe -- src/senses/teams.ts src/__tests__/senses/teams.test.ts` shows no diff. All tests pass (the deadline timer tests are gone). Build clean.

### ✅ Unit 18a: Remove disableStreaming / buffered mode -- tests
**What**: Write tests verifying the unified chunked streaming behavior (no dual-mode branching). Tests should verify:
1. `createTeamsCallbacks` no longer accepts `disableStreaming` option (or ignores it)
2. `onTextChunk` always accumulates in `textBuffer` (never calls `safeEmit` per-token)
3. `onReasoningChunk` always accumulates in `reasoningBuf` (never calls `safeUpdate` per-token)
4. `onToolEnd` and `onKick` always use `safeUpdate`; `onError` terminal always uses `safeSend`, transient always uses `safeUpdate` -- no `buffered` branching
5. `onToolStart` always flushes `textBuffer` before showing tool status

These tests replace the "createTeamsCallbacks with disableStreaming" describe block. Keep tests for: `safeSend` serialization, `sendChain` error handling, `flushTextBuffer`, `flush()`, dead-stream fallback, error recovery splitting.

Also verify the removal propagates:
6. `handleTeamsMessage` no longer accepts `disableStreaming` parameter
7. `startTeamsApp` no longer reads `--disable-streaming` from `process.argv` or `getTeamsChannelConfig().disableStreaming`
8. `TeamsCallbackOptions.disableStreaming` is removed; `flushIntervalMs` is added (optional)
9. `RunAgentOptions.disableStreaming` is removed
10. `BuildSystemOptions.disableStreaming` is removed
11. `flagsSection` is removed or returns empty (no longer needed)
12. `TeamsChannelConfig.disableStreaming` replaced with `flushIntervalMs?: number`

**Output**: Updated tests in `src/__tests__/senses/teams.test.ts`, `src/__tests__/heart/core.test.ts`, `src/__tests__/mind/prompt.test.ts`, `src/__tests__/config.test.ts`
**Acceptance**: Tests exist and FAIL because the `buffered` flag and dual-mode branching still exist

### ✅ Unit 18b: Remove disableStreaming / buffered mode -- implementation
**What**: Remove all `disableStreaming` / `buffered` mode code across the codebase:

**`src/senses/teams.ts`**:
1. Remove `disableStreaming` from `TeamsCallbackOptions` interface (line 74)
2. Remove `const buffered = options?.disableStreaming === true` (line 100)
3. `onReasoningChunk`: remove `if (!buffered)` guard -- never call per-token `safeUpdate` for reasoning (the phrase rotation timer and tool status updates provide sufficient keep-alive; reasoning text is internal, not user-facing content)
4. `onTextChunk`: remove `if (buffered)` branch -- always accumulate in `textBuffer` (never `safeEmit` per-token)
5. `onToolStart`: remove `if (buffered)` -- always call `flushTextBuffer()` before tool status
6. `onToolEnd`: remove `if (buffered)` branch -- always use `safeUpdate` (not `safeEmit`)
7. `onKick`: remove `if (buffered)` branch -- always use `safeUpdate` (not `safeEmit`)
8. `onError`: remove `else if (buffered)` branch -- terminal errors always use `safeSend` (not `safeEmit`, which would inject error text into accumulated content), transient always use `safeUpdate`
9. `handleTeamsMessage`: remove `disableStreaming` parameter, remove `agentOptions.disableStreaming` setting
10. `startTeamsApp`: remove `--disable-streaming` argv check (line 516), remove `getTeamsChannelConfig().disableStreaming` check (line 517), remove `disableStreaming` arg from `handleTeamsMessage` call (line 605), update startup log (line 632), update module comment (lines 508-511)
11. Update the module-level comment block (lines 82-93) to describe the unified chunked streaming approach (remove "Dual-mode rendering" section, describe chunked streaming: text accumulated in textBuffer, flushed periodically via safeEmit)

**`src/heart/core.ts`**:
12. Remove `disableStreaming` from `RunAgentOptions` interface (line 95)

**`src/mind/prompt.ts`**:
13. Remove `disableStreaming` from `BuildSystemOptions` interface (line 112)
14. Remove `flagsSection` function entirely (lines 115-134) -- no longer needed
15. Remove `flagsSection` call from `buildSystem`

**`src/config.ts`**:
16. Replace `disableStreaming: boolean` with `flushIntervalMs?: number` in `TeamsChannelConfig` interface (line 39). Optional -- when absent, `DEFAULT_FLUSH_INTERVAL_MS` (1000) is used.
17. Remove `disableStreaming: false` from `DEFAULT_CONFIG` (line 90). Do NOT add a `flushIntervalMs` default -- omitting it means the code default is used, and config.json only needs to specify it when tuning.

**`package.json`**:
18. Remove `teams:no-stream` script

**Output**: Modified files listed above
**Acceptance**: All tests PASS (green), no warnings. No references to `disableStreaming` or `buffered` remain in `src/` (except possibly test file comments explaining what was removed). `npm run teams:no-stream` no longer exists.

### ✅ Unit 18c: Remove disableStreaming / buffered mode -- coverage & refactor
**What**: Verify 100% coverage on all modified code paths. With the `buffered` branching removed, there should be fewer branches to cover. Verify:
1. `onTextChunk` always accumulates (single path)
2. `onReasoningChunk` always accumulates (single path)
3. `onToolEnd/onKick/onError` unified paths covered
4. `handleTeamsMessage` and `startTeamsApp` modified paths covered
5. No references to `disableStreaming`, `buffered`, `--disable-streaming`, `teams:no-stream` remain in `src/`
**Output**: Coverage report
**Acceptance**: 100% coverage on modified code, all tests green, no warnings

### ✅ Unit 19a: Chunked streaming (periodic flush timer) -- tests
**What**: Write failing tests in `src/__tests__/senses/teams.test.ts` for the periodic flush timer. Use `vi.useFakeTimers()`. Tests should verify:
1. **Periodic flush fires**: after `onTextChunk` accumulates text, advancing time by the flush interval (~1500-2000ms) triggers `flushTextBuffer()` -- first flush goes to `safeEmit`, subsequent to `safeSend`
2. **Multiple flushes**: text accumulated across multiple intervals is flushed periodically -- each interval flushes whatever has accumulated since last flush
3. **No flush when empty**: if no text has accumulated, the timer tick is a no-op (no empty `safeEmit` or `safeSend` calls)
4. **Timer starts on first `onTextChunk`**: the flush timer is not running until text starts arriving (avoid unnecessary timers during reasoning-only phases)
5. **Timer cleared on abort**: when `controller.abort()` fires, the flush timer is cleaned up (no leaked intervals)
6. **Timer cleared on `flush()`**: when `flush()` is called (end of turn), the periodic timer is stopped and any remaining buffer is flushed
7. **Timer cleared on `markStopped()`**: when the stream dies (403), the periodic timer is cleaned up
8. **First flush within 15s**: even with slow token generation, the first periodic flush happens well within 15s (Copilot platform timeout) -- e.g., if flush interval is 1.5s, first flush at 1.5s after first token
9. **Reasoning phase**: during `onReasoningChunk`-only phase (no text yet), the flush timer is NOT started -- phrase rotation timer handles keep-alive during reasoning. Once `onTextChunk` starts, the flush timer starts.
10. **`flush()` at end of turn**: `flush()` flushes remaining buffer and stops the periodic timer. If stream has content (`streamHasContent`), remaining text goes to `sendMessage`. If not, goes to `safeEmit`.

**Output**: New test cases in `src/__tests__/senses/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because no periodic flush timer exists yet

### ✅ Unit 19b: Chunked streaming (periodic flush timer) -- implementation
**What**: Implement the periodic flush timer in `createTeamsCallbacks` (`src/senses/teams.ts`):

1. Add constant `DEFAULT_FLUSH_INTERVAL_MS = 1_000` (1s -- at the Teams 1 req/sec throttle floor; tune up if 429s observed). Export for testability. Add a comment block above the constant documenting why chunked streaming exists and this specific value, with links:
   - Teams streaming throttle (1 req/sec): https://learn.microsoft.com/en-us/microsoftteams/platform/bots/streaming-ux
   - Copilot 15s platform timeout: https://learn.microsoft.com/en-us/answers/questions/2288017/m365-custom-engine-agents-timeout-message-after-15
   - SDK debounces at 500ms internally, cumulative text re-sent each chunk — per-token streaming causes compounding latency
2. Read the configured interval: `const flushInterval = options?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS`. Thread `flushIntervalMs` through `TeamsCallbackOptions` from `getTeamsChannelConfig().flushIntervalMs` in `handleTeamsMessage`. This makes the value tunable via `config.json` without code changes.
3. Add state: `let flushTimer: NodeJS.Timeout | null = null`
4. Add `startFlushTimer()`: if `flushTimer` is null, start `setInterval(() => flushTextBuffer(), flushInterval)`. Idempotent -- calling when timer already running is a no-op.
5. Add `stopFlushTimer()`: clear `flushTimer` interval if set, set to null. Idempotent.
6. In `onTextChunk`: after accumulating `textBuffer += text`, call `startFlushTimer()` to ensure periodic flushing is active.
7. In `markStopped()`: call `stopFlushTimer()` (alongside existing `stopPhraseRotation()` cleanup).
8. In controller abort handler: call `stopFlushTimer()`.
9. In `flush()`: call `stopFlushTimer()` before flushing remaining buffer. This prevents the periodic timer from firing after the turn ends.
10. `flushTextBuffer()` is already implemented and handles first-flush-to-emit vs subsequent-to-send logic. No changes needed to it.

The phrase rotation timer (1.5s interval for `safeUpdate`) continues to run during reasoning phases, keeping the stream alive with status updates. Once `onTextChunk` starts, the flush timer takes over for content delivery. Both timers can coexist -- phrase rotation updates status, flush timer delivers content.

**Output**: Modified `src/senses/teams.ts`
**Acceptance**: All tests PASS (green), no warnings. Periodic flush timer starts on first text chunk, flushes at configured interval (default 1s), cleans up properly. Interval tunable via `config.json` `teamsChannel.flushIntervalMs`.

### ✅ Unit 19c: Chunked streaming -- coverage & refactor
**What**: Verify 100% coverage on the periodic flush timer logic. All paths covered:
1. Timer start (first `onTextChunk` starts timer)
2. Timer tick with accumulated text (flushes)
3. Timer tick with empty buffer (no-op)
4. Timer cleanup on abort
5. Timer cleanup on markStopped
6. Timer cleanup on flush()
7. Multiple flushes across intervals
8. Interaction with dead-stream fallback (stopped + sendMessage path in flush)
9. First flush to safeEmit, subsequent to safeSend

**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green, no warnings

### ✅ Unit 20a: Stream final_answer arguments -- Tests
**What**: Write failing tests for progressive streaming of `final_answer` tool call arguments. Tests cover:

1. **FinalAnswerParser unit tests** (in `src/__tests__/heart/streaming.test.ts`):
   - Parses `{"answer":"hello world"}` and returns `"hello world"`
   - Handles JSON escapes: `\"` -> `"`, `\\` -> `\`, `\n` -> newline, `\t` -> tab, `\/` -> `/`
   - Handles unknown escape (e.g. `\x`) by passing through the character
   - Emits nothing before prefix `"answer":"` is matched
   - Emits incrementally across multiple `process()` calls (delta chunking)
   - Stops at unescaped closing `"` -- subsequent `process()` calls return empty string
   - `active` is false before prefix, true after
   - `complete` is false until closing `"`, true after
   - Handles `"answer": "` (space after colon) variant
   - Returns empty string when prefix never matches (e.g. `{"other":"value"}`)
   - Handles empty answer `{"answer":""}`
   - Handles escape sequence split across deltas (e.g. `\` in one delta, `n` in next)

2. **streamChatCompletion integration tests** (in `src/__tests__/heart/streaming.test.ts`):
   - When `final_answer` tool call streams argument deltas, `onTextChunk` is called with parsed answer text progressively
   - `onClearText` is called when `final_answer` tool call is first detected (name delta arrives) -- before any answer text
   - `finalAnswerStreamed` is `true` in the returned `TurnResult`
   - When tool call is not `final_answer`, no streaming of arguments occurs (normal behavior)
   - When prefix never matches (malformed JSON), `finalAnswerStreamed` is `false`

3. **streamResponsesApi integration tests** (in `src/__tests__/heart/streaming.test.ts`):
   - Same as above but for Azure Responses API: `response.function_call_arguments.delta` events for `final_answer` emit via `onTextChunk`
   - `onClearText` called when `final_answer` function call item is added
   - `finalAnswerStreamed` is `true` in the returned `TurnResult`

4. **core.ts integration tests** (in `src/__tests__/heart/core.test.ts`):
   - When `finalAnswerStreamed` is `true`: core.ts skips `onClearText` and `onTextChunk` (no double-emit), still pushes messages and tool result
   - When `finalAnswerStreamed` is `false`: existing behavior unchanged -- `onClearText` + `onTextChunk` called

**Output**: New test cases in `src/__tests__/heart/streaming.test.ts` and `src/__tests__/heart/core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `FinalAnswerParser` doesn't exist, streaming functions don't intercept `final_answer` arguments, `TurnResult` has no `finalAnswerStreamed` flag, and core.ts doesn't check it

### ✅ Unit 20b: Stream final_answer arguments -- Implementation
**What**: Implement progressive streaming of `final_answer` tool call arguments.

1. **`FinalAnswerParser` class** in `src/heart/streaming.ts` (exported):
   - `process(delta: string): string` -- character-level state machine
   - Buffers until prefix `"answer":"` or `"answer": "` is found
   - After prefix: emits text, handles JSON escapes (`\"`, `\\`, `\n`, `\t`, `\/`, default passthrough)
   - Stops at unescaped closing `"`
   - `get active(): boolean` -- true after prefix matched
   - `get complete(): boolean` -- true after closing `"` found

2. **`finalAnswerStreamed` flag** on `TurnResult` interface (streaming.ts line 43-48):
   - Add `finalAnswerStreamed?: boolean` to the interface

3. **`streamChatCompletion` changes** (streaming.ts lines 127-267):
   - Create `FinalAnswerParser` instance before the loop; track `finalAnswerDetected = false`
   - In the `d.tool_calls` block (line 243-256): when a tool call's `name === "final_answer"` is first seen, call `callbacks.onClearText?.()` and set `finalAnswerDetected = true`
   - When `tc.function?.arguments` is present and the tool call at that index is `final_answer`, feed delta to parser via `process()`
   - If `process()` returns non-empty text, call `callbacks.onTextChunk(text)`
   - In the return statement (line 261-266): set `finalAnswerStreamed: parser.active`

4. **`streamResponsesApi` changes** (streaming.ts lines 269-359):
   - Create `FinalAnswerParser` instance before the loop
   - In `response.output_item.added` (line 307-315): when `event.item?.name === "final_answer"`, call `callbacks.onClearText?.()` to clear noise
   - In `response.function_call_arguments.delta` (line 317-321): when `currentToolCall?.name === "final_answer"`, feed `event.delta` to parser, emit result via `callbacks.onTextChunk(text)` if non-empty
   - In the return statement (line 353-358): set `finalAnswerStreamed: parser.active`

5. **core.ts changes** (core.ts lines 353-397):
   - After line 372 (`callbacks.onClearText?.()`), add conditional: if `result.finalAnswerStreamed`, skip `onClearText` and `onTextChunk`
   - Specifically: wrap lines 372 and 377 in `if (!result.finalAnswerStreamed) { ... }` -- the `onClearText?.()` call at 372 and the `onTextChunk(answer)` call at 377
   - Message push and tool result push (lines 380-384) remain unconditional
   - Retry path (lines 386-396) remains unchanged -- `answer` is undefined triggers retry regardless of `finalAnswerStreamed`

**Output**: Modified `src/heart/streaming.ts` and `src/heart/core.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 20c: Stream final_answer arguments -- Coverage & Refactor
**What**: Verify 100% coverage on all new code. Coverage targets:
1. `FinalAnswerParser` -- all branches: prefix matching (both variants), escape sequences (all 6 cases including default), unescaped `"` stop, `done` early-return, empty delta
2. `streamChatCompletion` -- `final_answer` detection branch, parser activation, `onClearText` call, `onTextChunk` forwarding, `finalAnswerStreamed` flag set
3. `streamResponsesApi` -- `final_answer` detection in `output_item.added`, parser feeding in `function_call_arguments.delta`, `onClearText` call, `onTextChunk` forwarding, `finalAnswerStreamed` flag set
4. core.ts `isSoleFinalAnswer` block -- `finalAnswerStreamed` true path (skip clear+emit), false path (existing behavior)
5. Non-`final_answer` tool calls still work normally (no parser activation)

**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green, no warnings

---

### GATE 2 CHECKPOINT
**Manual test**: User deploys and tests on Teams (Copilot Chat and/or standard 1:1) with tool-using and conversational requests.
**Expected**:
- No kick loop, no response spam, no platform timeout
- Model uses `final_answer` to exit cleanly after completing work
- `toolBehaviorSection` and `toolsSection` emit correctly in prompt (verify via logs)
- No 413 errors, no content loss (full messages sent, split only on error recovery)
- `final_answer` text appears in chat (emitted via `onTextChunk`)
- Truncated `final_answer` retries automatically (model gets second chance)
- No doubled refusal text or streamed noise in final output
- Chunked streaming delivers content in periodic flushes (default 1s, tunable via `config.json` `teamsChannel.flushIntervalMs`) -- not per-token, not all-at-once
- First content arrives well within 15s Copilot platform timeout (first flush at ~1s after first token)
- No "Sorry, something went wrong" -- periodic flushes keep the stream alive
- HTTP roundtrips reduced from hundreds to ~10-15 per response (stays within 1 req/sec Teams throttle)
- No `--disable-streaming` flag, no dual-mode branching -- single unified streaming approach
- `flagsSection` removed from prompt (no longer needed)
- `final_answer` text streams progressively as model generates (not buffered until end of stream)
- No duplicate content (answer not emitted twice -- streaming path + core.ts path are mutually exclusive via `finalAnswerStreamed` flag)
- `teams:no-stream` npm script removed
**Also resolves**: Bug 5 (response spam) and Bug 6 (platform timeout).
**Proceed to Gate 3 only after user confirms.**

---

### GATE 3: Friend Context Instructions

### ✅ Unit 4a: Bug 3 (friend context instructions) -- Tests
**What**: Write tests in `src/__tests__/mind/prompt.test.ts` for the rewritten friend context instructions. Tests should verify:
1. New-friend instruction includes displayName interpolation (when displayName is "Unknown", instruction says something about not knowing the name)
2. New-friend instruction is directive (contains action verbs like "save" not aspirational like "should learn")
3. Priority guidance clarifies "help first AND get to know them"
4. Memory instruction pushes aggressive saving (lower bar than "something important")
**Output**: New test cases in `src/__tests__/mind/prompt.test.ts`
**Acceptance**: Tests exist and FAIL (red) because current instructions are aspirational

### ✅ Unit 4b: Bug 3 (friend context instructions) -- Implementation
**What**: Rewrite ~4 lines of prompt text in `contextSection()` at `src/mind/prompt.ts`:
- Line 178 (priority guidance): clarify that priority means "help first AND get to know them" not "help only"
- Line 181 (name quality): make directive -- "when i learn a name, i save it immediately" not "i prefer"
- Line 184 (memory ephemerality): lower the bar -- "anything i learn about my friend" not "something important"
- Lines 193-194 (new-friend block): interpolate displayName. When "Unknown", say "i don't know this friend's name yet -- i ask what they'd like to be called". Make directive: "i save what i learn immediately with save_friend_note" not "i should learn"
Code structure of `contextSection()` unchanged. Only the string literals change.
**Output**: Modified `src/mind/prompt.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 4c: Bug 3 (friend context instructions) -- Coverage & Refactor
**What**: Verify 100% coverage on modified `contextSection()`. Both new-friend and returning-friend paths should be covered. Verify displayName interpolation works for "Unknown" and non-"Unknown" values.
**Output**: Coverage report showing full branch coverage
**Acceptance**: 100% coverage on new/modified code, tests still green

### ⬜ Unit 21a: Add totalTokens to FriendRecord -- Tests
**What**: Write failing tests verifying:
1. `FriendRecord` type includes `totalTokens: number`
2. `FileFriendStore.put()` persists `totalTokens` in the agent knowledge JSON file (it belongs in agent knowledge, not PII bridge)
3. `FileFriendStore.get()` reads `totalTokens` back from disk
4. `FileFriendStore.get()` returns `totalTokens: 0` when reading a legacy record that lacks the field (backward compat -- old records on disk won't have it)
5. `FriendResolver.resolveOrCreate()` initializes `totalTokens: 0` on newly created friend records

Test in `src/__tests__/mind/friends/store-file.test.ts` and `src/__tests__/mind/friends/resolver.test.ts`.
**Output**: New test cases
**Acceptance**: Tests exist and FAIL (red) because `totalTokens` doesn't exist on `FriendRecord`

### ⬜ Unit 21b: Add totalTokens to FriendRecord -- Implementation
**What**: Add `totalTokens: number` to `FriendRecord` in `src/mind/friends/types.ts`. Keep `schemaVersion` at 1 (friend records will be bombed for testing -- no migration needed).

Changes:
1. `src/mind/friends/types.ts`: add `totalTokens: number` to `FriendRecord` interface (after `notes`)
2. `src/mind/friends/store-file.ts`:
   - Add `totalTokens: number` to `AgentKnowledgeData` interface
   - Include `totalTokens` in `put()` split (agent knowledge data)
   - Include `totalTokens` in `merge()` with `?? 0` fallback for legacy records
3. `src/mind/friends/resolver.ts`: initialize `totalTokens: 0` in the new friend object in `resolveOrCreate()`

**Output**: Modified `src/mind/friends/types.ts`, `src/mind/friends/store-file.ts`, `src/mind/friends/resolver.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 21c: Add totalTokens to FriendRecord -- Coverage & Refactor
**What**: Verify 100% coverage on all modified code. Cover: put with totalTokens, get with totalTokens, get with legacy record (no totalTokens on disk -- fallback to 0), resolveOrCreate initializes 0.
**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

### ⬜ Unit 21d: Token accumulation after each turn -- Tests
**What**: Write failing tests verifying token accumulation in both adapters:

1. **`accumulateFriendTokens` helper** (`src/__tests__/mind/friends/tokens.test.ts`): first turn (0 -> N), subsequent turn (existing tokens + new tokens), record persisted with updated `updatedAt`.
2. **CLI adapter**: the CLI `main()` loop is hard to test in isolation (interactive readline). Extract a helper `accumulateFriendTokens(store, friendId, usage)` in a shared location (e.g. `src/mind/friends/tokens.ts`) and test it directly. Both adapters call this helper. Tests in `src/__tests__/mind/friends/tokens.test.ts`.
3. **No usage data**: when `runAgent` returns no usage (e.g. abort), `totalTokens` is NOT updated (no-op).
4. **No friend context**: when `toolContext` has no friend, accumulation is skipped (no crash).

**Output**: New test cases
**Acceptance**: Tests exist and FAIL (red) because no token accumulation logic exists yet

### ⬜ Unit 21e: Token accumulation after each turn -- Implementation
**What**: After each agent turn, read the friend record from disk, increment `totalTokens` by `usage.total_tokens`, and persist. This must happen after `postTurn()` (which saves the session) so the friend record update doesn't race with session save.

Changes:
1. **`src/mind/friends/tokens.ts`** (new file): export `accumulateFriendTokens(store: FriendStore, friendId: string, usage?: UsageData): Promise<void>`. Logic:
   ```
   if (!usage?.total_tokens) return
   const record = await store.get(friendId)
   if (!record) return
   record.totalTokens = (record.totalTokens ?? 0) + usage.total_tokens
   record.updatedAt = new Date().toISOString()
   await store.put(record.id, record)
   ```
2. **`src/senses/teams.ts`** in `handleTeamsMessage()`: after `postTurn(messages, sessPath, result.usage)` (line 493), call `await accumulateFriendTokens(store, toolContext.context.friend.id, result.usage)` (guarded by `toolContext?.context?.friend?.id`).
3. **`src/senses/cli.ts`** in `main()`: after `postTurn(messages, sessPath, result?.usage)` (line 463), call `await accumulateFriendTokens(friendStore, resolvedContext.friend.id, result?.usage)`.

**Output**: New `src/mind/friends/tokens.ts`, modified `src/senses/teams.ts`, `src/senses/cli.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 21f: Token accumulation -- Coverage & Refactor
**What**: Verify 100% coverage on `accumulateFriendTokens` helper and its call sites in both adapters. Cover: usage present (tokens added), usage absent (no-op), record not found on disk (no-op), no friend context in adapter (skip). Verify no race between session save and friend record update.
**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

### ⬜ Unit 21g: Auto-populate name note + token-based onboarding -- Tests
**What**: Write failing tests verifying:

1. **Auto-populate name note** (`src/__tests__/mind/friends/resolver.test.ts`): when `FriendResolver.resolveOrCreate()` creates a new friend with `displayName` != "Unknown", the initial `notes` record includes `{ name: displayName }`. When `displayName` is "Unknown", `notes` is empty `{}` (don't save "Unknown" as a name).
2. **Token threshold check** (`src/__tests__/mind/prompt.test.ts`): `contextSection()` uses `totalTokens < ONBOARDING_TOKEN_THRESHOLD` instead of the notes-exist check. Specifically:
   - Friend with `totalTokens: 0` and no notes -> onboarding instructions appear (new friend block)
   - Friend with `totalTokens: 0` and has notes (e.g. auto-populated name) -> onboarding instructions still appear (below threshold)
   - Friend with `totalTokens: THRESHOLD - 1` -> onboarding instructions still appear
   - Friend with `totalTokens: THRESHOLD` -> onboarding instructions DO NOT appear
   - Friend with `totalTokens: THRESHOLD + 1000` -> onboarding instructions DO NOT appear
3. **Onboarding content** (`src/__tests__/mind/prompt.test.ts`): the onboarding block includes memory instructions ("my conversation memory is ephemeral"), name-quality instruction, and working-memory trust instruction ONLY when below threshold. Above threshold, these instructions are absent.
4. **Non-onboarding instructions persist** (`src/__tests__/mind/prompt.test.ts`): priority guidance ("my friend's request comes first"), stale-notes awareness instruction, and friend notes rendering are NOT gated by the threshold -- they always appear regardless of totalTokens.

**Output**: New test cases
**Acceptance**: Tests exist and FAIL (red) because `isNewFriend` still uses notes-exist check and no threshold constant exists

### ⬜ Unit 21h: Auto-populate name note + token-based onboarding -- Implementation
**What**: Two changes:

1. **Auto-populate name in resolver** (`src/mind/friends/resolver.ts`): in `resolveOrCreate()`, when creating a new friend, if `this.params.displayName !== "Unknown"`, set `notes: { name: this.params.displayName }` instead of `notes: {}`.

2. **Token-based onboarding in prompt** (`src/mind/prompt.ts`):
   - Export a constant `ONBOARDING_TOKEN_THRESHOLD` (initial value TBD -- user to review, suggest 50000 as starting point based on ~5-10 conversations worth of tokens)
   - Replace the `isNewFriend` calculation:
     ```
     // OLD: const isNewFriend = !hasNotes && !hasPrefs
     // NEW:
     const isOnboarding = (friend.totalTokens ?? 0) < ONBOARDING_TOKEN_THRESHOLD
     ```
   - Gate the following instructions behind `isOnboarding` (they only appear below threshold):
     - Name quality instruction ("when i learn a name...")
     - Memory ephemerality instruction ("my conversation memory is ephemeral...")
     - Working-memory trust instruction ("the conversation is my source of truth...")
     - Stale notes awareness instruction ("when i learn something that might invalidate...")
     - The new-friend block (displayName-specific text for Unknown vs known)
   - Keep these instructions OUTSIDE the gate (always appear):
     - Priority guidance ("my friend's request comes first...")
     - Friend notes rendering ("what i know about this friend")

   The onboarding block drops from the system prompt once `totalTokens >= ONBOARDING_TOKEN_THRESHOLD`, reducing prompt size for established friends.

**Output**: Modified `src/mind/friends/resolver.ts`, `src/mind/prompt.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 21i: Auto-populate name note + token-based onboarding -- Coverage & Refactor
**What**: Verify 100% coverage on all modified code:
1. Resolver: name auto-populated when displayName != "Unknown", empty notes when "Unknown"
2. Prompt: onboarding instructions appear below threshold, absent above threshold
3. Prompt: priority guidance and notes rendering always appear
4. Prompt: threshold boundary (exact threshold value = no onboarding)
5. Prompt: `totalTokens` undefined/missing treated as 0 (backward compat via `?? 0`)
**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

### ⬜ Unit 21j: Onboarding instruction content review (DISCUSSION)
**What**: Review with user: the exact onboarding instruction text and the threshold constant value. Items to discuss:
1. **Threshold value**: `ONBOARDING_TOKEN_THRESHOLD` -- what's the right number? 50000 tokens is ~5-10 conversations. Too low and onboarding drops too fast; too high and it bloats prompts for too long.
2. **Which instructions are onboarding-only vs permanent**: The current plan gates memory/name/stale-notes/working-memory instructions behind the threshold. User may want some of these to be permanent.
3. **Placement**: The threshold constant and onboarding text live in `src/mind/prompt.ts` (alongside `contextSection()`). Is this auditable enough, or should the onboarding text be in a separate file (e.g. `src/mind/onboarding.ts` or a psyche file)?
4. **New-friend text**: The "this is a new friend" block currently fires on notes-exist. After this change it fires on totalTokens. Should there be a distinct "first conversation" message (totalTokens === 0) vs "still getting to know you" (0 < totalTokens < threshold)?

This unit is a discussion checkpoint -- no code changes. Implementation of any decisions feeds back into Unit 21h adjustments.
**Output**: Documented decisions in doing doc
**Acceptance**: User has reviewed and approved the onboarding instruction content and threshold

---

### GATE 3 CHECKPOINT
**Manual test**: User tests on both Copilot Chat and standard Teams with fresh friend records (bomb existing friend data to reset).
**Expected**:
- Bot helps first, introduces itself along the way, proactively calls `save_friend_note` when learning anything about the user without being asked
- New friend records have `totalTokens: 0` and a `name` note auto-populated from displayName
- Onboarding instructions appear in the system prompt for new friends
- After sufficient conversation (totalTokens >= threshold), onboarding instructions drop from the system prompt
- Priority guidance and friend notes rendering always appear regardless of totalTokens
- `totalTokens` increments after each turn (visible in friend JSON files on disk)

---

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-03-2008-doing-context-kernel-fixes/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away
- **Gated execution**: Do NOT proceed past a gate checkpoint until user confirms testing passed

## Progress Log
- 2026-03-03 21:59 Created from planning doc (Pass 1 -- First Draft)
- 2026-03-03 21:59 Pass 2 -- Granularity (cleaned up Unit 3d description)
- 2026-03-03 22:00 Pass 3 -- Validation (all line numbers, variable names, interfaces, and code paths verified against codebase -- no corrections needed)
- 2026-03-03 22:00 Pass 4 -- Quality (all 14 units have acceptance criteria, no TBD, all emojis present, proposed kick message verified against all 40 TOOL_INTENT_PATTERNS -- no matches)
- 2026-03-03 22:06 Unit 1a complete: 2 tests for AAD extraction in startTeamsApp handler -- 1 fails (red) because teamsContext lacks AAD fields, 1 passes (fallback already works)
- 2026-03-03 22:07 Unit 1b complete: 3 lines added to teamsContext construction -- aadObjectId, tenantId, displayName from activity. 153 tests pass, build clean
- 2026-03-03 22:07 Unit 1c complete: teams.ts coverage 100% (stmts/branches/funcs/lines). Both AAD-present and AAD-absent paths covered. No refactoring needed
- 2026-03-03 22:09 Unit 2a complete: 2 failing tests for safeSend serialization -- concurrent sends not sequential (fire-and-forget), chain failure does not halt subsequent sends
- 2026-03-03 22:12 Unit 2b complete: safeSend serialized via promise chain with idle/busy tracking -- synchronous first call (preserves existing tests), chained when busy. 155 tests pass, build clean
- 2026-03-03 22:13 Unit 2c complete: teams.ts coverage 100%. Added chained-rejection test for line 136. All 1277 tests pass across 45 files, build clean
- 2026-03-03 22:35 Unit 3a complete: 3 failing tests for tool_choice forcing after kick -- MiniMax narration, Azure narration, MiniMax empty. All fail because core.ts only checks options.toolChoiceRequired, not lastKickReason
- 2026-03-03 22:36 Unit 3b complete: 2 one-line changes in core.ts -- added || lastKickReason to both tool_choice conditions. All 158 core tests pass, build clean
- 2026-03-03 22:37 Unit 3c complete: 1 failing test verifying narration kick message does not self-trigger hasToolIntent(). Fails because message contains "I can" matching /\bi can\b/i
- 2026-03-03 22:39 Unit 3d complete: Rewrote narration kick message from "...I can use final_answer" to "...if done, calling final_answer". 0 pattern matches verified. All 158 core + 107 kicks tests pass, build clean
- 2026-03-03 22:40 Unit 3e complete: core.ts and kicks.ts both 100% coverage (stmts/branches/funcs/lines). All 342 heart tests pass across 4 files. No refactoring needed. Build clean
- 2026-03-04 10:53 Added Gate 2 follow-up units (5a-9c) for Issues A-F: toolChoiceRequired default, toolBehaviorSection prompt, finalAnswerTool description, onTextChunk coverage, response truncation
- 2026-03-04 10:58 Added Unit 10a: codify tool description voice standard in CONTRIBUTING.md; updated completion criteria
- 2026-03-04 11:05 Unit 5a complete: 3 failing tests for toolChoiceRequired opt-out -- tool_choice and finalAnswerTool should not be set when toolChoiceRequired: false (MiniMax + Azure). 2 defaults-on tests renamed for clarity
- 2026-03-04 11:06 Unit 5b complete: toolChoiceRequired defaults true via ?? operator. activeTools and tool_choice conditionally set. 140 tests pass, build clean
- 2026-03-04 11:07 Unit 5c complete: core.ts 100% coverage (stmts/branches/funcs/lines). All 1263 tests pass across 45 files. No refactoring needed
- 2026-03-04 11:09 Unit 6a complete: 5 failing tests -- toolBehaviorSection defaults-on, decision-tree framing, anti-no-op pattern, final_answer clarification, toolsSection defaults-on. 58 existing tests pass
- 2026-03-04 11:10 Unit 6b complete: toolBehaviorSection guard ?? true, prompt rewritten with decision-tree/anti-no-op/clarification. toolsSection guard ?? true. 63 tests pass, build clean
- 2026-03-04 11:11 Unit 6c complete: prompt.ts 100% coverage (stmts/branches/funcs/lines). All 1268 tests pass across 45 files. No refactoring needed
- 2026-03-04 11:11 Unit 7a complete: 1 failing test for finalAnswerTool description -- asserts "respond to the user" and rejects "instead of calling another tool"
- 2026-03-04 11:12 Unit 7b complete: finalAnswerTool description reframed to "respond to the user with your message. call this tool when you are ready to deliver your response." Build clean
- 2026-03-04 11:13 Unit 7c complete: tools-base.ts 100% coverage. All 1268 tests pass. No refactoring needed
- 2026-03-04 11:14 Unit 8a complete: core.ts 100% coverage. final_answer interception block fully covered by 7 existing tests: parsed answer, JSON fallback, empty args, invalid JSON, no content, mixed-call rejection. No gaps
- 2026-03-04 11:15 Unit 9a complete: 3 tests for truncation safety net -- 1 fails (over limit needs truncation), 2 pass (under limit and Infinity). 142 existing tests still pass
- 2026-03-04 11:16 Unit 9b complete: truncation in final_answer block -- getChannelCapabilities(channel).maxMessageLength, slice + "[truncated]". 143 tests pass, build clean
- 2026-03-04 11:17 Unit 9c complete: core.ts 100% coverage. All 1271 tests pass across 45 files. No refactoring needed
- 2026-03-04 11:18 Unit 10a complete: "Tool Descriptions" section added to CONTRIBUTING.md -- imperative voice for schemas, first person for system prompts
- 2026-03-04 13:51 Unit 14a complete: removed toolRounds, MAX_TOOL_ROUNDS, and loop limit block from core.ts. Removed 1 active + 3 skipped tests. setMaxListeners now uses fixed 50. 1281 tests pass, build clean
- 2026-03-04 13:53 Unit 14b complete: 5 failing tests for final_answer extraction -- JSON string, truncated JSON retry, wrong-shape retry, retry-then-succeed, noise clearing on both attempts. All 5 fail, 143 existing pass
- 2026-03-04 13:57 Unit 14c complete: rewrite isSoleFinalAnswer extraction -- JSON string support, retry on truncated/wrong-shape JSON, onClearText on both attempts. Updated 5 existing tests for retry behavior. 1286 tests pass, build clean
- 2026-03-04 13:59 Unit 14d complete: core.ts 100% coverage (stmts/branches/funcs/lines). Added Azure retry test for function_call_output sync. 1287 tests pass across 45 files. No refactoring needed
- 2026-03-04 14:38 Unit 15a complete: removed preemptive splitting from flushTextBuffer() and flush(). Renamed MAX_MESSAGE_LENGTH to RECOVERY_CHUNK_SIZE. flush() now tries full send, splits on error recovery. Updated 3 tests + added error recovery test. 1288 tests pass across 45 files
- 2026-03-04 15:14 Unit 16a complete: 5 tests for deadline timer -- buffered fast/slow, streaming fast/slow, abort cleanup. 2 fail (red): buffered slow + streaming slow (no deadline timer yet). 3 pass: fast paths + cleanup (no timer to interfere)
- 2026-03-04 15:16 Unit 16b complete: 12s deadline timer in createTeamsCallbacks -- STREAM_DEADLINE_MS constant, deadlineFired/deadlineTimer state, cancelDeadline() on first safeEmit, flush/flushTextBuffer routing via sendMessage when fired, cleanup on abort/markStopped. 1294 tests pass across 45 files, build clean
- 2026-03-04 15:19 Unit 16c complete: 100% coverage on all new deadline timer code. 1 v8 ignore for unreachable defensive branch (stopped check in setTimeout callback -- markStopped always clears timer first). Pre-existing gaps (onClearText, ctxSend, !sendMessage) unchanged. 1294 tests pass, no warnings
- 2026-03-04 15:58 Added units 17a-19c for chunked streaming. Marked 16a-16c as reverted with research findings. Updated 15a note, Gate 2 checkpoint, and completion criteria. (Pass 1 -- First Draft)
- 2026-03-04 15:58 Pass 2 -- Granularity: clarified onError terminal routing (safeSend not safeEmit), onReasoningChunk rationale, removed redundant verify-already-reverted items from 19b
- 2026-03-04 16:00 Pass 3 -- Validation: all line numbers, variable names, interfaces verified against codebase. Fixed startTeamsApp line refs (516, 517, 605, 632, 508-511) and module comment block ref (82-93 not 83-93)
- 2026-03-04 16:00 Pass 4 -- Quality: all 7 new units have What/Output/Acceptance, no TBD, all emojis present, added revert emoji to legend, fixed Unit 18a onError description (safeSend for terminal, safeUpdate for transient)
- 2026-03-04 16:17 Unit 17a complete: restored teams.ts and teams.test.ts to 406bffe state via git checkout. Diff empty, 1289 tests pass, build clean
- 2026-03-04 16:27 Unit 18a complete: 39 tests fail (red) -- updated teams.test.ts, prompt.test.ts, config.test.ts for unified chunked streaming behavior. Removed disableStreaming from all test expectations
- 2026-03-04 16:33 Unit 18b complete: removed all disableStreaming/buffered mode code across 5 files -- teams.ts (callbacks, handleTeamsMessage, startTeamsApp), core.ts (RunAgentOptions), prompt.ts (BuildSystemOptions, flagsSection removed), config.ts (TeamsChannelConfig), package.json (teams:no-stream script). 1263 tests pass, build clean
- 2026-03-04 16:34 Unit 18c complete: 100% coverage on all modified files (config.ts, core.ts, prompt.ts). teams.ts uncovered lines 222, 542 are pre-existing gaps (onClearText, ctxSend). Zero references to disableStreaming/buffered/--disable-streaming/teams:no-stream in source code. No refactoring needed
- 2026-03-04 16:36 Unit 19a complete: 11 tests for periodic flush timer using vi.useFakeTimers(). 8 fail (red) -- no periodic timer exists yet. 3 pass vacuously (cleanup tests). Tests cover: timer fires at interval, multiple flushes, empty no-op, start on first text chunk, abort/flush/markStopped cleanup, first flush within 15s, reasoning phase isolation, end-of-turn flush, flushIntervalMs override
- 2026-03-04 16:38 Unit 19b complete: periodic flush timer implemented -- DEFAULT_FLUSH_INTERVAL_MS=1000, startFlushTimer/stopFlushTimer helpers, onTextChunk starts timer, markStopped/flush/abort cleans up, flushIntervalMs threaded from config. 1274 tests pass, build clean
- 2026-03-04 16:39 Unit 19c complete: 100% coverage on all new flush timer code (startFlushTimer, stopFlushTimer, abort listener, flushInterval, onTextChunk startFlushTimer call). Pre-existing uncovered lines 258, 580 (onClearText, ctxSend) unchanged. All 9 coverage criteria verified. No refactoring needed
- 2026-03-04 17:27 Added units 20a-20c for streaming final_answer arguments. Updated Gate 2 completion criteria and checkpoint. (Pass 1 -- First Draft)
- 2026-03-04 17:28 Pass 2 -- Granularity: clarified onClearText timing in streamChatCompletion (called when name delta first detected, not when parser activates)
- 2026-03-04 17:29 Pass 3 -- Validation: all line numbers, variable names, interfaces verified against codebase -- no corrections needed
- 2026-03-04 17:29 Pass 4 -- Quality: all 3 new units have What/Output/Acceptance, no TBD, all emojis present, clarified done-state test expectation
- 2026-03-04 17:35 Unit 20a complete: 21 failing tests -- 12 FinalAnswerParser unit tests, 5 streamChatCompletion integration, 3 streamResponsesApi integration, 1 core.ts finalAnswerStreamed flag test. 1275 existing tests pass, 21 new fail (red)
- 2026-03-04 17:43 Unit 20b complete: FinalAnswerParser class (buffer-based prefix scan, JSON escape handling), wired into streamChatCompletion and streamResponsesApi with sole-tool-call guard, finalAnswerStreamed flag on TurnResult, core.ts skips re-emit when already streamed. Updated 3 existing tests for streaming behavior. 1296 tests pass, build clean
- 2026-03-04 17:45 Unit 20c complete: 100% coverage on streaming.ts and core.ts (stmts/branches/funcs/lines). Added 1 test for Responses API empty-text branch. All 5 coverage targets verified: FinalAnswerParser branches, streamChatCompletion detection, streamResponsesApi detection, core.ts finalAnswerStreamed paths, non-final_answer exclusion. No refactoring needed
- 2026-03-04 18:05 Unit 4a complete: 6 failing tests for friend context instructions rewrite -- displayName interpolation (known + Unknown), directive language (not "should learn"), priority guidance ("get to know"), memory bar lowered (not "something important"), name quality directive (not "i prefer"). 57 existing pass, 6 new fail (red)
- 2026-03-04 18:06 Unit 4b complete: 4 prompt text changes in contextSection() -- priority guidance adds "get to know", name quality directive ("when i learn a name... save immediately"), memory bar lowered ("anything i learn"), new-friend block interpolates displayName with Unknown variant. Updated 1 existing test. 1303 tests pass, build clean
- 2026-03-04 18:08 Unit 4c complete: 100% coverage on all new/modified code in prompt.ts (stmts/funcs/lines 100%, branches 95.74% -- only gaps are pre-existing lines 142-143 for supportsStreaming false branch). Both new-friend and returning-friend paths covered. displayName "Unknown" and non-"Unknown" both verified. No refactoring needed
