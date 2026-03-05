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
- [x] Friend context instructions at prompt.ts:178-194 rewritten to be directive with displayName interpolation and aggressive saving (4a/b/c -- now superseded by 21g/h/i)
- [x] `FriendRecord` has `totalTokens: number` field (schema version stays 1)
- [x] Token accumulation: after each agent turn, `FriendRecord.totalTokens` is updated with `usage.total_tokens` via `accumulateFriendTokens()` helper called from both adapters
- [x] `FriendResolver` auto-populates a `"name"` note from `displayName` on first contact (when displayName is not "Unknown")
- [x] `isNewFriend` replaced with `isOnboarding = (friend.totalTokens ?? 0) < ONBOARDING_TOKEN_THRESHOLD` (100K tokens)
- [x] Always-on instructions (permanent in contextSection, never gated): memory ephemerality, working-memory trust, stale notes awareness, save aggressively
- [x] Priority guidance line ("my friend's request comes first...") removed entirely (overfitting)
- [x] Separate "name quality" line removed -- folded into broader "save anything" directive
- [x] Onboarding-only instructions in `src/mind/first-impressions.ts`: encourage conversation, inform capabilities, new-friend greeting
- [x] Onboarding instructions only appear below 100K token threshold -- they drop from the system prompt once exceeded
- [x] `ONBOARDING_TOKEN_THRESHOLD` exported from `first-impressions.ts` (easily changeable)
- [x] Existing 4a/b/c prompt tests updated: priority guidance/name quality assertions flipped, isNewFriend tests rewritten for totalTokens-based detection
- [x] `notes` field changed from `Record<string, string>` to `Record<string, { value: string, savedAt: string }>` -- timestamped notes (schema version stays 1)
- [x] `save_friend_note` handler constructs `{ value, savedAt }` objects when saving notes
- [x] `contextSection()` renders notes with date prefix: `- role: [2026-03-05] software engineer`
- [x] All existing code that reads/writes notes updated for new structure (store-file.ts, resolver.ts, first-impressions.ts references)
- [ ] `save_friend_note` with key "name" redirects to `displayName` update instead of storing as a note -- returns descriptive message to model
- [ ] User confirms on both surfaces: bot proactively calls `save_friend_note` when learning anything about the user
- [ ] User confirms onboarding instructions disappear after sufficient conversation
- [ ] User confirms notes display with date prefix in system prompt

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

### ✅ Unit 21a: Add totalTokens to FriendRecord -- Tests
**What**: Tests already exist and FAIL (red). Verify that the 4 pre-written tests are failing as expected.

Pre-existing failing tests (written during prior work, before implementation):
- `src/__tests__/mind/friends/store-file.test.ts` "totalTokens persistence" (3 tests):
  1. "persists totalTokens in agent knowledge file" -- FAILS: `AgentKnowledgeData` lacks `totalTokens`, so `put()` does not write it
  2. "reads totalTokens back from disk via get()" -- FAILS: `merge()` does not include `totalTokens`
  3. "returns totalTokens: 0 for legacy record lacking the field" -- FAILS: `merge()` has no `?? 0` fallback
- `src/__tests__/mind/friends/resolver.test.ts` "first-encounter flow" (1 test):
  4. "initializes totalTokens to 0 on newly created friend records" -- FAILS: `resolveOrCreate()` does not set `totalTokens`

**Output**: No new test files -- confirm 4 existing tests fail
**Acceptance**: 4 tests FAIL (red), all other tests PASS

### ✅ Unit 21b: Add totalTokens to FriendRecord -- Implementation
**What**: Add `totalTokens: number` to `FriendRecord` and wire it through the store and resolver. Keep `schemaVersion` at 1 (no migration needed -- friend records will be bombed for testing).

Changes:
1. **`src/mind/friends/types.ts`**: add `totalTokens: number` to `FriendRecord` interface (after `notes`)
2. **`src/mind/friends/store-file.ts`**:
   - Add `totalTokens: number` to `AgentKnowledgeData` interface
   - In `put()`: include `totalTokens: record.totalTokens` in the agent knowledge data split
   - In `merge()`: include `totalTokens: agentData.totalTokens ?? 0` for backward compat with legacy records on disk
3. **`src/mind/friends/resolver.ts`**: in `resolveOrCreate()`, add `totalTokens: 0` to the new friend record literal (after `notes: {}`)

