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
- [x] Dead-stream fallback — flush() routes through sendMessage when stream is stopped
- [ ] Async delivery pattern for 15s platform timeout — deadline timer emits acknowledgment, real content via sendMessage
- [ ] User confirms on Teams: model uses final_answer cleanly, no 413 errors, no "Sorry something went wrong", prompt sections emit correctly

### Gate 3: Friend Context Instructions
- [ ] Friend context instructions at prompt.ts:178-194 rewritten to be directive with displayName interpolation and aggressive saving
- [ ] User confirms on both surfaces: bot helps first, introduces along the way, proactively calls `save_friend_note` when learning anything about the user without being asked

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
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

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

**Output**: Modified `src/senses/teams.ts`, `src/__tests__/senses/teams.test.ts`
**Acceptance**: Full text sent without preemptive splitting. Error recovery splits on failure. All tests pass, 100% coverage.

### ✅ Unit 16a: Async delivery for platform 15s timeout -- tests
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

### ⬜ Unit 16b: Async delivery for platform 15s timeout -- implementation
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

### ⬜ Unit 16c: Async delivery -- coverage & refactor
**What**: Verify 100% coverage on the deadline timer logic. All paths covered: fast path (timer cancelled), slow path (timer fires, sendMessage delivery), abort cleanup, streaming mode cancellation.
**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

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
- No "Sorry, something went wrong" for long-running responses (async delivery pattern handles >15s platform timeout)
- Fast responses (<12s) delivered on the stream as "Ouroboros"
- Slow responses (>12s) show brief acknowledgment on stream, real content follows via sendMessage
**Also resolves**: Bug 5 (response spam) and Bug 6 (platform timeout).
**Proceed to Gate 3 only after user confirms.**

---

### GATE 3: Friend Context Instructions

### ⬜ Unit 4a: Bug 3 (friend context instructions) -- Tests
**What**: Write tests in `src/__tests__/mind/prompt.test.ts` for the rewritten friend context instructions. Tests should verify:
1. New-friend instruction includes displayName interpolation (when displayName is "Unknown", instruction says something about not knowing the name)
2. New-friend instruction is directive (contains action verbs like "save" not aspirational like "should learn")
3. Priority guidance clarifies "help first AND get to know them"
4. Memory instruction pushes aggressive saving (lower bar than "something important")
**Output**: New test cases in `src/__tests__/mind/prompt.test.ts`
**Acceptance**: Tests exist and FAIL (red) because current instructions are aspirational

### ⬜ Unit 4b: Bug 3 (friend context instructions) -- Implementation
**What**: Rewrite ~4 lines of prompt text in `contextSection()` at `src/mind/prompt.ts`:
- Line 178 (priority guidance): clarify that priority means "help first AND get to know them" not "help only"
- Line 181 (name quality): make directive -- "when i learn a name, i save it immediately" not "i prefer"
- Line 184 (memory ephemerality): lower the bar -- "anything i learn about my friend" not "something important"
- Lines 193-194 (new-friend block): interpolate displayName. When "Unknown", say "i don't know this friend's name yet -- i ask what they'd like to be called". Make directive: "i save what i learn immediately with save_friend_note" not "i should learn"
Code structure of `contextSection()` unchanged. Only the string literals change.
**Output**: Modified `src/mind/prompt.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 4c: Bug 3 (friend context instructions) -- Coverage & Refactor
**What**: Verify 100% coverage on modified `contextSection()`. Both new-friend and returning-friend paths should be covered. Verify displayName interpolation works for "Unknown" and non-"Unknown" values.
**Output**: Coverage report showing full branch coverage
**Acceptance**: 100% coverage on new/modified code, tests still green

---

### GATE 3 CHECKPOINT
**Manual test**: User tests on both Copilot Chat and standard Teams with fresh friend records.
**Expected**: Bot helps first, introduces itself along the way, proactively calls `save_friend_note` when learning anything about the user without being asked.

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
