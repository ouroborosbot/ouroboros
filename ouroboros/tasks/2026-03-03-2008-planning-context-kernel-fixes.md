# Planning: Context Kernel Post-Testing Fixes

**Status**: drafting
**Created**: 2026-03-03 20:09

## Goal
Fix six bugs discovered during live testing of the context kernel on Microsoft 365 Copilot Chat. Two are critical (kick loop, response spam). Four are serious (AAD extraction, phantom messages, new-friend prompts, platform timeout). Some bugs are surface-agnostic (kick detection runs in core.ts), some are buffered-mode-specific (phantom messages via safeSend), and one (AAD extraction) may depend on how the Copilot Chat surface populates the activity object. Fixes are structured in three gated groups with manual user testing between each.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### Standard Teams Test: Limited Signal

The user tested the same bot through standard 1:1 Teams chat with a simple greeting ("hi pal") and got a clean response ("hello. what are we sorting today?"). This confirms the basic greeting flow works, but it does NOT prove the bugs are surface-specific. The greeting involved no tool calls and no narration-style response, so it would not trigger Bug 4 (kick detection) on any surface.

Per-bug surface/mode specificity:
- **Bug 1 (AAD extraction):** Unknown whether surface matters. The `teamsContext` never extracts AAD fields regardless of surface -- the code bug is the same. Whether `activity.from.aadObjectId` is populated may differ between Copilot Chat and standard Teams, but the fix (extract whatever is available) is identical.
- **Bug 2 (phantom messages):** Buffered-mode-specific. `safeSend` only sends separate messages in buffered mode. Streaming mode emits inline via `safeEmit`.
- **Bug 3 (new-friend prompts):** Surface-agnostic. Prompt instructions are the same for all channels.
- **Bug 4 (kick loop):** Surface-agnostic. `detectKick()` runs in `core.ts` and does not know which surface the message came from. The same kick loop would occur on standard Teams if the user asked for a backlog and the model responded with "I'll show you...". In streaming mode the duplicate output is less visible (inline text gets overwritten), but the wasted API round trips still happen.
- **Bug 5 (response spam):** Consequence of Bug 4 + Bug 2. The duplication happens in any mode (kick loop), but the separate-message visibility is buffered-mode-specific.
- **Bug 6 (platform timeout):** Consequence of Bug 4. The extra API round trips happen in any mode.

### Gated Fix Structure

Fixes are batched into three groups with manual confirmation gates. The user tests on Copilot Chat after each group before proceeding.

**Gate 1: Bug 1 (AAD extraction) + Bug 2 (phantom messages)**
Simplest, most mechanical fixes. User tests after.

**Gate 2: Bug 4 (kick false positives)**
The critical fix. Eliminates the kick loop cascade (also resolves Bug 5 and Bug 6). User tests after.

**Gate 3: Bug 3 (new-friend prompts)**
Prompt tuning. User tests after.

### In Scope

---

#### GATE 1: AAD Extraction + Phantom Messages

**Bug 1: displayName is "Unknown" -- AAD fields not populated in teamsContext**

The `teamsContext` object constructed at `src/senses/teams.ts:492` only populates `graphToken`, `adoToken`, and `signin`. It never extracts `aadObjectId`, `tenantId`, or `displayName` from the Bot Framework `activity` object, even though:
- `TeamsMessageContext` interface (line 298-305) has the fields defined
- `activity.from.aadObjectId`, `activity.conversation.tenantId`, and `activity.from.name` are available on the activity
- The resolver at line 344-350 uses `teamsContext?.aadObjectId` to decide provider and falls through to `"Unknown"` when `teamsContext?.displayName` is falsy

Confirmed by PII bridge file: `provider: "teams-conversation"` with conversation ID as external ID, meaning `aadObjectId` was missing and the resolver used the conversation-ID fallback.

Fix: add `aadObjectId: activity.from?.aadObjectId`, `tenantId: activity.conversation?.tenantId`, and `displayName: activity.from?.name` to the `teamsContext` object at line 492-506. The fields are already destructured from `ctx` at line 458 (`const { stream, activity, api, signin } = ctx`). Three-line fix.