**Output**: Modified `src/mind/friends/types.ts`, `src/mind/friends/store-file.ts`, `src/mind/friends/resolver.ts`
**Acceptance**: All 4 previously-failing totalTokens tests PASS (green), no warnings, all other tests still pass

### ✅ Unit 21c: Add totalTokens to FriendRecord -- Coverage & Refactor
**What**: Verify 100% coverage on all modified code in types.ts, store-file.ts, and resolver.ts. Specifically verify:
- `put()` writes `totalTokens` to agent knowledge JSON (not PII bridge)
- `get()` reads `totalTokens` back correctly
- `merge()` returns `0` when legacy record on disk lacks `totalTokens`
- `resolveOrCreate()` initializes `totalTokens: 0`
**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

### ✅ Unit 21d: Token accumulation after each turn -- Tests
**What**: Write failing tests for a new `accumulateFriendTokens(store, friendId, usage)` helper. Test the helper directly in `src/__tests__/mind/friends/tokens.test.ts` -- this avoids needing to test through interactive readline (CLI) or the full Teams handler.

Tests:
1. First turn: record has `totalTokens: 0`, usage `{ total_tokens: 1500 }` -> store.put called with `totalTokens: 1500`, `updatedAt` refreshed
2. Subsequent turn: record has `totalTokens: 3000`, usage `{ total_tokens: 2000 }` -> store.put called with `totalTokens: 5000`
3. No usage data: `usage` is undefined -> store.get NOT called (no-op, early return)
4. Zero total_tokens: `usage.total_tokens` is 0 -> store.get NOT called (no-op, early return)
5. Record not found: store.get returns null -> store.put NOT called (no crash)
6. Legacy record: record on disk has no `totalTokens` field (undefined) -> treated as 0 via `?? 0`, accumulation works correctly (e.g. undefined + 1500 = 1500)

Use a mock `FriendStore` (vi.fn() for get/put/delete/findByExternalId).

**Output**: New `src/__tests__/mind/friends/tokens.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `src/mind/friends/tokens.ts` does not exist yet

### ✅ Unit 21e: Token accumulation after each turn -- Implementation
**What**: Create the accumulation helper and wire it into both adapters. The helper runs after `postTurn()` to avoid racing with session save.

Changes:
1. **`src/mind/friends/tokens.ts`** (new file):
   - Import `FriendStore` from `./store` and `UsageData` from `../../mind/context`
   - Export `accumulateFriendTokens(store: FriendStore, friendId: string, usage?: UsageData): Promise<void>`
   - Logic: early return if `!usage?.total_tokens`; read record via `store.get(friendId)`; early return if null; set `record.totalTokens = (record.totalTokens ?? 0) + usage.total_tokens`; set `record.updatedAt = new Date().toISOString()`; `await store.put(record.id, record)`

2. **`src/senses/teams.ts`** in `handleTeamsMessage()`:
   - Import `accumulateFriendTokens` from `../mind/friends/tokens`
   - After `postTurn(messages, sessPath, result.usage)` (currently line 493), add:
     ```
     if (toolContext?.context?.friend?.id) {
       await accumulateFriendTokens(store, toolContext.context.friend.id, result.usage)
     }
     ```

3. **`src/senses/cli.ts`** in `main()`:
   - Import `accumulateFriendTokens` from `../mind/friends/tokens`
   - After `postTurn(messages, sessPath, result?.usage)` (currently line 463), add:
     ```
     await accumulateFriendTokens(friendStore, resolvedContext.friend.id, result?.usage)
     ```

**Output**: New `src/mind/friends/tokens.ts`, modified `src/senses/teams.ts`, `src/senses/cli.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 21f: Token accumulation -- Coverage & Refactor
**What**: Verify 100% coverage on `accumulateFriendTokens()` and its call sites. Specifically:
- `tokens.ts`: usage present (tokens added), usage absent (no-op early return), usage.total_tokens is 0 (no-op early return), record not found (no crash, no put), legacy record with undefined totalTokens (?? 0 fallback)
- `teams.ts`: token accumulation call guarded by `toolContext?.context?.friend?.id` -- verify both branches (context present and absent)
- `cli.ts`: token accumulation call after postTurn -- verify it fires
**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

### ✅ Unit 21g: Prompt rewrite + first-impressions module + auto-name -- Tests
**What**: Write failing tests covering the three-part instruction architecture change. This unit modifies existing tests that were written for 4a/b/c AND adds new tests.

**Part A -- Update existing 4a tests in `src/__tests__/mind/prompt.test.ts`:**

