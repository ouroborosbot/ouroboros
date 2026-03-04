# Planning: Context Kernel Post-Testing Fixes

**Status**: drafting
**Created**: 2026-03-03 20:09

## Goal
Fix six bugs discovered during live testing of the context kernel on Microsoft 365 Copilot Chat (nostream/buffered mode). Two are critical and make the bot unusable: a kick loop caused by overbroad narration detection patterns, and response spam caused by that kick loop flushing duplicate content. Four are serious: AAD displayName extraction missing, phantom messages leaking as separate bot messages, weak new-friend prompt instructions, and a platform timeout that is a consequence of the kick loop.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope

**Bug 1: displayName is "Unknown" -- AAD fields not populated in teamsContext**

The `teamsContext` object constructed at `src/senses/teams.ts:492` only populates `graphToken`, `adoToken`, and `signin`. It never extracts `aadObjectId`, `tenantId`, or `displayName` from the Bot Framework `activity` object, even though:
- `TeamsMessageContext` interface (line 298-305) has the fields defined
- `activity.from.aadObjectId`, `activity.conversation.tenantId`, and `activity.from.name` are available on the activity
- The resolver at line 344-350 uses `teamsContext?.aadObjectId` to decide provider and falls through to `"Unknown"` when `teamsContext?.displayName` is falsy

Confirmed by PII bridge file: `provider: "teams-conversation"` with conversation ID as external ID, meaning `aadObjectId` was missing and the resolver used the conversation-ID fallback.

Fix: add `aadObjectId: activity.from?.aadObjectId`, `tenantId: activity.conversation?.tenantId`, and `displayName: activity.from?.name` to the `teamsContext` object at line 492-506. The fields are already destructured from `ctx` at line 458 (`const { stream, activity, api, signin } = ctx`). Three-line fix.

**Bug 1 investigation note: Copilot Chat vs 1:1 Teams bot activity shape.**
The user is testing on Microsoft 365 Copilot Chat (Custom Engine Agent), which is a different surface from standard 1:1 Teams bot chat. Both use the same Teams SDK and Azure resources, but the `activity` object may have different properties populated depending on which surface the message comes from. Specifically:
- `activity.from.aadObjectId` and `activity.from.name` may be present in one surface but not the other
- `activity.conversation.tenantId` may differ as well
- The user is about to test through standard 1:1 Teams to compare the activity shape
- If the activity shape differs between surfaces, we may need surface-specific extraction logic or more robust fallback handling beyond the current conversation-ID fallback
- The three-line fix is still correct (it extracts whatever is available), but the test coverage must verify both surfaces: one where AAD fields are present and one where they are absent (falling back to conversation-ID provider)

**Bug 2: Phantom tool-result and kick messages in buffered (nostream) mode**

In `createTeamsCallbacks` (`src/senses/teams.ts:59-252`), when `disableStreaming=true` (buffered mode):
- `onToolEnd` (line 194-195) calls `safeSend(msg)` which sends `formatToolResult()` output as a **separate bot message** via `ctx.send()`
- `onKick` (line 203-204) calls `safeSend(msg)` which sends `formatKick()` output as a **separate bot message**
- `onError` terminal branch (line 215-216) calls `safeSend(msg)` which sends the error as a **separate bot message**

In streaming mode, these are inline in the stream (via `safeEmit`) and get replaced by subsequent content. But in buffered mode, `safeSend` calls `sendMessage` (which is `ctx.send()` at line 508) -- this creates a new persistent message activity in the Teams conversation. Each call creates a separate visible message.