**Surface-specific activity shape note:** It is unknown whether `activity.from.aadObjectId` and `activity.from.name` are populated differently on the Copilot Chat surface vs standard 1:1 Teams. The standard Teams test used a simple greeting (no tool calls) and created a separate friend record, so it doesn't tell us about AAD field population on that surface. The three-line fix is correct regardless (it extracts whatever is available via optional chaining), and the existing conversation-ID fallback at line 344-345 handles the case where `aadObjectId` is absent. Test coverage must verify both paths: AAD fields present and AAD fields absent (fallback to conversation-ID provider). Gate 1 user testing will reveal what each surface provides.

**Bug 2: Phantom tool-result and kick messages in buffered (nostream) mode**

In `createTeamsCallbacks` (`src/senses/teams.ts:59-252`), when `disableStreaming=true` (buffered mode):
- `onToolEnd` (line 194-195) calls `safeSend(msg)` which sends `formatToolResult()` output as a **separate bot message** via `ctx.send()`
- `onKick` (line 203-204) calls `safeSend(msg)` which sends `formatKick()` output as a **separate bot message**
- `onError` terminal branch (line 215-216) calls `safeSend(msg)` which sends the error as a **separate bot message**

In streaming mode, these are inline in the stream (via `safeEmit`) and get replaced by subsequent content. In buffered mode, `safeSend` calls `sendMessage` (which is `ctx.send()` at line 508) -- this creates a new persistent message activity in the Teams conversation. Each call produces a separate visible message.

This bug only manifests in buffered mode (`disableStreaming=true`). In streaming mode, tool results, kicks, and errors are emitted inline via `safeEmit` and don't create separate persistent messages.