Tests to CHANGE (these currently pass but assert behavior we are removing):
- "includes priority guidance when friend context is present" (line 979) -- REWRITE to assert priority guidance is ABSENT. The line "my friend's request comes first" is being removed.
- "priority guidance mentions both helping AND getting to know them" (line 1157) -- REWRITE to assert "get to know" does NOT appear in contextSection output (that behavior moves to onboarding-only).
- "name quality instruction is directive -- save immediately" (line 1215) -- REWRITE to assert the separate name quality line is ABSENT. Name saving is now folded into the broader "save anything" directive.
- "includes name-quality instruction with displayName" (line 837) -- REWRITE to assert the separate name quality line is absent, but "save" still appears (via the broader "save anything" directive).
- "new-friend instruction when notes and toolPreferences both empty" (line 866) -- REWRITE: new-friend detection no longer uses `!hasNotes && !hasPrefs`. Instead test that a friend with `totalTokens: 0` gets onboarding text, and a friend with `totalTokens: 200_000` does NOT.
- "does NOT include new-friend instruction when notes has entries" (line 894) -- REWRITE: the condition is now totalTokens-based, not notes-based. A friend with notes but `totalTokens: 50_000` SHOULD still get onboarding text (below threshold).
- "does NOT include new-friend instruction when toolPreferences has entries" (line 921) -- REWRITE: same as above. toolPreferences are irrelevant to onboarding detection now.
- "new-friend instruction interpolates displayName when known" (line 1067) -- MOVE: displayName interpolation is now in first-impressions.ts, not in contextSection directly. This test should verify that the first-impressions content (which includes displayName) appears in contextSection when `totalTokens: 0`.
- "new-friend instruction says name is unknown when displayName is 'Unknown'" (line 1097) -- MOVE: same -- verify Unknown variant appears in contextSection via first-impressions inclusion.
- "new-friend instruction is directive with action verbs" (line 1127) -- MOVE: directive language is now in first-impressions.ts. Verify it flows through contextSection.

Tests to KEEP AS-IS (these currently pass and assert behavior we are keeping):
- "includes memory ephemerality instruction" (line 808) -- KEEP
- "includes working-memory trust instruction" (line 1008) -- KEEP
- "includes stale notes awareness instruction" (line 1037) -- KEEP
- "memory instruction lowers the bar -- saves anything learned" (line 1185) -- KEEP

**Part B -- New tests in `src/__tests__/mind/prompt.test.ts`:**

14. Always-on directives verified at high totalTokens: create a friend with `totalTokens: 200_000` (above threshold) and verify all 4 always-on instructions (memory ephemerality, working-memory trust, stale notes awareness, save aggressively) still appear.
15. Onboarding text absent at high totalTokens: friend with `totalTokens: 200_000` -> contextSection does NOT contain onboarding/first-impressions text.
16. Onboarding text present at low totalTokens: friend with `totalTokens: 0` -> contextSection DOES contain onboarding/first-impressions text.
17. Friend notes rendering always present: friend with notes and `totalTokens: 200_000` -> "what i know about this friend" section still appears.

**Part C -- New tests in `src/__tests__/mind/first-impressions.test.ts`:**

18. `ONBOARDING_TOKEN_THRESHOLD` is exported and equals `100_000`
19. `isOnboarding({ totalTokens: 0 })` returns true
20. `isOnboarding({ totalTokens: 99_999 })` returns true
21. `isOnboarding({ totalTokens: 100_000 })` returns false
22. `isOnboarding({ totalTokens: 500_000 })` returns false
23. `isOnboarding({ totalTokens: undefined })` returns true (treated as 0)
24. `getFirstImpressions(friend)` with `totalTokens: 0, displayName: "Jordan"` returns non-empty string containing displayName
25. `getFirstImpressions(friend)` with `totalTokens: 0, displayName: "Unknown"` returns non-empty string, mentions asking what they'd like to be called
26. `getFirstImpressions(friend)` with `totalTokens: 100_000` returns empty string
27. `getFirstImpressions(friend)` with `totalTokens: 200_000` returns empty string
28. Content check: onboarding text encourages learning about the friend and mentions agent capabilities

**Part D -- New tests in `src/__tests__/mind/friends/resolver.test.ts`:**

29. New friend with `displayName: "Jordan"` -> `notes` includes `{ name: "Jordan" }` (auto-populated)
30. New friend with `displayName: "Unknown"` -> `notes` is `{}` (no auto-population)
31. Existing friend with different displayName -> notes NOT overwritten (existing test "does NOT overwrite displayName" already covers this indirectly)