Fix: in buffered mode, tool results, kicks, and terminal errors should use `safeUpdate` (transient status updates that show briefly during processing but don't persist) instead of `safeSend` (permanent separate messages). This matches the pattern already used by `onToolStart` (line 188: `safeUpdate(...)`) and transient errors (line 213: `safeUpdate(msg)`).

Specifically:
- `onToolEnd` buffered branch (line 194-195): change `safeSend(msg)` to `safeUpdate(msg)`
- `onKick` buffered branch (line 203-204): change `safeSend(msg)` to `safeUpdate(msg)`
- `onError` terminal buffered branch (line 215-216): change `safeSend(msg)` to `safeUpdate(msg)`

**Bug 3: New-friend behavior not triggering -- prompt instruction insufficient**

The new-friend instruction at `src/mind/prompt.ts:193-194` exists and is correctly conditional on `isNewFriend`. However, during live testing, the model did not exhibit new-friend behavior: no warm introduction, no attempt to learn the user's name, no `save_friend_note` call. The priority guidance ("my friend's request comes first") likely dominated.

This is a prompt tuning issue, not a code bug. Three changes needed:

1. Strengthen the new-friend instruction: more explicit about what to do. Help first, but briefly introduce yourself along the way, ask what they prefer to be called, and save what you learn with `save_friend_note`.

2. Name quality instruction (line 181) should interpolate the actual `displayName`: "the name i have for this friend is {displayName}." When displayName is "Unknown", the instruction should explicitly say to ask for their name.

3. The current instruction is a vague "i should learn..." -- needs to be an action directive: "after helping, i ask what they prefer to be called and save it."

**Bug 4 (CRITICAL): Kick loop -- narration detection false positives on conversational responses**

Root cause confirmed via session file evidence. The session file shows 4 consecutive `role: "assistant"` messages with identical content, each ending with the kick-appended text. The exact sequence:

1. Model calls `save_friend_note` tool successfully (`toolRounds = 1`)
2. Model responds with legitimate final answer: "Sorted. I'll show your backlog in a grid by default." + full grid table + "If you'd like this grouped by epic hierarchy in-grid next time, say the word."
3. `detectKick()` in `src/heart/kicks.ts` calls `hasToolIntent()` -- pattern `/\bi'll\b/i` matches "I'll show" in the legitimate response -- narration kick fires (`toolRounds = 2`)
4. Kick message appended to the response: "I narrated instead of acting. Calling the tool now -- if I've already finished, I can use final_answer."
5. Model sees the kick-appended message, regenerates the SAME response (because the grid was already the correct answer)
6. Same pattern matches again -- another kick -- same response -- repeat
7. This loops 4 times until `MAX_TOOL_ROUNDS` (10) kills it with a terminal error

The `TOOL_INTENT_PATTERNS` list (kicks.ts lines 33-120) was designed for an agentic code-generation context where the model should always be calling tools, not narrating intent. In a conversational Teams chat context, many of these patterns match perfectly normal responses.

Verified false positives by running all patterns against realistic bot responses:
- "Sorted. I'll show your backlog in a grid by default." -- matches `/\bi'll\b/i` (FALSE POSITIVE)
- "I can help with that! Here's your backlog:" -- matches `/\bi can\b/i` (FALSE POSITIVE)
- "I should mention your sprint review is tomorrow." -- matches `/\bi should\b/i` (FALSE POSITIVE)
- "Going forward, I'll remember that preference." -- matches `/\bi'll\b/i` (FALSE POSITIVE)
- "Let me know if you want me to make any changes." -- matches `/\blet me\b/i` (FALSE POSITIVE)
- "I'm glad you asked! Here are the details:" -- matches `/\bi'm \w+ing\b/i` via "I'm glad" (FALSE POSITIVE)
- Kick message itself: "...I can use final_answer." -- matches `/\bi can\b/i` (SELF-TRIGGER)

Additionally, the narration kick message at `kicks.ts:29` self-triggers: it contains "I can" which matches `/\bi can\b/i`, creating a self-reinforcing loop even if the model's original response didn't trigger.

The existing test suite at `src/__tests__/heart/kicks.test.ts:25` encodes "I can help with that" as a TRUE positive for `hasToolIntent`, confirming the false positive is baked into the test expectations.

Fix: two-part fix.

**Part A: Remove overbroad patterns from TOOL_INTENT_PATTERNS.** Remove patterns that match normal conversational English:
- `/\bi can\b/i` -- "I can help with that" is legitimate conversation, not narration
- `/\bi should\b/i` -- "I should mention" is legitimate conversation
- `/\bi'm \w+ing\b/i` -- matches "I'm glad", "I'm happy", "I'm sorry" -- way too broad
- `/\bi am \w+ing\b/i` -- same issue as above

Keep patterns that are clearly narration-specific (announced intent to act rather than acting):
- `/\blet me\b/i` -- "Let me check" is narration, but "Let me know" is not. Ambiguous -- keep for now but add regression tests noting this is a known edge case.
- `/\bi'll\b/i` -- "I'll need to query" is narration, "I'll show your backlog" is legitimate. Ambiguous -- REMOVE. Too many false positives on conversational responses. The model saying "I'll show you X" while showing X is not narration.
- `/\bi will\b/i` -- same issue as `/\bi'll\b/i`. REMOVE.

**Part B: Fix the kick message self-trigger.** The narration kick message at `kicks.ts:29` must not contain text that matches any remaining `TOOL_INTENT_PATTERNS`. Rewrite to avoid all patterns. E.g.: "That was narration, not action. Calling the tool or using final_answer now."

Verify with a unit test: `hasToolIntent(KICK_MESSAGES.narration)` must return `false`.

**Part C: Update existing tests.** The kick test suite expects "I can help with that" to return `true` from `hasToolIntent` (line 25). Update test expectations to match the new pattern list. Add regression tests with conversational bot responses that must NOT trigger kicks.

**Bug 5: Response duplication -- kick loop causes multiple identical messages**

Root cause: NOT platform retries. Direct consequence of Bug 4 (kick loop) combined with Bug 2 (safeSend in buffered mode).

The mechanism, confirmed by session file evidence:
1. Each kick iteration: model produces text -- `onTextChunk` accumulates in `textBuffer`
2. Bug 2: `onKick` calls `safeSend` which sends a separate "recycle kick" message
3. The kick message is appended to the assistant message in `messages[]` and the loop `continue`s
4. Next iteration: model regenerates the same response (because the original answer was correct) -- `onTextChunk` APPENDS to the existing `textBuffer`
5. After 4+ kick iterations, when `onToolStart` fires (if model tries a tool) or `flush()` runs after the loop, the accumulated buffer contains multiple copies of the response concatenated together
6. The user saw 4 identical grid responses because each iteration's text was separately sent via `safeSend` from the `onToolEnd`/`onKick` callbacks, AND the textBuffer accumulated all iterations' content

Fix: Bug 5 resolves automatically when Bug 4 (kick false positives) and Bug 2 (safeSend) are fixed. No kick loop = no duplicate content. safeUpdate = no persistent phantom messages.

Message deduplication (`activity.id`) is a separate hardening measure deferred to a future task.

**Bug 6: Platform timeout in buffered mode**

The Teams/Copilot Chat platform showed "Sorry, something went wrong." This is a platform-level timeout -- the bot took too long to respond.

This is a direct consequence of Bug 4: the kick loop causes up to 10 API round trips (each is a full model call through devtunnel) before the `MAX_TOOL_ROUNDS` limit kills it. Normal tool-using conversations (1-3 rounds) complete well within platform limits.

Fix: resolves automatically when Bug 4 is fixed. No dedicated fix needed.

### Out of Scope
- Streaming mode changes (streaming mode handles tool results, kicks, and errors correctly via inline stream emission)
- Comprehensive rethink of the kick/narration detection system (deferred -- fix the immediate false positives and self-trigger; a broader redesign considering conversation context can come later)
- Changes to `save_friend_note` tool behavior (tool works correctly, model just isn't calling it due to prompt issues)
- Changes to the `FriendResolver` or `FriendStore` (these work correctly given correct inputs)
- New context kernel features
- Message deduplication via `activity.id` (deferred hardening measure -- the duplication is caused by the kick loop, not platform retries)
- Reducing `MAX_TOOL_ROUNDS` for buffered mode (monitor after Bug 4 fix -- likely not needed)

## Completion Criteria
- [ ] `teamsContext` object populates `aadObjectId`, `tenantId`, and `displayName` from `activity`
- [ ] Friend record created via Teams has the user's real display name (not "Unknown") when AAD name is available
- [ ] Tool-result messages do not appear as separate bot messages in buffered mode
- [ ] Kick messages do not appear as separate bot messages in buffered mode
- [ ] Terminal error messages do not appear as separate bot messages in buffered mode
- [ ] In buffered mode, `onToolEnd`, `onKick`, and terminal `onError` use `safeUpdate` instead of `safeSend`
- [ ] New-friend system prompt instruction is more specific about introducing itself and asking for the friend's name
- [ ] Name quality instruction includes the actual displayName value and handles "Unknown" case
- [ ] `/\bi can\b/i`, `/\bi should\b/i`, `/\bi'll\b/i`, `/\bi will\b/i`, `/\bi'm \w+ing\b/i`, `/\bi am \w+ing\b/i` removed from `TOOL_INTENT_PATTERNS`
- [ ] Narration kick message does not self-trigger `hasToolIntent()` -- verified by unit test
- [ ] Common conversational responses ("I'll show your backlog", "I can help with that", "I'm happy to help") do NOT trigger `hasToolIntent` -- verified by regression tests
- [ ] Existing `hasToolIntent` test expectations updated to match new pattern list
- [ ] Kick loop scenario cannot occur (verified: model responds with normal text, no kick fires)
- [ ] No response duplication in buffered mode during normal tool-using conversations
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
- [x] Bug 4 Part B: How aggressively should we prune `TOOL_INTENT_PATTERNS`? **Resolved: remove the most aggressive false-positive patterns.** Remove `/\bi'll\b/i`, `/\bi can\b/i`, `/\bi should\b/i`, `/\bi will\b/i`, `/\bi'm \w+ing\b/i`, `/\bi am \w+ing\b/i`. These match normal conversational English. Keep patterns that are clearly narration-specific (e.g., temporal/sequential narration, self-narration, gerund phase shifts).
- [x] Bug 5: Is this platform retries or kick loop? **Resolved: kick loop.** Session file shows 4 identical assistant messages with kick-appended text. The duplication is caused by the kick loop regenerating the same response, not by platform retries. Message deduplication deferred as a separate hardening measure.

## Decisions Made
- Bug 1 root cause confirmed by PII bridge file: `provider: "teams-conversation"` proves `aadObjectId` was missing. `teamsContext` at teams.ts:492 never sets the three AAD fields. Three-line fix.
- Bug 2 root cause confirmed: `safeSend` in buffered mode sends separate bot messages via `ctx.send()`. Fix: use `safeUpdate` (transient status) for tool results, kicks, and terminal errors, matching the `onToolStart` pattern.
- Bug 4 root cause confirmed by session file: 4 consecutive identical assistant messages with kick-appended text. The kick loop is caused by overbroad patterns in `TOOL_INTENT_PATTERNS` matching legitimate conversational responses. The kick message itself also self-triggers via `/\bi can\b/i`. Fix: remove false-positive patterns, rewrite kick message, add regression tests.
- Bug 4 pattern pruning decided: remove `/\bi'll\b/i`, `/\bi can\b/i`, `/\bi should\b/i`, `/\bi will\b/i`, `/\bi'm \w+ing\b/i`, `/\bi am \w+ing\b/i`. These are the patterns that match normal conversational English. Remaining patterns (temporal narration, sequential narration, gerund phase shifts, self-narration, explicit multi-word intent phrases like "let me", "going to", "I need to") are more specific to actual narration.
- Bug 5 is a direct consequence of Bug 4 + Bug 2, not platform retries. Resolves when both are fixed. No separate dedup needed for this task.
- Bug 6 is a direct consequence of Bug 4 (10 API round trips). Resolves when Bug 4 is fixed.
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
**Bug dependency chain:** Bug 4 (kick loop) causes Bug 6 (platform timeout) and Bug 5 (response duplication). Bug 2 (phantom messages via safeSend) makes bugs 4 and 5 visible as separate persistent messages. The fix order is: Bug 4 first (eliminates the cascade), Bug 2 second (stops message leaks even for non-kick scenarios), then Bug 1 and Bug 3 in parallel.

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
