# Planning: Context Kernel Post-Testing Fixes

**Status**: drafting
**Created**: 2026-03-03 20:09

## Goal
Fix six bugs discovered during live testing of the context kernel on Microsoft 365 Copilot Chat and standard 1:1 Teams. Bug 1 (bot doesn't know who the user is) is the most fundamental -- everything downstream depends on identity. Bug 4 (kick loop) is the most disruptive. Fixes are structured in three gated groups with manual user testing between each.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### Test Results Summary

Two surfaces tested, both in buffered mode:

| Bug | Copilot Chat | Standard Teams 1:1 |
|-----|-------------|-------------------|
| Bug 1: displayName "Unknown" | YES | Not verified (different session) |
| Bug 2: Out-of-order messages | YES -- messages render above user msg | NO -- buffered mode works clean |
| Bug 3: Cold first encounter | YES | YES -- "hello. what are we sorting today?" |
| Bug 4: Kick loop | YES (4x identical response) | Not triggered (no tool calls in test) |
| Bug 5: Response spam | YES (consequence of 4+2) | Not triggered |
| Bug 6: Platform timeout | YES (consequence of 4) | Not triggered |

Key facts:
- Bug 1 (AAD extraction): code bug is the same on both surfaces. Whether `activity.from.aadObjectId` is populated may differ per surface -- Gate 1 testing will confirm.
- Bug 2 (out-of-order messages): Copilot-surface-specific. Buffered mode in standard Teams does NOT produce out-of-order messages. The issue is how the Copilot Chat surface renders `ctx.send()` / `safeSend()` messages -- each creates a separate persistent message that appears out of order (above the user's message or in the wrong sequence).
- Bug 3 (cold first encounter): surface-agnostic. Confirmed on both surfaces.
- Bug 4 (kick false positives): the pattern matching runs in `core.ts` (surface-agnostic), but the visible symptoms (kick messages appearing as separate messages) are Copilot-surface-specific via Bug 2.

### Gated Fix Structure

**Gate 1: Bug 1 (AAD extraction) + Bug 2 (out-of-order messages)**
Bug 1 is the most fundamental fix -- the bot must know who the user is. Bug 2 is a mechanical three-line change. User tests after.

**Gate 2: Bug 4 (kick false positives)**
Eliminates the kick loop cascade. Also resolves Bug 5 (response spam) and Bug 6 (platform timeout). User tests after.

**Gate 3: Bug 3 (new-friend prompts)**
Prompt tuning. User tests on both surfaces after.

### In Scope

---

#### GATE 1: Identity + Out-of-Order Messages

**Bug 1 (CRITICAL): Bot doesn't know who the user is**

The most fundamental bug. The friend record has `displayName: "Unknown"` and the PII bridge shows `provider: "teams-conversation"` with the conversation ID as external ID. The bot fell through to the conversation-ID fallback because `aadObjectId` was never extracted. Everything downstream -- system prompt personalization, name quality instructions, friend resolution -- depends on knowing who the user is.

Root cause at `src/senses/teams.ts:492-506`: the `teamsContext` object is constructed with `graphToken`, `adoToken`, and `signin`, but `aadObjectId`, `tenantId`, and `displayName` are never set from the activity. The `TeamsMessageContext` interface (line 298-305) declares these fields. The activity has them (`activity.from.aadObjectId`, `activity.conversation.tenantId`, `activity.from.name`). They are just never copied over.

Fix: add three fields to the `teamsContext` object literal at line 492:
```
aadObjectId: activity.from?.aadObjectId,
tenantId: activity.conversation?.tenantId,
displayName: activity.from?.name,
```

The fields are already available -- `activity` is destructured from `ctx` at line 458. Optional chaining handles the case where any field is absent. The existing conversation-ID fallback at line 344-345 handles the case where `aadObjectId` is not populated (which may happen on the Copilot Chat surface -- Gate 1 testing will confirm).

**Bug 2: Out-of-order messages on Copilot Chat surface**

In `createTeamsCallbacks` (`src/senses/teams.ts:59-252`), when `disableStreaming=true` (buffered mode):
- `onToolEnd` (line 194-195) calls `safeSend(msg)` -- sends tool result as separate bot message
- `onKick` (line 203-204) calls `safeSend(msg)` -- sends kick notification as separate bot message
- `onError` terminal branch (line 215-216) calls `safeSend(msg)` -- sends error as separate bot message

`safeSend` calls `sendMessage` (which is `ctx.send()` at line 508). On the Copilot Chat surface, each `ctx.send()` creates a separate persistent message that renders out of order -- tool results and kick notifications appear above the user's message or in the wrong sequence, and the actual response gets duplicated below. These are real messages showing up in the wrong place, not invisible artifacts. On standard 1:1 Teams in buffered mode, this does NOT produce out-of-order messages -- the surface renders them differently.

Fix: change `safeSend(msg)` to `safeUpdate(msg)` for all three callbacks in the buffered branch. `safeUpdate` shows transient status text that doesn't persist as a separate message. This matches the pattern already used by `onToolStart` (line 188) and transient errors (line 213).

**Gate 1 checkpoint:** User tests on Copilot Chat. Expects: no out-of-order messages (tool results and kicks should not appear as separate messages), displayName populated (or confirmed that Copilot Chat doesn't provide `activity.from.name`, in which case the conversation-ID fallback is correct behavior).

---

#### GATE 2: Kick False Positives

**Bug 4: Kick loop from overbroad narration detection**

Confirmed via session file: 4 consecutive identical `role: "assistant"` messages with kick-appended text. The model's legitimate response "Sorted. I'll show your backlog in a grid by default." triggers `/\bi'll\b/i` in `TOOL_INTENT_PATTERNS`, which fires a narration kick. The kick message itself ("...I can use final_answer.") triggers `/\bi can\b/i`, creating a self-reinforcing loop that runs until `MAX_TOOL_ROUNDS` (10) kills it.

The pattern matching is in `core.ts` (surface-agnostic) -- it would fire on standard Teams too if the model said "I'll show you...". The visible symptoms (kick messages as separate persistent messages) are Copilot-surface-specific via Bug 2. On standard Teams in buffered mode the kicks would still waste API round trips but wouldn't show as separate messages.

Six patterns to remove (match normal conversational English):
- `/\bi'll\b/i` -- "I'll show your backlog"
- `/\bi will\b/i` -- same
- `/\bi can\b/i` -- "I can help with that"; also self-triggers in kick message
- `/\bi should\b/i` -- "I should mention"
- `/\bi'm \w+ing\b/i` -- matches "I'm glad", "I'm happy", "I'm sorry"
- `/\bi am \w+ing\b/i` -- same

Kick message rewrite: must not match any remaining pattern. Verify with unit test.

Update existing tests: `kicks.test.ts:25` expects "I can help with that" -> true. Must be updated. Add regression tests with conversational responses that must NOT trigger kicks.

**Bug 5: Response spam** -- consequence of Bug 4 (kick loop) + Bug 2 (out-of-order messages on Copilot). Resolves when both are fixed.

**Bug 6: Platform timeout** -- consequence of Bug 4 (10 API round trips). Resolves when Bug 4 is fixed.

**Gate 2 checkpoint:** User tests on Copilot Chat with a tool-using request (e.g., "show me my backlog"). Expects: no kick loop, no response spam, no timeout.

---

#### GATE 3: New-Friend Prompts

**Bug 3: Cold first encounter -- confirmed on both surfaces**

- Copilot Chat: user sent "hi, can you show me my backlog?" -- bot showed backlog, no introduction, didn't learn name, didn't call `save_friend_note`
- Standard Teams: user sent "hi pal" -- bot responded "hello. what are we sorting today?" -- cold, transactional, no warmth

Surface-agnostic. The system prompt instruction at `prompt.ts:193-194` is too weak:
```
this is a new friend -- i have no notes or preferences saved yet. i should learn their name and how they like to work, and save what i learn.
```

"i should learn" is aspirational, not directive. The model treats it as optional. The priority guidance ("my friend's request comes first") compounds this -- the model reads it as "only the request matters."

Three changes:
1. Aspirational to directive: "after addressing their request, i introduce myself briefly and ask what they prefer to be called. i save what i learn with save_friend_note."
2. Interpolate displayName: "the name i have for this friend is {displayName}." When "Unknown": "i don't know this friend's name yet -- i ask what they'd like to be called and save it."
3. Clarify priority vs warmth: "help first, then get to know them" not "help only."

**Gate 3 checkpoint:** User tests on both Copilot Chat and standard Teams with fresh friend records. Expects: bot helps first, introduces itself along the way, asks what they prefer to be called, calls `save_friend_note`.

---

### Out of Scope
- Streaming mode changes (Bug 2 is Copilot-surface-specific in buffered mode; streaming emits inline)
- Comprehensive kick system redesign (fix immediate false positives; broader context-aware redesign deferred)
- Changes to `save_friend_note` tool behavior (tool works correctly)
- Changes to `FriendResolver` or `FriendStore` (work correctly given correct inputs)
- Message deduplication via `activity.id` (deferred hardening)

## Completion Criteria

### Gate 1: Identity + Out-of-Order Messages
- [ ] `teamsContext` populates `aadObjectId`, `tenantId`, and `displayName` from `activity`
- [ ] Friend record has real display name when AAD name is available
- [ ] Conversation-ID fallback works when AAD fields are absent
- [ ] `onToolEnd`, `onKick`, and terminal `onError` use `safeUpdate` in buffered mode
- [ ] User confirms on Copilot Chat: tool results and kicks do not appear as separate out-of-order messages, displayName populated or fallback confirmed

### Gate 2: Kick False Positives
- [ ] 6 overbroad patterns removed from `TOOL_INTENT_PATTERNS`
- [ ] Kick message does not self-trigger `hasToolIntent()` -- verified by unit test
- [ ] Conversational responses do not trigger kicks -- verified by regression tests
- [ ] Existing test expectations updated
- [ ] User confirms on Copilot Chat: no kick loop, no response spam, no timeout

### Gate 3: New-Friend Prompts
- [ ] New-friend instruction is directive, not aspirational
- [ ] Name quality instruction interpolates displayName with "Unknown" handling
- [ ] Priority guidance clarified: help first, then get to know them
- [ ] User confirms on both surfaces: bot helps first, introduces along the way, saves what it learns

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
- [x] Bug 2: Terminal errors too? **Yes.** safeSend to safeUpdate for all three: onToolEnd, onKick, terminal onError.
- [x] Bug 3: Priority vs warmth balance? **Help first, introduce along the way, save what you learn.**
- [x] Bug 3: displayName interpolation? **Yes.** With "Unknown" special case.
- [x] Bug 4: Pattern pruning scope? **Remove 6 patterns** that match conversational English. Keep narration-specific patterns.
- [x] Bug 5: Platform retries or kick loop? **Kick loop.** Session file confirms. Dedup deferred.
- [ ] Bug 1: Does Copilot Chat surface populate `activity.from.aadObjectId`? Gate 1 testing will confirm. Fix is the same regardless.

## Decisions Made
- Bug 1 is the top priority. The bot must know who the user is. Three-line fix with optional chaining handles both surfaces.
- Bug 2 is Copilot-surface-specific. `ctx.send()` in Copilot Chat produces separate messages that render out of order. Standard Teams in buffered mode does not exhibit this. Fix: safeSend to safeUpdate in buffered branch.
- Bug 4 pattern matching is surface-agnostic (core.ts). Visible symptoms are Copilot-specific via Bug 2. Remove 6 overbroad patterns, rewrite kick message.
- Bug 3 confirmed on both surfaces. System prompt instruction is aspirational, not directive.
- Bug 5 = Bug 4 + Bug 2. Bug 6 = Bug 4. Both resolve automatically.
- Gated structure: Gate 1 (Bug 1 + 2), Gate 2 (Bug 4), Gate 3 (Bug 3). User tests between gates.

## Context / References
- `src/senses/teams.ts:492-506` -- teamsContext missing AAD fields (Bug 1)
- `src/senses/teams.ts:458` -- activity destructured from ctx (Bug 1)
- `src/senses/teams.ts:298-305` -- TeamsMessageContext interface (Bug 1)
- `src/senses/teams.ts:344-350` -- resolver AAD fallback logic (Bug 1)
- `src/senses/teams.ts:59-252` -- createTeamsCallbacks (Bug 2)
- `src/senses/teams.ts:117-124` -- safeSend (Bug 2)
- `src/senses/teams.ts:104-113` -- safeUpdate (Bug 2 fix pattern)
- `src/senses/teams.ts:191-198` -- onToolEnd buffered branch (Bug 2)
- `src/senses/teams.ts:200-207` -- onKick buffered branch (Bug 2)
- `src/senses/teams.ts:209-219` -- onError buffered branch (Bug 2)
- `src/senses/teams.ts:508` -- ctxSend = ctx.send() (Bug 2)
- `src/mind/prompt.ts:144-206` -- contextSection (Bug 3)
- `src/mind/prompt.ts:181` -- name quality instruction (Bug 3)
- `src/mind/prompt.ts:193-194` -- new-friend instruction (Bug 3)
- `src/heart/kicks.ts:29` -- narration kick message self-trigger (Bug 4)
- `src/heart/kicks.ts:33-120` -- TOOL_INTENT_PATTERNS (Bug 4)
- `src/heart/core.ts:100` -- MAX_TOOL_ROUNDS = 10 (Bug 4/6)
- `src/heart/core.ts:328-348` -- kick detection loop (Bug 4)
- `src/__tests__/heart/kicks.test.ts:25` -- false-positive test expectation (Bug 4)
- `src/__tests__/senses/teams.test.ts` -- existing Teams tests
- `src/__tests__/mind/prompt.test.ts` -- existing prompt tests
- `src/wardrobe/format.ts` -- formatToolResult, formatKick, formatError

## Notes
**Patterns to remove (6):** `/\bi'll\b/i`, `/\bi will\b/i`, `/\bi can\b/i`, `/\bi should\b/i`, `/\bi'm \w+ing\b/i`, `/\bi am \w+ing\b/i`

**Patterns to keep:** `/\blet me\b/i`, `/\bi need to\b/i`, `/\bi'm going to\b/i`, `/\bgoing to\b/i`, all obligation/plural/temporal/sequential/gerund/movement/self-narration patterns, `/\bcontinues\b/i`, `/^continuing\b/im`, `/^next up\b/i`

**Deferred: Message deduplication via activity.id** -- hardening measure for future task.

**Deferred: Comprehensive kick system redesign** -- context-aware kick detection for future task.

## Progress Log
- 2026-03-03 20:09 Created (3 bugs)
- 2026-03-03 20:15 Rewrote with 6 bugs after second test findings
- 2026-03-03 20:25 Session-file-confirmed root causes, corrected Bug 5
- 2026-03-03 20:26 Added surface investigation note to Bug 1
- 2026-03-03 20:31 Restructured with gated fix groups
- 2026-03-03 20:34 Corrected scoping per-bug
- 2026-03-03 20:35 Bug 3 confirmed on both surfaces
- 2026-03-03 20:40 Correction pass: Bug 1 elevated to top priority, Bug 2 is Copilot-surface-specific (not buffered-mode), corrected test results table, tightened throughout
- 2026-03-03 20:43 Renamed Bug 2 from "phantom messages" to "out-of-order messages" -- messages are real, rendering out of order on Copilot surface