**Output**: Modified `src/__tests__/mind/prompt.test.ts`, new `src/__tests__/mind/first-impressions.test.ts`, modified `src/__tests__/mind/friends/resolver.test.ts`
**Acceptance**: New/rewritten tests FAIL (red) because: `first-impressions.ts` does not exist, priority guidance line still present, name quality line still present, `isNewFriend` still uses notes check, auto-name not implemented. Existing kept tests still PASS.

### ✅ Unit 21h: Prompt rewrite + first-impressions module + auto-name -- Implementation
**What**: Three sets of changes implementing the refined instruction architecture.

1. **Rewrite `contextSection()` in `src/mind/prompt.ts`**:
   - ADD import: `import { isOnboarding, getFirstImpressions } from "./first-impressions"`
   - REMOVE the priority guidance line (line 160-161): `"my friend's request comes first. i help with what they need, and i get to know them along the way."`
   - REMOVE the separate name quality line (line 164): `"when i learn a name my friend prefers, i save it immediately with save_friend_note."`
   - KEEP these four always-on directives (lines 167-172) -- reword the "save aggressively" one to be broader than just names:
     a. Memory ephemerality: `"my conversation memory is ephemeral -- it resets between sessions. anything i learn about my friend, i save with save_friend_note so future me remembers."`
     b. Working-memory trust: `"the conversation is my source of truth. my notes are a journal for future me -- they may be stale or incomplete."`
     c. Stale notes awareness: `"when i learn something that might invalidate an existing note, i check related notes and update or override any that are stale."`
     d. Save aggressively (REWORDED): `"i save ANYTHING i learn about my friend immediately with save_friend_note -- names, preferences, what they do, what they care about. when in doubt, save it."`
   - REMOVE `isNewFriend` detection (line 156) and the entire if-block (lines 175-181)
   - REMOVE `hasNotes` and `hasPrefs` variables (lines 154-155) -- only used by `isNewFriend` and the notes rendering check. Inline `Object.keys(friend.notes).length > 0` for the notes rendering check.
   - ADD: after the four always-on directives, check `isOnboarding(friend)` and if true, append `getFirstImpressions(friend)` to the lines array
   - KEEP friend notes rendering ("what i know about this friend") -- gated only by `Object.keys(friend.notes).length > 0`, not by threshold

2. **Create `src/mind/first-impressions.ts`** (new file):
   - Import `FriendRecord` from `./friends/types`
   - Export `ONBOARDING_TOKEN_THRESHOLD = 100_000`
   - Export `isOnboarding(friend: Pick<FriendRecord, "totalTokens">): boolean` -- returns `(friend.totalTokens ?? 0) < ONBOARDING_TOKEN_THRESHOLD`
   - Export `getFirstImpressions(friend: Pick<FriendRecord, "totalTokens" | "displayName">): string` -- returns empty string when `!isOnboarding(friend)`, otherwise returns onboarding instruction text
   - Onboarding text content (only emitted below threshold):
     a. If `displayName === "Unknown"`: line about asking what they'd like to be called
     b. If displayName is known: line greeting them by name
     c. Encourage conversation to learn about the friend (preferences, what they do, interests)
     d. Brief line about what the agent can do (tools, skills, memory)
     e. Directive to save what is learned immediately

3. **Auto-populate name in `src/mind/friends/resolver.ts`**:
   - In `resolveOrCreate()`, change `notes: {}` to `notes: this.params.displayName !== "Unknown" ? { name: this.params.displayName } : {}`