Fix: in buffered mode, tool results, kicks, and terminal errors should use `safeUpdate` (transient status updates that show briefly during processing but don't persist) instead of `safeSend` (permanent separate messages). This matches the pattern already used by `onToolStart` (line 188: `safeUpdate(...)`) and transient errors (line 213: `safeUpdate(msg)`).

Specifically:
- `onToolEnd` buffered branch (line 194-195): change `safeSend(msg)` to `safeUpdate(msg)`
- `onKick` buffered branch (line 203-204): change `safeSend(msg)` to `safeUpdate(msg)`
- `onError` terminal buffered branch (line 215-216): change `safeSend(msg)` to `safeUpdate(msg)`

**Gate 1 checkpoint:** User tests on Copilot Chat. Expects: no phantom messages for tool results, kicks, or errors. displayName should be populated if Copilot Chat provides `activity.from.name` (may still be "Unknown" if the Copilot Chat surface doesn't populate that field -- the test will tell us).

---

#### GATE 2: Kick False Positives

**Bug 4 (CRITICAL): Kick loop -- narration detection false positives on conversational responses**

Root cause confirmed via session file evidence. The session file shows 4 consecutive `role: "assistant"` messages with identical content, each ending with the kick-appended text. The exact sequence:

1. Model calls `save_friend_note` tool successfully (`toolRounds = 1`)
2. Model responds with legitimate final answer: "Sorted. I'll show your backlog in a grid by default." + full grid table + "If you'd like this grouped by epic hierarchy in-grid next time, say the word."
3. `detectKick()` in `src/heart/kicks.ts` calls `hasToolIntent()` -- pattern `/\bi'll\b/i` matches "I'll show" in the legitimate response -- narration kick fires (`toolRounds = 2`)
4. Kick message appended to the response: "I narrated instead of acting. Calling the tool now -- if I've already finished, I can use final_answer."
5. Model sees the kick-appended message, regenerates the SAME response (because the grid was already the correct answer)
6. Same pattern matches again -- another kick -- same response -- repeat
7. This loops 4 times until `MAX_TOOL_ROUNDS` (10) kills it with a terminal error

This bug manifests in both streaming and buffered mode (the kick detection is in `core.ts`, not the channel adapter), but in streaming mode the inline text gets overwritten so the user doesn't see the duplication. In buffered mode, each kick iteration's output is preserved as a separate message (due to Bug 2), making the loop painfully visible.

The `TOOL_INTENT_PATTERNS` list (kicks.ts lines 33-120) was designed for an agentic code-generation context where the model should always be calling tools, not narrating intent. In a conversational Teams chat context, many of these patterns match perfectly normal responses.

Verified false positives by running all patterns against realistic bot responses:
- "Sorted. I'll show your backlog in a grid by default." -- matches `/\bi'll\b/i` (FALSE POSITIVE)
- "I can help with that! Here's your backlog:" -- matches `/\bi can\b/i` (FALSE POSITIVE)
- "I should mention your sprint review is tomorrow." -- matches `/\bi should\b/i` (FALSE POSITIVE)
- "Going forward, I'll remember that preference." -- matches `/\bi'll\b/i` (FALSE POSITIVE)
- "Let me know if you want me to make any changes." -- matches `/\blet me\b/i` (FALSE POSITIVE)
- "I'm glad you asked! Here are the details:" -- matches `/\bi'm \w+ing\b/i` via "I'm glad" (FALSE POSITIVE)
- Kick message itself: "...I can use final_answer." -- matches `/\bi can\b/i` (SELF-TRIGGER)

The existing test suite at `src/__tests__/heart/kicks.test.ts:25` encodes "I can help with that" as a TRUE positive for `hasToolIntent`, confirming the false positive is baked into the test expectations.

Fix: three-part fix.

**Part A: Remove overbroad patterns from TOOL_INTENT_PATTERNS.** Remove 6 patterns that match normal conversational English:
- `/\bi'll\b/i` (line 36) -- "I'll show your backlog" is conversational, not narration
- `/\bi will\b/i` (line 37) -- same issue
- `/\bi can\b/i` (line 53) -- "I can help with that" is conversational; also self-triggers in kick message
- `/\bi should\b/i` (line 52) -- "I should mention" is conversational
- `/\bi'm \w+ing\b/i` (line 47) -- matches "I'm glad", "I'm happy", "I'm sorry"
- `/\bi am \w+ing\b/i` (line 48) -- same issue

**Part B: Fix the kick message self-trigger.** The narration kick message at `kicks.ts:29` must not contain text that matches any remaining `TOOL_INTENT_PATTERNS`. Rewrite to avoid all patterns. E.g.: "That was narration, not action. Calling the tool or using final_answer now."

Verify with a unit test: `hasToolIntent(KICK_MESSAGES.narration)` must return `false`.

**Part C: Update existing tests.** The kick test suite expects "I can help with that" to return `true` from `hasToolIntent` (line 25). Update test expectations to match the new pattern list. Add regression tests with conversational bot responses that must NOT trigger kicks.

**Bug 5: Response duplication -- kick loop causes multiple identical messages**

Direct consequence of Bug 4 (kick loop) combined with Bug 2 (safeSend in buffered mode). NOT platform retries -- session file confirms 4 identical assistant messages in one session.

The mechanism:
1. Each kick iteration: model produces text -- `onTextChunk` accumulates in `textBuffer`
2. Bug 2: `onKick` calls `safeSend` which sends a separate "recycle kick" message
3. The kick message is appended to the assistant message in `messages[]` and the loop `continue`s
4. Next iteration: model regenerates the same response (because the original answer was correct) -- `onTextChunk` APPENDS to the existing `textBuffer`
5. The user sees multiple identical responses from the accumulated buffer and separate messages

Fix: resolves automatically when Bug 4 (kick false positives) and Bug 2 (safeSend) are fixed. No kick loop = no duplicate content. safeUpdate = no persistent phantom messages.

**Bug 6: Platform timeout in buffered mode**

The Teams/Copilot Chat platform showed "Sorry, something went wrong." This is a platform-level timeout -- the bot took too long to respond.

Direct consequence of Bug 4: the kick loop causes up to 10 API round trips before `MAX_TOOL_ROUNDS` kills it. Normal tool-using conversations (1-3 rounds) complete well within platform limits.

Fix: resolves automatically when Bug 4 is fixed. No dedicated fix needed.

**Gate 2 checkpoint:** User tests on Copilot Chat. Expects: no kick loop on legitimate conversational responses. Model says "I'll show you X" without getting kicked. Bug 5 (response spam) and Bug 6 (platform timeout) should also be resolved.

---

#### GATE 3: New-Friend Prompts

**Bug 3: New-friend behavior not triggering -- prompt instruction insufficient**

The new-friend instruction at `src/mind/prompt.ts:193-194` exists and is correctly conditional on `isNewFriend`. However, during live testing, the model did not exhibit new-friend behavior: no warm introduction, no attempt to learn the user's name, no `save_friend_note` call. The priority guidance ("my friend's request comes first") likely dominated.

This is a prompt tuning issue, not a code bug. Three changes needed:

1. Strengthen the new-friend instruction: more explicit about what to do. Help first, but briefly introduce yourself along the way, ask what they prefer to be called, and save what you learn with `save_friend_note`.

2. Name quality instruction (line 181) should interpolate the actual `displayName`: "the name i have for this friend is {displayName}." When displayName is "Unknown", the instruction should explicitly say to ask for their name.

3. The current instruction is a vague "i should learn..." -- needs to be an action directive: "after helping, i ask what they prefer to be called and save it."

**Gate 3 checkpoint:** User tests on Copilot Chat with a fresh friend record. Expects: bot helps first, introduces itself along the way, asks what the friend prefers to be called, and calls `save_friend_note` to save what it learns.

---

### Out of Scope
- Streaming mode changes (Bug 2's safeSend issue is buffered-mode-specific; streaming mode emits inline)
- Comprehensive rethink of the kick/narration detection system (deferred -- fix the immediate false positives and self-trigger; a broader redesign considering conversation context can come later)
- Changes to `save_friend_note` tool behavior (tool works correctly, model just isn't calling it due to prompt issues)
- Changes to the `FriendResolver` or `FriendStore` (these work correctly given correct inputs)
- New context kernel features
- Message deduplication via `activity.id` (deferred hardening measure -- the duplication is caused by the kick loop, not platform retries)
- Reducing `MAX_TOOL_ROUNDS` for buffered mode (monitor after Bug 4 fix -- likely not needed)

## Completion Criteria

### Gate 1: AAD Extraction + Phantom Messages
- [ ] `teamsContext` object populates `aadObjectId`, `tenantId`, and `displayName` from `activity`
- [ ] Friend record created via Teams has the user's real display name (not "Unknown") when AAD name is available
- [ ] Fallback to conversation-ID provider works when AAD fields are absent (Copilot Chat surface)
- [ ] Tool-result messages do not appear as separate bot messages in buffered mode
- [ ] Kick messages do not appear as separate bot messages in buffered mode
- [ ] Terminal error messages do not appear as separate bot messages in buffered mode
- [ ] In buffered mode, `onToolEnd`, `onKick`, and terminal `onError` use `safeUpdate` instead of `safeSend`
- [ ] User confirms on Copilot Chat: no phantom messages

### Gate 2: Kick False Positives
- [ ] `/\bi can\b/i`, `/\bi should\b/i`, `/\bi'll\b/i`, `/\bi will\b/i`, `/\bi'm \w+ing\b/i`, `/\bi am \w+ing\b/i` removed from `TOOL_INTENT_PATTERNS`
- [ ] Narration kick message does not self-trigger `hasToolIntent()` -- verified by unit test
- [ ] Common conversational responses ("I'll show your backlog", "I can help with that", "I'm happy to help") do NOT trigger `hasToolIntent` -- verified by regression tests
- [ ] Existing `hasToolIntent` test expectations updated to match new pattern list
- [ ] Kick loop scenario cannot occur (verified: model responds with normal text, no kick fires)
- [ ] No response duplication in buffered mode during normal tool-using conversations (Bug 5 resolved)
- [ ] No platform timeout from kick loops (Bug 6 resolved)
- [ ] User confirms on Copilot Chat: no kick loop, no response spam

### Gate 3: New-Friend Prompts
- [ ] New-friend system prompt instruction is more specific about introducing itself and asking for the friend's name
- [ ] Name quality instruction includes the actual displayName value
- [ ] When displayName is "Unknown", instruction explicitly tells the model to ask for the friend's name
- [ ] User confirms on Copilot Chat: bot helps first, introduces along the way, saves what it learns

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

## Open Questions
- [x] Bug 2: Should terminal errors in buffered mode also switch from `safeSend` to `safeUpdate`? **Resolved: yes.** Terminal errors should not leak as separate messages.
- [x] Bug 3: What balance between priority guidance and new-friend warmth? **Resolved: help first, introduce along the way, save what you learn.** No blocking the friend's request for social niceties.
- [x] Bug 3: Should displayName be interpolated in the name quality instruction? **Resolved: yes.** Include actual displayName, with special handling for "Unknown".
- [x] Bug 4 Part B: How aggressively should we prune `TOOL_INTENT_PATTERNS`? **Resolved: remove the most aggressive false-positive patterns.** Remove `/\bi'll\b/i`, `/\bi can\b/i`, `/\bi should\b/i`, `/\bi will\b/i`, `/\bi'm \w+ing\b/i`, `/\bi am \w+ing\b/i`. Keep patterns that are clearly narration-specific.
- [x] Bug 5: Is this platform retries or kick loop? **Resolved: kick loop.** Session file confirms 4 identical assistant messages with kick-appended text in one session. Dedup deferred.
- [ ] Bug 1: Do both surfaces (Copilot Chat and standard Teams) populate AAD fields the same way? **Unknown.** The standard Teams test used a simple greeting and created a separate session -- it doesn't tell us about AAD field population. The three-line fix extracts whatever is available regardless. Gate 1 user testing on Copilot Chat will reveal whether `activity.from.aadObjectId` and `activity.from.name` are populated on that surface.

## Decisions Made
- Bug 1 root cause confirmed by PII bridge file: `provider: "teams-conversation"` proves `aadObjectId` was missing. `teamsContext` at teams.ts:492 never sets the three AAD fields. Three-line fix with optional chaining handles both surfaces.
- Bug 2 root cause confirmed: `safeSend` in buffered mode sends separate bot messages via `ctx.send()`. Fix: use `safeUpdate` (transient status) for tool results, kicks, and terminal errors. Buffered-mode-only bug -- streaming mode is unaffected.
- Bug 4 root cause confirmed by session file: 4 consecutive identical assistant messages with kick-appended text. Overbroad patterns in `TOOL_INTENT_PATTERNS` match legitimate conversational responses. Kick message self-triggers via `/\bi can\b/i`. Fix: remove 6 false-positive patterns, rewrite kick message, add regression tests.
- Bug 5 is a direct consequence of Bug 4 + Bug 2. Resolves when both are fixed.
- Bug 6 is a direct consequence of Bug 4. Resolves when Bug 4 is fixed.
- Standard 1:1 Teams test (simple greeting) confirmed basic flow works but does not prove bugs are surface-specific. Bug 4 (kick detection) is surface-agnostic and runs in core.ts. Bug 2 (phantom messages) is buffered-mode-specific.
- Gated fix structure: Gate 1 (Bug 1 + 2), Gate 2 (Bug 4), Gate 3 (Bug 3). User tests on Copilot Chat between each gate.
- Existing test at kicks.test.ts:25 ("I can help with that" -> true) must be updated to reflect the new pattern list.

## Context / References
- `src/senses/teams.ts:492-506` -- teamsContext construction missing AAD fields (Bug 1)
- `src/senses/teams.ts:458` -- activity destructured from ctx (Bug 1)
- `src/senses/teams.ts:298-305` -- TeamsMessageContext interface with AAD fields (Bug 1)
- `src/senses/teams.ts:344-350` -- resolver uses teamsContext AAD fields (Bug 1)
- `src/senses/teams.ts:59-252` -- createTeamsCallbacks full implementation (Bug 2)
- `src/senses/teams.ts:117-124` -- safeSend sends separate messages via sendMessage (Bug 2)
- `src/senses/teams.ts:94-102` -- safeEmit sets streamHasContent (Bug 2)
- `src/senses/teams.ts:104-113` -- safeUpdate for transient status (Bug 2 fix pattern)
- `src/senses/teams.ts:191-198` -- onToolEnd buffered branch uses safeSend (Bug 2)
- `src/senses/teams.ts:200-207` -- onKick buffered branch uses safeSend (Bug 2)
- `src/senses/teams.ts:209-219` -- onError buffered branch uses safeSend for terminal (Bug 2)
- `src/senses/teams.ts:184-188` -- onToolStart uses safeUpdate correctly (Bug 2 reference)
- `src/senses/teams.ts:239-250` -- flush() logic for buffered text (Bug 5 interaction)
- `src/senses/teams.ts:508` -- ctxSend wraps ctx.send() for separate messages (Bug 2)
- `src/mind/prompt.ts:144-206` -- contextSection with friend instructions (Bug 3)
- `src/mind/prompt.ts:181` -- name quality instruction without displayName interpolation (Bug 3)
- `src/mind/prompt.ts:193-194` -- new-friend instruction too weak (Bug 3)
- `src/heart/kicks.ts` -- detectKick, hasToolIntent, TOOL_INTENT_PATTERNS, kick messages (Bug 4)
- `src/heart/kicks.ts:29` -- narration kick message self-triggers "I can" pattern (Bug 4)
- `src/heart/kicks.ts:33-120` -- TOOL_INTENT_PATTERNS with overbroad patterns (Bug 4)
- `src/heart/core.ts:100` -- MAX_TOOL_ROUNDS = 10 (Bug 4/6)
- `src/heart/core.ts:328-348` -- kick detection and loop in agent loop (Bug 4)
- `src/wardrobe/format.ts` -- formatToolResult, formatKick, formatError
- `src/__tests__/heart/kicks.test.ts` -- existing kick tests; line 25 "I can help with that" is a false-positive expectation that must be updated (Bug 4)
- `src/__tests__/senses/teams.test.ts` -- existing Teams tests
- `src/__tests__/mind/prompt.test.ts` -- existing prompt tests
- Previous planning: `ouroboros/tasks/2026-03-03-1102-planning-context-kernel-bugs.md`

## Notes
**Standard Teams test: limited signal.** The user sent "hi pal" through standard 1:1 Teams bot chat and got a clean response: "hello. what are we sorting today?". This confirms the basic greeting flow works, but does not narrow the bugs to a specific surface or mode. The greeting had no tool calls and no narration-style response, so it would not trigger kick detection on any surface. Bug 4 (kicks) is surface-agnostic (core.ts). Bug 2 (phantom messages) is buffered-mode-specific. Bug 1 (AAD extraction) is unknown -- the code bug exists regardless of surface.

**Patterns to remove from TOOL_INTENT_PATTERNS (6 patterns):**
- `/\bi'll\b/i` (line 36) -- "I'll show your backlog" is conversational, not narration
- `/\bi will\b/i` (line 37) -- same issue
- `/\bi can\b/i` (line 53) -- "I can help with that" is conversational; also self-triggers in kick message
- `/\bi should\b/i` (line 52) -- "I should mention" is conversational
- `/\bi'm \w+ing\b/i` (line 47) -- matches "I'm glad", "I'm happy", "I'm sorry"
- `/\bi am \w+ing\b/i` (line 48) -- same issue

**Patterns to keep (still clearly narration-specific):**
- `/\blet me\b/i` -- "Let me check the logs" is narration. "Let me know" is a known edge case but less common as a bot response opener.
- `/\bi need to\b/i` -- "I need to check the database" is narration
- `/\bi'm going to\b/i`, `/\bgoing to\b/i`, `/\bi am going to\b/i` -- announcing future action
- `/\bi would like to\b/i`, `/\bi want to\b/i` -- hedged intent
- All obligation patterns (`/\bi have to\b/i`, `/\bi must\b/i`, etc.)
- All first-person-plural intent patterns (`/\bwe need to\b/i`, etc.)
- All temporal/sequential narration patterns
- All gerund phase shifts, movement narration, self-narration
- `/\bcontinues\b/i`, `/^continuing\b/im`, `/^next up\b/i`

**Deferred: Message deduplication via activity.id**
Not needed for this task (duplication is from kick loop, not platform retries), but worth adding as a hardening measure in a future task to protect against actual platform retries.

**Deferred: Comprehensive kick system redesign**
The current kick system is a blunt instrument -- pattern matching on response text. A better approach would be context-aware: consider what tools are available, what the user asked, whether the model already called tools in this turn, and whether the response actually answers the user's question. This is a bigger project for later.

## Progress Log
- 2026-03-03 20:09 Created (3 bugs)
- 2026-03-03 20:15 Rewrote with 6 bugs after second test findings and code investigation
- 2026-03-03 20:25 Updated with session-file-confirmed root causes, corrected Bug 5 (kick loop not platform retries), resolved all open questions, specified exact patterns to remove
- 2026-03-03 20:26 Added Copilot Chat vs 1:1 Teams activity shape investigation note to Bug 1
- 2026-03-03 20:31 Restructured with gated fix groups, added standard-Teams-works finding
- 2026-03-03 20:34 Corrected scoping: Bug 4 is surface-agnostic (core.ts), Bug 2 is buffered-mode-specific, Bug 1 unknown. Standard Teams test was simple greeting -- doesn't prove surface specificity
