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
- [ ] `safeSend` serialized via promise chain -- concurrent `ctx.send()` calls no longer race
- [ ] Failed send in chain halts subsequent sends (via `markStopped()`) -- verified by test
- [ ] User confirms on Copilot Chat: messages arrive in correct order, displayName populated or fallback confirmed

### Gate 2: Kick Escape Hatch + Self-Trigger
- [ ] `tool_choice = "required"` set when `lastKickReason` is truthy at core.ts:288 and core.ts:303
- [ ] Kick message rewritten to not self-trigger `hasToolIntent()` -- verified by unit test
- [ ] All existing kick patterns and test expectations unchanged
- [ ] New tests for `tool_choice` forcing after any kick
- [ ] New test verifying kick message does not trigger `hasToolIntent()`
- [ ] User confirms on Copilot Chat: no kick loop, no response spam, no timeout

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

### ⬜ Unit 2c: Bug 2 (safeSend serialization) -- Coverage & Refactor
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

### ⬜ Unit 3a: Bug 4 (tool_choice forcing) -- Tests
**What**: Write failing tests for `tool_choice = "required"` when `lastKickReason` is truthy. Tests should verify that after any kick (not just narration), the next API call includes `tool_choice: "required"` for both Azure (Responses API) and non-Azure (Chat Completions) paths. Test in `src/__tests__/heart/core.test.ts`. Also verify all existing kick test expectations remain unchanged.
**Output**: New test cases in `src/__tests__/heart/core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `tool_choice` is only set when `options.toolChoiceRequired` is true, not when `lastKickReason` is truthy

### ⬜ Unit 3b: Bug 4 (tool_choice forcing) -- Implementation
**What**: Two one-line changes in `src/heart/core.ts`:
1. Line 288 (Azure path): change `if (options?.toolChoiceRequired)` to `if (options?.toolChoiceRequired || lastKickReason)`
2. Line 303 (non-Azure path): change `if (options?.toolChoiceRequired)` to `if (options?.toolChoiceRequired || lastKickReason)`
`lastKickReason` is already in scope (set by the kick detection logic earlier in the loop). When truthy, it means a kick was applied this iteration and the model must be forced to call a tool.
**Output**: Modified `src/heart/core.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 3c: Bug 4 (kick message self-trigger) -- Tests
**What**: Write a test in `src/__tests__/heart/kicks.test.ts` that verifies the narration kick message does NOT trigger `hasToolIntent()`. Currently it will PASS (the message contains "I can" which matches `/\bi can\b/i`), so the test should assert `hasToolIntent(KICK_MESSAGES.narration) === false`, and it will FAIL because the current message self-triggers.
Note: KICK_MESSAGES is not exported. The test should import `detectKick` and use a narration-kicked response to extract the message, or test `hasToolIntent` with the known kick message text directly.
**Output**: New test case in `src/__tests__/heart/kicks.test.ts`
**Acceptance**: Test exists and FAILS (red) because current kick message contains "I can"

### ⬜ Unit 3d: Bug 4 (kick message self-trigger) -- Implementation
**What**: Rewrite the narration kick message at `src/heart/kicks.ts:29` to avoid triggering any `TOOL_INTENT_PATTERNS`. Current message contains "I can" which matches `/\bi can\b/i`. Replace with a message that conveys the same meaning without matching any pattern. Example: `"I narrated instead of acting. Using the tool now -- if done, calling final_answer."` Verify the rewritten message does not match any pattern in `TOOL_INTENT_PATTERNS` by running `hasToolIntent()` against it.
**Output**: Modified `src/heart/kicks.ts`
**Acceptance**: All tests PASS (green), no warnings. The self-trigger test now passes.

### ⬜ Unit 3e: Bug 4 -- Coverage & Refactor
**What**: Verify 100% coverage on changes in `core.ts` (tool_choice conditions) and `kicks.ts` (rewritten message). All existing kick tests must still pass with no changes to their expectations.
**Output**: Coverage report showing full branch coverage
**Acceptance**: 100% coverage on new/modified code, all tests green, no warnings

---

### GATE 2 CHECKPOINT
**Manual test**: User deploys and tests on Copilot Chat with a tool-using request (e.g., "show me my backlog").
**Expected**: No kick loop, no response spam, no platform timeout. Model uses `final_answer` to exit cleanly after completing work.
**Also resolves**: Bug 5 (response spam -- consequence of kick loop + out-of-order) and Bug 6 (platform timeout -- consequence of kick loop).
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