**Output**: Modified `src/mind/prompt.ts`, new `src/mind/first-impressions.ts`, modified `src/mind/friends/resolver.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 21i: Prompt rewrite + first-impressions module + auto-name -- Coverage & Refactor
**What**: Verify 100% coverage on all modified/new code:
1. **`first-impressions.ts`**: `isOnboarding` returns true below threshold, false at/above; `getFirstImpressions` returns non-empty below, empty at/above; displayName "Unknown" vs known branches; `totalTokens` undefined treated as 0 via `?? 0`; `ONBOARDING_TOKEN_THRESHOLD` export
2. **`prompt.ts` contextSection**: all 4 always-on directives present at all token levels; no priority guidance line; no name quality line; onboarding text included below threshold, absent above; friend notes rendering always present when notes exist
3. **`resolver.ts`**: name auto-populated (`notes: { name: displayName }`) when displayName != "Unknown"; empty `notes: {}` when displayName is "Unknown"; existing friend flow unchanged
**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

### ✅ Unit 22a: Timestamped notes -- Tests
**What**: Write NEW failing tests and UPDATE EXISTING tests for the change from `Record<string, string>` to `Record<string, { value: string, savedAt: string }>` for the `notes` field. Tests span multiple files.

**New failing tests:**

**`src/__tests__/repertoire/tools.test.ts`** (save_friend_note handler):
1. type "note" saves structured `{ value, savedAt }` object: verify `store.put` is called with `notes: { role: { value: "engineering manager", savedAt: expect.stringMatching(/^\d{4}-/) } }`
2. type "note" with existing structured note and no override returns conflict showing the value (not `[object Object]`)
3. type "note" with override=true replaces structured note, `savedAt` is updated to current time

**`src/__tests__/mind/prompt.test.ts`** (contextSection rendering):
4. Notes render with date prefix: friend with `notes: { role: { value: "software engineer", savedAt: "2026-03-05T00:00:00.000Z" } }` renders as `- role: [2026-03-05] software engineer` in contextSection output
5. Multiple notes render with correct dates: friend with two timestamped notes renders both with their respective dates

**`src/__tests__/mind/friends/resolver.test.ts`** (auto-name):
6. Auto-populated name note uses structured format: new friend with displayName "Jordan" gets `notes: { name: { value: "Jordan", savedAt: expect.any(String) } }`

**Existing tests to update** (change notes test data from `Record<string, string>` to `Record<string, { value: string, savedAt: string }>`):

All test files that construct `FriendRecord` objects with non-empty `notes` must use the new structured format. Empty `notes: {}` is fine as-is. Key files:
- `src/__tests__/repertoire/tools.test.ts`: update `makeCtx({ friendOverrides: { notes: { role: "old role" } } })` -> `{ role: { value: "old role", savedAt: "2026-01-01T00:00:00.000Z" } }`, update put assertions for note saves, update `notes: { name: "Jordan Lee" }` assertion on type "name" test to verify notes does NOT contain "name"
- `src/__tests__/mind/prompt.test.ts`: ~15 test cases with `notes: { role: "engineer" }` or similar -> `{ role: { value: "engineer", savedAt: "2026-01-01T00:00:00.000Z" } }`. Update rendering assertions from `role: engineer` to `role: [2026-01-01] engineer`
- `src/__tests__/mind/friends/store-file.test.ts`: update test data for structured notes -- `makeFriend` at line 32 (`notes: { role: "engineering manager" }`) and line 236 (`notes: { role: "SDE" }`). Lines 84 and 107 use `notes: {}` and need no change
- `src/__tests__/mind/friends/resolver.test.ts`: update `makeFriend` at line 15 (`notes: { role: "engineering manager" }`), update auto-name assertions at lines 94 and 164 from `{ name: "..." }` to `{ name: { value: "...", savedAt: expect.any(String) } }`
- `src/__tests__/mind/friends/types.test.ts`: update test data (line 109)
- `src/__tests__/mind/friends/store.test.ts`: notes: {} is fine (line 12)
- `src/__tests__/mind/friends/tokens.test.ts`: notes: {} is fine (line 13)

**Output**: New/modified test cases across the files above
**Acceptance**: New tests FAIL (red) because notes are still `Record<string, string>`. Updated existing tests also fail due to type mismatch until 22b implements the change.

### ✅ Unit 22b: Timestamped notes -- Implementation
**What**: Change the notes type from `Record<string, string>` to `Record<string, { value: string, savedAt: string }>` and update all code that reads/writes notes.

Changes:

1. **`src/mind/friends/types.ts`**: Change `notes: Record<string, string>` to `notes: Record<string, { value: string, savedAt: string }>` on `FriendRecord` interface (line 43)

2. **`src/mind/friends/store-file.ts`**:
   - Update `AgentKnowledgeData.notes` type from `Record<string, string>` to `Record<string, { value: string, savedAt: string }>` (line 17)
   - No changes to put/get/merge logic -- they pass notes through as-is, the type change propagates naturally

3. **`src/mind/friends/resolver.ts`**: In `resolveOrCreate()`, change the auto-name note from `{ name: this.params.displayName }` to `{ name: { value: this.params.displayName, savedAt: now } }` (line 68). `now` is already defined as `new Date().toISOString()` on line 51.

4. **`src/repertoire/tools-base.ts`** (save_friend_note handler):
   - In the `type === "note"` block (lines 332-338): change `record.notes[a.key]` reads to access `.value` for the conflict message. Change the updated notes construction from `{ ...record.notes, [a.key]: a.content }` to `{ ...record.notes, [a.key]: { value: a.content, savedAt: new Date().toISOString() } }`
   - In the `type === "name"` block (lines 315-318): stop writing to `notes.name`. Change from `{ ...record, displayName: a.content, notes: { ...record.notes, name: a.content }, updatedAt: ... }` to `{ ...record, displayName: a.content, updatedAt: ... }`. Return message stays `"saved: displayName = ${a.content}"`
   - Update the conflict message for existing note to display `existing.value` instead of raw `existing` (since it's now an object): `"${existing.value}"` not `"${existing}"`
   - Update the success return for note saves to show value: `"saved: note ${a.key} = ${a.content}"` (content is already the plain string)

5. **`src/mind/prompt.ts`** (contextSection): In the notes rendering loop (lines 171-173), change the loop variable destructuring and rendering. Current code: `for (const [key, value] of Object.entries(friend.notes)) { lines.push(\`- ${key}: ${value}\`) }`. Change to: `for (const [key, entry] of Object.entries(friend.notes)) { lines.push(\`- ${key}: [${entry.savedAt.slice(0, 10)}] ${entry.value}\`) }`. This produces format `- role: [2026-03-05] software engineer at Contoso`.

**Schema version stays at 1** -- friend records will be bombed for testing. No migration needed.

**Output**: Modified `src/mind/friends/types.ts`, `src/mind/friends/store-file.ts`, `src/mind/friends/resolver.ts`, `src/repertoire/tools-base.ts`, `src/mind/prompt.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 22c: Timestamped notes -- Coverage & Refactor
**What**: Verify 100% coverage on all modified code paths:
1. **types.ts**: type change only, no runtime code to cover
2. **store-file.ts**: structured notes round-trip through put/get/merge
3. **resolver.ts**: auto-name note uses `{ value, savedAt }` structure; "Unknown" path still produces empty notes
4. **tools-base.ts**: note save constructs `{ value, savedAt }`, conflict message displays `.value`, override replaces with new `savedAt`, name type no longer writes to notes
5. **prompt.ts**: notes rendered with date prefix `[YYYY-MM-DD]`

**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

### ✅ Unit 23a: "name" note -> displayName redirect -- Tests
**What**: Write failing tests verifying that `save_friend_note` with `type: "note"` and `key: "name"` redirects to a displayName update instead of storing as a note.

**`src/__tests__/repertoire/tools.test.ts`**:
1. type "note" key "name" updates `displayName` on the record: `execTool("save_friend_note", { type: "note", key: "name", content: "Ari" })` -> `store.put` called with `displayName: "Ari"`, notes does NOT contain key "name"
2. type "note" key "name" returns descriptive redirect message: result contains "displayName" and the new name value, and indicates it was stored as displayName not a note (e.g. "Updated friend's display name to 'Ari' (stored as displayName, not a note)")
3. type "note" key "name" with override=true still redirects to displayName (override is irrelevant for name redirect)
4. type "note" key "name" does NOT check for existing note conflict (no "already have a note" message) -- it always updates displayName

**Output**: New test cases in `src/__tests__/repertoire/tools.test.ts`
**Acceptance**: Tests exist and FAIL (red) because the note handler currently stores `{ key: "name" }` as a regular note

### ✅ Unit 23b: "name" note -> displayName redirect -- Implementation
**What**: Add a redirect check at the top of the `type === "note"` block in `src/repertoire/tools-base.ts` (before the existing conflict check):

```typescript
// Redirect "name" key to displayName
if (a.key === "name") {
  const updated: FriendRecord = { ...record, displayName: a.content, updatedAt: new Date().toISOString() }
  await ctx.friendStore.put(friendId, updated)
  return `updated friend's display name to '${a.content}' (stored as displayName, not a note)`
}
```

This intercepts `key: "name"` before the existing/override logic runs, so it always succeeds. The `type: "name"` path (lines 315-318) already updates displayName -- this makes `type: "note", key: "name"` do the same thing, keeping displayName as the canonical source for the friend's name.

**Output**: Modified `src/repertoire/tools-base.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 23c: "name" note -> displayName redirect -- Coverage & Refactor
**What**: Verify 100% coverage on the redirect path:
1. `key === "name"` branch taken: displayName updated, early return with descriptive message
2. `key !== "name"` branch: falls through to existing note save logic (already covered by existing tests)
3. Verify no dead code introduced -- the `type: "name"` path still works independently

**Output**: Coverage report
**Acceptance**: 100% coverage on new/modified code, all tests green

---

### GATE 3 CHECKPOINT
**Manual test**: User tests on both Copilot Chat and standard Teams with fresh friend records (bomb existing friend data to reset).
**Expected**:
- Bot proactively calls `save_friend_note` when learning anything about the user without being asked
- New friend records have `totalTokens: 0` and a `name` note auto-populated from displayName (when not "Unknown")
- Onboarding instructions appear in the system prompt for new friends (totalTokens below 100K)
- After sufficient conversation (totalTokens >= 100K threshold), onboarding instructions drop from the system prompt
- Always-on instructions (memory ephemerality, working-memory trust, stale notes, save aggressively) appear at ALL token levels
- Friend notes rendering ("what i know about this friend") always appears when notes exist, regardless of totalTokens
- Priority guidance line is ABSENT from system prompt
- Separate name quality line is ABSENT from system prompt
- `totalTokens` increments after each turn (visible in friend JSON files on disk)
- Notes display with date prefix in system prompt (e.g. `- role: [2026-03-05] software engineer`)
- `save_friend_note` with key "name" updates displayName (not stored as a note) and returns descriptive message
- Friend JSON files on disk show structured notes with `{ value, savedAt }` format

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
- 2026-03-04 18:21 Added units 21a-21j for token-based friend onboarding: totalTokens on FriendRecord, accumulateFriendTokens helper, auto-populate name note, token threshold replacing isNewFriend, onboarding content review discussion checkpoint. Updated Gate 3 completion criteria and checkpoint. (Pass 1 -- First Draft)
- 2026-03-04 18:21 Pass 2 -- Granularity: extracted accumulateFriendTokens shared helper for testability (avoids testing through CLI interactive readline loop)
- 2026-03-04 18:22 Pass 3 -- Validation: verified line numbers (postTurn at teams.ts:493, cli.ts:463; isNewFriend at prompt.ts:156; onboarding block at prompt.ts:175-180), test infrastructure (store-file.test.ts, resolver.test.ts exist), makeFriend helpers. Added onboarding/permanent boundary note to 21h for 21j discussion
- 2026-03-04 18:23 Pass 4 -- Quality: all 10 new units have What/Output/Acceptance, no TBD, all emojis present, cleaned up 21d test list redundancy, fixed threshold wording in 21h, all completion criteria testable
- 2026-03-04 18:47 Rewrote units 21a-21i after full codebase re-evaluation. Key changes: 21a acknowledges pre-existing failing tests (no new tests needed); 21g/h/i restructured to explicitly list which existing 4a tests change vs keep, added first-impressions.test.ts structure, fixed auto-name notes in resolver; removed Unit 21j (decisions already captured in unit specs); updated Gate 3 completion criteria and checkpoint expectations
- 2026-03-04 18:47 Pass 2 -- Granularity: all 9 units atomic and testable. 21g is large (31 tests) but all go red together. Line numbers verified for postTurn call sites (teams.ts:493, cli.ts:463)
- 2026-03-04 18:47 Pass 3 -- Validation: all line numbers, variable names, interfaces verified against codebase. 14 existing test references confirmed exact. hasNotes/hasPrefs usage analyzed: prefs removable, notes kept for rendering loop. No corrections needed
- 2026-03-04 18:47 Pass 4 -- Quality: all 9 units have What/Output/Acceptance. No TBD items. All emoji headers present. TDD pattern (tests/impl/coverage) for each group. Gate 3 checkpoint updated to assert priority guidance ABSENT (not present)
- 2026-03-04 18:52 Unit 21a complete: verified 4 pre-existing failing tests -- 3 store-file (totalTokens persistence, read-back, legacy fallback) + 1 resolver (initializes totalTokens: 0). All fail as expected, 1303 other tests pass
- 2026-03-04 18:55 Unit 21b complete: added totalTokens to FriendRecord (types.ts), AgentKnowledgeData + put/merge (store-file.ts), resolveOrCreate (resolver.ts). Updated 4 makeFriend helpers in test files. 1307 tests pass, build clean
- 2026-03-04 18:56 Unit 21c complete: 100% coverage on store-file.ts, resolver.ts, types.ts (stmts/branches/funcs/lines). All totalTokens paths covered. No refactoring needed
- 2026-03-04 18:57 Unit 21d complete: 6 failing tests for accumulateFriendTokens -- first turn (0 -> 1500), subsequent (3000 -> 5000), no-op undefined, no-op zero, record not found, legacy undefined totalTokens. All fail (tokens.ts doesn't exist)
- 2026-03-04 18:58 Unit 21e complete: accumulateFriendTokens helper in tokens.ts (early-return guards, ?? 0 fallback, updatedAt refresh). Wired into teams.ts after postTurn (guarded by toolContext?.context?.friend?.id) and cli.ts after postTurn. 1313 tests pass, build clean
- 2026-03-04 18:59 Unit 21f complete: tokens.ts 100% coverage. teams.ts 98.63/98.64/95.91/99.22 -- uncovered lines 266, 594 are pre-existing (onClearText, ctxSend). Token accumulation call site at line 498 covered. No refactoring needed
- 2026-03-04 19:03 Unit 21g complete: 8 failing tests across 3 files -- 6 prompt.test.ts (priority guidance absent, get-to-know absent, name quality absent x2, onboarding threshold, save-anything directive), 2 resolver.test.ts (auto-name Jordan, auto-name Unknown skipped), 1 first-impressions.test.ts file fails at import. 1310 other tests pass
- 2026-03-04 19:05 Unit 21h complete: contextSection rewritten (removed priority guidance, name quality line, isNewFriend; added 4 always-on directives + getFirstImpressions call). Created first-impressions.ts (ONBOARDING_TOKEN_THRESHOLD=100K, isOnboarding, getFirstImpressions with displayName/Unknown variants). Auto-name in resolver.ts (notes: { name: displayName } when not "Unknown"). 1329 tests pass, build clean
- 2026-03-04 19:06 Unit 21i complete: first-impressions.ts 100% coverage. prompt.ts 100% lines/funcs (branches 95.34% -- only gap is pre-existing supportsStreaming false at lines 143-144). resolver.ts 100% coverage. All Gate 3 completion criteria checked. No refactoring needed
- 2026-03-04 19:44 Added units 22a-23c for timestamped notes and name->displayName redirect. Updated Gate 3 completion criteria and checkpoint. (Pass 1 -- First Draft)
- 2026-03-04 19:46 Pass 2 -- Granularity: detailed existing test update scope for 22a across 7 test files, clarified conflict message handling for structured notes, verified store-file.ts lines 84/107 need no change (empty notes)
- 2026-03-04 19:47 Pass 3 -- Validation: all line numbers verified (types.ts:43, store-file.ts:17, resolver.ts:51/68, tools-base.ts:315-318/332-338, prompt.ts:171-173). Test line refs verified (tools:1787, store-file:32/84/107/236, resolver:15/94/164/180, types:109). first-impressions.ts confirmed no notes reference
- 2026-03-04 19:48 Pass 4 -- Quality: all 6 new units have What/Output/Acceptance. No TBD items. All emoji headers present. TDD pattern (tests/impl/coverage) for each feature. Gate 3 checkpoint updated with 3 new expected items (date prefix, name redirect, structured JSON)
- 2026-03-04 20:01 Unit 22a complete: renamed displayName->name on FriendRecord in 12 test files, updated notes format to { value, savedAt } in test data, updated rendering assertions for date prefix. 23+ tests fail (red) across store-file, resolver, prompt, tools, first-impressions, core, teams, cli-main
- 2026-03-04 20:04 Unit 22b complete: renamed displayName->name in 6 source files (types, store-file, resolver, prompt, first-impressions, tools-base). Notes type changed to Record<string, { value, savedAt }>. Notes render with date prefix. 1329 tests pass, build clean
- 2026-03-04 20:07 Unit 22c complete: 100% coverage on all modified files (store-file, resolver, types, tools-base, first-impressions). prompt.ts 100% lines/funcs (branches 95.34% -- only gap is pre-existing supportsStreaming false at lines 143-144). No refactoring needed
- 2026-03-04 20:10 Unit 23a complete: 4 failing tests for name note redirect -- type "note" key "name" redirects to name field update (not a note), returns descriptive redirect message, override=true still redirects, does not check for existing note conflict. All 4 fail (red)
- 2026-03-04 20:11 Unit 23b complete: added name key redirect at top of type "note" block in tools-base.ts. Intercepts key "name" before conflict check, updates record.name directly. 1333 tests pass, build clean
