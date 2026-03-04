# Planning: Context Kernel Post-Testing Fixes

**Status**: drafting
**Created**: 2026-03-03 20:09

## Goal
Fix six bugs discovered during live testing of the context kernel on Microsoft 365 Copilot Chat (nostream/buffered mode). Two are critical (kick loop causing cascading failures, response spam from platform retries). Four are serious (AAD displayName extraction, phantom messages, new-friend behavior, platform timeout). The bot is currently unusable in buffered mode due to bugs 4 and 5.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope

**Bug 1: displayName is "Unknown" -- AAD fields not populated in teamsContext**

The `teamsContext` object constructed at `src/senses/teams.ts:492` only populates `graphToken`, `adoToken`, and `signin`. It never extracts `aadObjectId`, `tenantId`, or `displayName` from the Bot Framework `activity` object, even though:
- `TeamsMessageContext` interface (line 298-305) has the fields defined
- `activity.from.aadObjectId`, `activity.conversation.tenantId`, and `activity.from.name` are available on the activity
- The resolver at line 344-350 uses `teamsContext?.aadObjectId` to decide provider and falls through to `"Unknown"` when `teamsContext?.displayName` is falsy

Fix: add `aadObjectId: activity.from?.aadObjectId`, `tenantId: activity.conversation?.tenantId`, and `displayName: activity.from?.name` to the `teamsContext` object at line 492-506. The fields are already destructured from `ctx` at line 458 (`const { stream, activity, api, signin } = ctx`).

**Bug 2: Phantom tool-result and kick messages in buffered (nostream) mode**

In `createTeamsCallbacks` (`src/senses/teams.ts:59-240`), when `disableStreaming=true` (buffered mode):
- `onToolEnd` (line 194-195) calls `safeSend(msg)` which sends `formatToolResult()` output as a **separate bot message** via `ctx.send()`
- `onKick` (line 203-204) calls `safeSend(msg)` which sends `formatKick()` output as a **separate bot message**
- `onError` terminal branch (line 215-216) calls `safeSend(msg)` which sends the error as a **separate bot message**

In streaming mode, these are inline in the stream (via `safeEmit`) and get replaced by subsequent content. But in buffered mode, `safeSend` calls `sendMessage` (which is `ctx.send()`) -- this creates a new persistent message activity in the Teams conversation.

Fix: in buffered mode, tool results, kicks, and terminal errors should use `safeUpdate` (transient status updates that show briefly during processing but don't persist) instead of `safeSend` (permanent separate messages). This matches the pattern already used by `onToolStart` (line 188: `safeUpdate(...)`) and transient errors (line 213: `safeUpdate(msg)`).

Specifically:
- `onToolEnd` buffered branch (line 194-195): change `safeSend(msg)` to `safeUpdate(msg)`
- `onKick` buffered branch (line 203-204): change `safeSend(msg)` to `safeUpdate(msg)`
- `onError` terminal buffered branch (line 215-216): change `safeSend(msg)` to `safeUpdate(msg)`

**Bug 3: New-friend behavior not triggering -- prompt instruction insufficient**

The new-friend instruction at `src/mind/prompt.ts:193-194` exists and is correctly conditional on `isNewFriend`. However, during live testing, the model did not exhibit new-friend behavior: no warm introduction, no attempt to learn the user's name, no `save_friend_note` call. The priority guidance ("my friend's request comes first") likely dominated.

This is a prompt tuning issue, not a code bug. Three changes needed:

1. Strengthen the new-friend instruction: more explicit about what to do. Help first, but briefly introduce yourself along the way, ask what they prefer to be called, and save what you learn with `save_friend_note`.

2. Name quality instruction (line 181) should interpolate the actual `displayName`: "the name i have for this friend is {displayName}." When displayName is "Unknown" or looks like a system name, the instruction should explicitly say to ask for their name.

3. The current instruction is a vague "i should learn..." -- needs to be an action directive: "after helping, i ask what they prefer to be called and save it."

**Bug 4 (CRITICAL): Kick loop -- narration detection is too aggressive**

Root cause confirmed via code analysis. `detectKick()` in `src/heart/kicks.ts` uses `hasToolIntent()` with `TOOL_INTENT_PATTERNS` (lines 33-120). These patterns are catastrophically overbroad for conversational responses:

- `/\bi can\b/i` matches "I can show you that", "Here's what I can do"
- `/\bi'll\b/i` matches "I'll show your backlog in a grid"
- `/\bi should\b/i` matches "I should mention that..."
- `/\bcontinues\b/i` matches any use of "continues"
- `/\bgoing to\b/i` matches "Going to show you..."

**Critically, the kick message itself self-triggers**: the narration kick message is "I narrated instead of acting. Calling the tool now -- if I've already finished, **I can** use final_answer." This matches `/\bi can\b/i`, so the kick injects a message that triggers another kick on the next iteration, creating a self-reinforcing loop.

The observed sequence:
1. Model calls `save_friend_note` -> tool runs successfully -> `toolRounds = 1`
2. Model responds: "Sorted. I'll show your backlog in a grid by default." -> `hasToolIntent` matches "I'll" -> kick #1, `toolRounds = 2`
3. Kick message injected: "I narrated instead of acting. Calling the tool now -- if I've already finished, I can use final_answer." -> model responds again -> likely kicked again (response + kick content both match patterns) -> kick #2-6, `toolRounds = 3-7`
4. Eventually `toolRounds >= MAX_TOOL_ROUNDS (10)` -> terminal error

Each kick fires `callbacks.onKick()` which (due to Bug 2) sends a separate "recycle kick" message to the user. Six kicks = six phantom messages.

Fix: two-part fix.

**Part A: Fix the kick message self-trigger.** The narration kick message at `kicks.ts:29` contains "I can" which matches the intent patterns. Rewrite it to avoid triggering `hasToolIntent`. E.g.: "That was narration, not action. Using the tool now -- or final_answer if done."

**Part B: Reduce false positives in TOOL_INTENT_PATTERNS.** The patterns need to be narrowed so legitimate conversational responses don't trigger kicks. The narration detector was designed for a code-generation agent that should always call tools -- it's too aggressive for a conversational agent that legitimately responds with text.

Options (decide during implementation):
- Remove the most overbroad patterns (`/\bi can\b/i`, `/\bi should\b/i`, `/\bcontinues\b/i`) that match normal conversation
- Add a minimum-length threshold (very short responses are more likely narration filler)
- Add negative patterns / allowlists for common conversational phrases
- Only trigger narration kicks when `toolChoiceRequired` is set (most conservative -- disables narration kicks entirely for normal conversation)

The safest immediate fix is Part A (stop the self-reinforcing loop) plus removing the most egregious false-positive patterns from Part B. A broader rethink of the kick system can be deferred.

**Bug 5 (CRITICAL): Response spam from platform retries**

When the agent takes too long (Bug 4's kick loop runs through 10 rounds), the Teams/Copilot Chat platform times out and shows "Sorry, something went wrong." The platform then **retries the message delivery** -- sending the same user message to the bot multiple times.

Each retry arrives as a new `app.on("message")` invocation. The `withConversationLock` at `teams.ts:279-284` serializes them (they queue behind the conversation lock), but each eventually runs and processes the same message as a fresh turn. Result: the user sees 4 identical responses (1 original + 3 retries).

There is currently no deduplication or retry protection in the message handler.

Fix: add message deduplication to the `app.on("message")` handler. Use `activity.id` (the Bot Framework message activity ID, unique per delivery) to track recently processed messages. If the same `activity.id` arrives again, skip it.

Implementation:
- Add a `Map<string, number>` (or `Set` with TTL) at module level to track recently processed activity IDs
- At the top of `app.on("message")` (after confirmation resolution check), check if `activity.id` has been seen. If yes, return early.
- After processing (or on entry to processing), add the activity ID to the set
- Use a TTL cleanup (e.g., delete entries older than 5 minutes) to prevent unbounded growth
- The activity ID should be checked BEFORE the conversation lock to avoid unnecessary queuing

**Bug 6: Platform timeout in buffered mode**

The Teams/Copilot Chat platform showed "Sorry, something went wrong. I am unable to give you this response at the moment." This is a platform-level timeout -- the bot took too long to respond.

This is primarily a consequence of Bug 4 (kick loop causes 10 API round trips before resolving). Once Bug 4 is fixed (no kick loop), response times should be within platform limits for normal tool-using conversations.

No dedicated fix needed beyond fixing Bug 4. However, as a defensive measure, we should ensure that `MAX_TOOL_ROUNDS` (currently 10 in `core.ts:100`) is reasonable for buffered mode where each round is a full API call through devtunnel. Consider whether a lower limit should apply in nostream mode, or whether this is fine once kick false positives are eliminated.

### Out of Scope
- Streaming mode changes (streaming mode handles tool results, kicks, and errors correctly via inline stream emission)
- Comprehensive rethink of the kick/narration detection system (deferred -- fix the immediate false positives and self-trigger)
- Changes to `save_friend_note` tool behavior (tool works correctly, model just isn't calling it due to prompt issues)
- Changes to the `FriendResolver` or `FriendStore` (these work correctly given correct inputs)
- New context kernel features
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
- [ ] Narration kick message does not self-trigger `hasToolIntent()` -- verified by unit test
- [ ] `TOOL_INTENT_PATTERNS` do not match common conversational responses (e.g., "I'll show your backlog", "I can help with that") -- verified by unit test
- [ ] Kick loop scenario (model responds with normal conversation, gets kicked, kick self-triggers) cannot occur
- [ ] Duplicate message deliveries from the platform are detected and skipped
- [ ] Message deduplication uses `activity.id` with a bounded TTL
- [ ] Duplicate detection happens before the conversation lock (no unnecessary queuing)
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
- [ ] Bug 4 Part B: How aggressively should we prune `TOOL_INTENT_PATTERNS`? Options: (a) remove the worst offenders (`/\bi can\b/i`, `/\bi should\b/i`, etc.), (b) require multiple pattern matches before triggering a kick, (c) only trigger narration kicks when `toolChoiceRequired` is set. Recommendation: start with (a) -- remove patterns that match normal conversational responses. Add regression tests with real bot responses to prevent future false positives.
- [ ] Bug 5: What TTL should the message dedup use? 5 minutes seems reasonable -- covers the platform retry window without unbounded memory growth. Need to confirm what retry intervals the platform uses.
- [ ] Bug 5: Should we use `activity.id` or something else for dedup? `activity.id` is the standard Bot Framework activity ID, unique per delivery. Confirm this is stable across retries vs. unique per retry attempt. If the platform generates a new activity ID for each retry, we need a different dedup key (e.g., `conversationId + text + timestamp_bucket`).

## Decisions Made
- Bug 1 root cause confirmed: `teamsContext` at teams.ts:492 never sets the three AAD fields despite the interface supporting them and the activity containing them. Three-line fix.
- Bug 2 root cause confirmed: `safeSend` in buffered mode sends separate bot messages via `ctx.send()`. Fix: use `safeUpdate` (transient status) for tool results, kicks, and terminal errors, matching the `onToolStart` pattern.
- Bug 4 root cause confirmed via code analysis: the narration kick message ("I narrated instead of acting. Calling the tool now -- if I've already finished, **I can** use final_answer.") contains "I can" which matches `/\bi can\b/i` in `TOOL_INTENT_PATTERNS`, causing a self-reinforcing kick loop. Additionally, `TOOL_INTENT_PATTERNS` contains many patterns that match normal conversational responses (verified: "I'll show your backlog" matches `/\bi'll\b/i`, "I should mention" matches `/\bi should\b/i`).
- Bug 5 root cause: no message deduplication. Platform retries after timeout cause the same message to be processed multiple times via the conversation lock queue. Fix: dedup on `activity.id` before the conversation lock.
- Bug 6 is a consequence of Bug 4 (kick loop = 10 API round trips). No dedicated fix needed beyond fixing Bug 4.

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
- `src/senses/teams.ts:457-514` -- app.on("message") handler (Bug 5 dedup location)
- `src/senses/teams.ts:508` -- ctxSend wraps ctx.send() for separate messages (Bug 2)
- `src/senses/teams.ts:279-284` -- withConversationLock serializes but doesn't dedup (Bug 5)
- `src/mind/prompt.ts:144-206` -- contextSection with friend instructions (Bug 3)
- `src/mind/prompt.ts:181` -- name quality instruction without displayName interpolation (Bug 3)
- `src/mind/prompt.ts:193-194` -- new-friend instruction too weak (Bug 3)
- `src/heart/kicks.ts` -- detectKick, hasToolIntent, TOOL_INTENT_PATTERNS, kick messages (Bug 4)
- `src/heart/kicks.ts:29` -- narration kick message self-triggers "I can" pattern (Bug 4)
- `src/heart/kicks.ts:33-120` -- TOOL_INTENT_PATTERNS with overbroad patterns (Bug 4)
- `src/heart/core.ts:100` -- MAX_TOOL_ROUNDS = 10 (Bug 4/6)
- `src/heart/core.ts:328-348` -- kick detection and loop in agent loop (Bug 4)
- `src/wardrobe/format.ts` -- formatToolResult, formatKick, formatError
- `src/mind/friends/resolver.ts` -- FriendResolver (works correctly given correct inputs)
- `src/__tests__/senses/teams.test.ts` -- existing Teams tests
- `src/__tests__/mind/prompt.test.ts` -- existing prompt tests
- `src/__tests__/heart/kicks.test.ts` -- existing kick tests (need expansion for false positives)
- Previous planning: `ouroboros/tasks/2026-03-03-1102-planning-context-kernel-bugs.md`

## Notes
Bug dependency chain: Bug 4 (kick loop) causes Bug 6 (platform timeout), which causes Bug 5 (retries). Bug 2 (phantom messages) makes bugs 4 and 5 visible as separate messages. Fixing in order of impact: Bug 4 first (eliminates the cascade), Bug 2 second (stops message leaks), Bug 5 third (dedup for robustness), Bug 1 and 3 can be parallel.

The `TOOL_INTENT_PATTERNS` list was designed for an agentic code-generation context where the model should always be calling tools, not narrating. In a conversational context (Teams chat), many of these patterns match perfectly normal responses. The kick system needs to be more conservative for conversational channels. However, a full rethink is deferred -- the immediate fix is to eliminate the self-trigger and the worst false positives.

Verified false positives by running patterns against real bot responses:
- "Sorted. I'll show your backlog in a grid by default." -> matches `/\bi'll\b/i`
- "I can show you that. Let me pull up your backlog." -> matches `/\blet me\b/i`, `/\bi can\b/i`
- "I've saved that preference. Going forward, I'll display your backlog as a grid." -> matches `/\bi'll\b/i`
- "I should mention that your sprint ends Friday." -> matches `/\bi should\b/i`
- Kick message itself: "...I can use final_answer." -> matches `/\bi can\b/i`

## Progress Log
- 2026-03-03 20:09 Created (3 bugs)
- 2026-03-03 20:15 Rewrote with 6 bugs after second test findings and code investigation
