# Planning: Context Kernel Post-Testing Fixes

**Status**: NEEDS_REVIEW
**Created**: 2026-03-03 20:09

## Goal
Fix six bugs discovered during live testing of the context kernel on Microsoft 365 Copilot Chat and standard 1:1 Teams. Bug 1 (bot doesn't know who the user is) is the most fundamental -- everything downstream depends on identity. Bug 4 (kick loop) is the most disruptive. Fixes are structured in three gated groups with manual user testing between each.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### Test Results Summary

Four configurations tested:

| Bug | Copilot + buffered | Copilot + streaming | Standard + buffered | Standard + streaming |
|-----|-------------------|-------------------|-------------------|---------------------|
| Bug 1: displayName "Unknown" | YES | Not verified | Not verified | Not verified |
| Bug 2: Out-of-order messages | YES | NO (correct order) | NO | NO |
| Bug 3: Cold first encounter | YES | Not verified | YES | Not verified |
| Bug 4: Kick loop | YES (4x identical response) | Not triggered | Not triggered | Not triggered |
| Bug 5: Response spam | YES (consequence of 4+2) | Not triggered | Not triggered | Not triggered |
| Bug 6: Platform timeout | YES (consequence of 4) | Not triggered | Not triggered | Not triggered |

Key facts:
- Bug 1 (AAD extraction): code bug is the same on all configurations. Whether `activity.from.aadObjectId` is populated may differ per surface -- Gate 1 testing will confirm.
- Bug 2 (out-of-order messages): requires BOTH Copilot Chat surface AND buffered mode (nostream). Copilot + streaming: messages arrive in correct order (slow over devtunnel but ordered). Standard Teams + buffered: clean. Standard Teams + streaming: clean. The issue is specifically how the Copilot Chat surface renders `ctx.send()` / `safeSend()` messages when buffered -- each creates a separate persistent message that appears out of order.
- Bug 3 (cold first encounter): surface-agnostic. Confirmed on both surfaces.
- Bug 4 (kick false positives): the pattern matching runs in `core.ts` (surface-agnostic), but the visible symptoms (kick messages appearing as separate messages) are specific to Copilot + buffered via Bug 2.

### Gated Fix Structure

**Gate 1: Bug 1 (AAD extraction) + Bug 2 (out-of-order messages)**
Bug 1 is the most fundamental fix -- the bot must know who the user is. Bug 2 is a mechanical three-line change. User tests after.

**Gate 2: Bug 4 (kick false positives + broken escape hatch)**
Eliminates the kick loop cascade: prune overbroad patterns AND fix the `final_answer` escape hatch. Also resolves Bug 5 (response spam) and Bug 6 (platform timeout). User tests after.

**Gate 3: Bug 3 (new-friend prompts + proactive saving)**
Prompt tuning: directive new-friend instruction and aggressive ephemerality instruction. User tests on both surfaces after.

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

**Bug 2: Out-of-order messages on Copilot Chat in buffered mode**

Requires the intersection of two conditions: Copilot Chat surface AND buffered mode (`disableStreaming=true`). Copilot Chat with streaming enabled delivers messages in correct order (confirmed via devtunnel -- slow but ordered). Standard Teams in buffered mode also works clean. The bug is specific to how the Copilot Chat surface renders separate `ctx.send()` messages when buffered.

In `createTeamsCallbacks` (`src/senses/teams.ts:59-252`), when `disableStreaming=true` (buffered mode):
- `onToolEnd` (line 194-195) calls `safeSend(msg)` -- sends tool result as separate bot message
- `onKick` (line 203-204) calls `safeSend(msg)` -- sends kick notification as separate bot message
- `onError` terminal branch (line 215-216) calls `safeSend(msg)` -- sends error as separate bot message

`safeSend` calls `sendMessage` (which is `ctx.send()` at line 508). On the Copilot Chat surface in buffered mode, each `ctx.send()` creates a separate persistent message that renders out of order -- tool results and kick notifications appear above the user's message or in the wrong sequence, and the actual response gets duplicated below. These are real messages showing up in the wrong place, not invisible artifacts.

Fix: change `safeSend(msg)` to `safeUpdate(msg)` for all three callbacks in the buffered branch. `safeUpdate` shows transient status text that doesn't persist as a separate message. This matches the pattern already used by `onToolStart` (line 188) and transient errors (line 213).

**Gate 1 checkpoint:** User tests on Copilot Chat. Expects: no out-of-order messages (tool results and kicks should not appear as separate messages), displayName populated (or confirmed that Copilot Chat doesn't provide `activity.from.name`, in which case the conversation-ID fallback is correct behavior).

---

#### GATE 2: Kick False Positives

**Bug 4: Kick loop from overbroad narration detection + toothless escape hatch**

Two distinct root causes create the spiral:

**(a) Overbroad patterns:** The model's legitimate final answer "I'll default to grid/table format when showing your ADO backlog from now on" triggers `/\bi'll\b/i` in `TOOL_INTENT_PATTERNS`. A perfectly good response gets kicked.

**(b) `final_answer` escape hatch is toothless:** Verified code paths:
- `core.ts:259-261`: when `lastKickReason === "narration"`, `final_answer` IS injected into `activeTools`. The model sees it on the next iteration. VERIFIED.
- `core.ts:288` (Azure path): `tool_choice = "required"` is only set when `options?.toolChoiceRequired` is true. This is NOT set after kicks. VERIFIED.
- `core.ts:303` (non-Azure path): same -- `tool_choice` only set for `options.toolChoiceRequired`. VERIFIED.
- `core.ts:346`: after a kick, `azureInput = null` forces a rebuild from messages. The model sees the full conversation including the kick-appended text. VERIFIED.

Result: `final_answer` is in the tool list, the kick message tells the model to use it, but `tool_choice` does not force it. The model responds with apologetic text instead of calling the tool. The screenshot shows the actual spiral:
- Kick 1: "I'll default to grid/table format..." -- kicked (`/\bi'll\b/i`)
- Model responds with text: "And I'll stop doing that stray internal note as well. Grid by default from here on out." -- kicked again
- Model responds with text: "Right. That internal leak is on me. Won't happen again. Preference saved. Grid by default." -- kicked again
- Each apology contains intent language ("I'll stop", "Won't happen") that triggers more kicks. The model never calls `final_answer`.

The pattern matching is in `core.ts` (surface-agnostic) -- it fires regardless of surface. The visible symptoms (kick messages as separate persistent messages) are specific to Copilot + buffered via Bug 2. On standard Teams in buffered mode the kicks still waste API round trips but don't show as separate messages.

**Fix (a): Prune overbroad patterns.** Six patterns to remove (match normal conversational English):
- `/\bi'll\b/i` -- "I'll show your backlog"
- `/\bi will\b/i` -- same
- `/\bi can\b/i` -- "I can help with that"; also self-triggers in kick message
- `/\bi should\b/i` -- "I should mention"
- `/\bi'm \w+ing\b/i` -- matches "I'm glad", "I'm happy", "I'm sorry"
- `/\bi am \w+ing\b/i` -- same

**Fix (b): Force `final_answer` after consecutive kicks.** After `kickCount >= 2`, set `tool_choice = { type: "function", function: { name: "final_answer" } }` at `core.ts:288` (Azure) and `core.ts:303` (non-Azure). Small change -- add a condition alongside the existing `options?.toolChoiceRequired` check. Repeated kicks make zero sense -- the system must recover, not spiral.

Also rewrite the kick message: must not match any remaining pattern AND must clearly direct the model to call `final_answer`. Verify with unit test.

Update existing tests: `kicks.test.ts:25` expects "I can help with that" -> true. Must be updated. Add regression tests with conversational responses that must NOT trigger kicks. Add tests for forced `tool_choice` after consecutive kicks.

**Bug 5: Response spam** -- consequence of Bug 4 (kick loop) + Bug 2 (out-of-order messages on Copilot). Resolves when both are fixed.

**Bug 6: Platform timeout** -- consequence of Bug 4 (10 API round trips). Resolves when Bug 4 is fixed.

**Gate 2 checkpoint:** User tests on Copilot Chat with a tool-using request (e.g., "show me my backlog"). Expects: no kick loop, no response spam, no timeout.

---

#### GATE 3: New-Friend Prompts

**Bug 3: Cold first encounter + no proactive saving -- confirmed on both surfaces**

Two related symptoms:

**(a) Cold first encounter:** Bot doesn't introduce itself or learn the user's name.
- Copilot Chat: user sent "hi, can you show me my backlog?" -- bot showed backlog, no introduction, didn't learn name, didn't call `save_friend_note`
- Standard Teams: user sent "hi pal" -- bot responded "hello. what are we sorting today?" -- cold, transactional, no warmth

**(b) No proactive preference saving:** Bot doesn't call `save_friend_note` on its own when it learns something about the user. For example, if the user says "always show this in a grid," the bot should immediately save that as a tool preference without needing to be told "save that." The bot only saves when explicitly prompted. Principle: better to save too much than too little.

Surface-agnostic. Two prompt instructions are too passive:

1. New-friend instruction at `prompt.ts:193-194`:
```
this is a new friend -- i have no notes or preferences saved yet. i should learn their name and how they like to work, and save what i learn.
```
"i should learn" is aspirational, not directive. The model treats it as optional. The priority guidance ("my friend's request comes first") compounds this -- the model reads it as "only the request matters."

2. Ephemerality instruction at `prompt.ts:184`:
```
my conversation memory is ephemeral -- it resets between sessions. to remember something important about my friend, i use save_friend_note to write it to disk for future me.
```
"something important" lets the model decide what matters -- and it decides almost nothing is. The bar needs to be: "would future me want to know this?" and the answer should almost always be yes.

Five changes:
1. Aspirational to directive (new-friend): "after addressing their request, i introduce myself briefly and ask what they prefer to be called. i save what i learn with save_friend_note."
2. Interpolate displayName: "the name i have for this friend is {displayName}." When "Unknown": "i don't know this friend's name yet -- i ask what they'd like to be called and save it."
3. Clarify priority vs warmth: "help first, then get to know them" not "help only."
4. Aggressive ephemerality instruction: "when i learn ANYTHING about my friend -- name, preferences, how they like things displayed, their role, projects, working style -- i save it immediately with save_friend_note. better to save too much than too little. if the session ends, anything i didn't save is gone forever."
5. Covers both explicit preferences ("show me grids", "always use tables") and implicit ones (they seem to prefer concise responses, they work on a specific project, etc.). The bar is "would future me want to know this?" not "is this important enough?"

**Gate 3 checkpoint:** User tests on both Copilot Chat and standard Teams with fresh friend records. Expects: bot helps first, introduces itself along the way, asks what they prefer to be called, proactively calls `save_friend_note` when learning anything about the user (name, preferences, working style) without needing to be asked.

---

### Out of Scope
- Streaming mode changes (Bug 2 is specific to Copilot + buffered; Copilot + streaming delivers in correct order)
- Comprehensive kick system redesign (fix immediate false positives + escape hatch; broader context-aware redesign deferred)
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

### Gate 2: Kick False Positives + Escape Hatch
- [ ] 6 overbroad patterns removed from `TOOL_INTENT_PATTERNS`
- [ ] Kick message does not self-trigger `hasToolIntent()` -- verified by unit test
- [ ] Conversational responses do not trigger kicks -- verified by regression tests
- [ ] Existing test expectations updated
- [ ] After N consecutive kicks, `tool_choice` forces `final_answer` -- verified by unit test
- [ ] Kick message rewritten to explicitly direct model to call `final_answer`
- [ ] User confirms on Copilot Chat: no kick loop, no response spam, no timeout

### Gate 3: New-Friend Prompts + Proactive Saving
- [ ] New-friend instruction is directive, not aspirational
- [ ] Name quality instruction interpolates displayName with "Unknown" handling
- [ ] Priority guidance clarified: help first, then get to know them
- [ ] Ephemerality instruction rewritten: aggressive save-anything bar, not "something important"
- [ ] Covers explicit preferences ("show me grids") and implicit ones (working style, projects)
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

## Open Questions
- [x] Bug 2: Terminal errors too? **Yes.** safeSend to safeUpdate for all three: onToolEnd, onKick, terminal onError.
- [x] Bug 3: Priority vs warmth balance? **Help first, introduce along the way, save what you learn.**
- [x] Bug 3: displayName interpolation? **Yes.** With "Unknown" special case.
- [x] Bug 4: Pattern pruning scope? **Remove 6 patterns** that match conversational English. Keep narration-specific patterns.
- [x] Bug 5: Platform retries or kick loop? **Kick loop.** Session file confirms. Dedup deferred.
- [ ] Bug 1: Does Copilot Chat surface populate `activity.from.aadObjectId`? Gate 1 testing will confirm. Fix is the same regardless.

## Decisions Made
- Bug 1 is the top priority. The bot must know who the user is. Three-line fix with optional chaining handles both surfaces.
- Bug 2 requires both Copilot Chat surface AND buffered mode. Copilot + streaming delivers in correct order. Standard Teams + buffered works clean. Fix: safeSend to safeUpdate in buffered branch.
- Bug 4 has two verified root causes: (a) 6 overbroad patterns match normal English, (b) `final_answer` escape hatch is toothless -- tool is injected into `activeTools` (core.ts:259-261) but `tool_choice` is never forced after kicks (core.ts:288/303 only check `options.toolChoiceRequired`). Fix both: prune patterns AND set `tool_choice` to force `final_answer` after `kickCount >= 2`.
- Bug 4 pattern matching is surface-agnostic (core.ts). Visible symptoms are specific to Copilot + buffered via Bug 2.
- Bug 3 confirmed on both surfaces. Two issues: new-friend instruction is aspirational not directive, and ephemerality instruction uses "something important" which lets model skip saving. Fix both: directive new-friend behavior + aggressive save-anything bar.
- Bug 5 = Bug 4 + Bug 2. Bug 6 = Bug 4. Both resolve automatically.
- Gated structure: Gate 1 (Bug 1 + 2), Gate 2 (Bug 4), Gate 3 (Bug 3). User tests between gates.

## Context / References

### Fix Sites (for work-doer)

**Bug 1 -- `src/senses/teams.ts:492-506`:**
- Add `aadObjectId: activity.from?.aadObjectId` to teamsContext object literal
- Add `tenantId: activity.conversation?.tenantId` to teamsContext object literal
- Add `displayName: activity.from?.name` to teamsContext object literal
- `activity` is available at line 458: `const { stream, activity, api, signin } = ctx`

**Bug 2 -- `src/senses/teams.ts` buffered branch in `createTeamsCallbacks`:**
- Line 194-195: `onToolEnd` -- change `safeSend(msg)` to `safeUpdate(msg)`
- Line 203-204: `onKick` -- change `safeSend(msg)` to `safeUpdate(msg)`
- Line 209+: `onError` terminal -- change `safeSend(msg)` to `safeUpdate(msg)`
- Reference pattern: `onToolStart` (line 188) already uses `safeUpdate`

**Bug 3 -- `src/mind/prompt.ts`:**
- Line 178: priority guidance -- rewrite to clarify "help first, then get to know them"
- Line 181: name quality instruction -- rewrite with displayName interpolation
- Line 184: ephemerality instruction -- rewrite from "something important" to aggressive save-anything bar
- Line 193-194: new-friend instruction -- rewrite from aspirational to directive

**Bug 4a -- `src/heart/kicks.ts`:**
- Line 36: remove `/\bi'll\b/i`
- Line 37: remove `/\bi will\b/i`
- Line 47: remove `/\bi'm \w+ing\b/i`
- Line 48: remove `/\bi am \w+ing\b/i`
- Line 52: remove `/\bi should\b/i`
- Line 53: remove `/\bi can\b/i`
- Line 29: rewrite kick message -- must not contain "I can" (self-trigger), must explicitly direct model to call `final_answer`

**Bug 4b -- `src/heart/core.ts`:**
- Line 288 (Azure path): after `kickCount >= 2`, set `tool_choice = { type: "function", function: { name: "final_answer" } }`
- Line 303 (non-Azure path): same
- Line 259-261: `final_answer` injected into `activeTools` when `lastKickReason === "narration"` (existing, works correctly)
- Line 328-348: kick detection loop (existing, `kickCount` already tracked at line 331)
- Line 346: `azureInput = null` forces rebuild from messages after kick (existing, works correctly)

### Supporting References

- `src/senses/teams.ts:298-305` -- TeamsMessageContext interface (declares aadObjectId?, tenantId?, displayName?)
- `src/senses/teams.ts:344-350` -- resolver AAD fallback logic
- `src/senses/teams.ts:104-113` -- safeUpdate implementation (Bug 2 fix pattern)
- `src/senses/teams.ts:117-124` -- safeSend implementation (Bug 2 current behavior)
- `src/senses/teams.ts:508` -- ctxSend = ctx.send()
- `src/mind/prompt.ts:144-206` -- contextSection function
- `src/heart/kicks.ts:33-120` -- full TOOL_INTENT_PATTERNS array
- `src/heart/core.ts:100` -- MAX_TOOL_ROUNDS = 10
- `src/__tests__/heart/kicks.test.ts:25` -- false-positive test expectation ("I can help with that" -> true, must update)
- `src/__tests__/senses/teams.test.ts` -- existing Teams tests
- `src/__tests__/mind/prompt.test.ts` -- existing prompt tests
- `src/wardrobe/format.ts` -- formatToolResult, formatKick, formatError

## Notes

### Cross-Cutting Themes (for work-doer context)

**Theme 1: "Defined but never wired"**
- Bug 1: `TeamsMessageContext` interface defines `aadObjectId`, `tenantId`, `displayName` (teams.ts:303-305) but line 492 never sets them from the activity
- Bug 4b: `final_answer` injected into tool list (core.ts:259) but `tool_choice` never forces it (core.ts:288/303 only check `toolChoiceRequired`)
- Pattern: escape hatches and data paths exist architecturally but aren't connected at the call site

**Theme 2: "Works in streaming, breaks in buffered on Copilot"**
- Bug 2: `onToolEnd` (teams.ts:194-195) and `onKick` (teams.ts:203-204) use `safeSend(msg)` in buffered mode -- creates separate new messages. Streaming uses `safeEmit("\n\n" + msg + "\n\n")` which appends inline.
- `onError` terminal case (teams.ts:209+) also uses `safeSend` in buffered mode
- Streaming is self-healing (everything in one stream). Buffered creates discrete messages that Copilot Chat renders out of order.

**Theme 3: "Aspirational instructions the model ignores"**
- prompt.ts:181: "i prefer to use whatever name my friend prefers" -- vague, no action
- prompt.ts:184: "to remember something important about my friend" -- model decides nothing is important enough
- prompt.ts:194: "i should learn their name and how they like to work" -- aspirational, not directive
- kicks.ts:29: "Calling the tool now -- if I've already finished, I can use final_answer" -- suggests but doesn't compel

**Theme 4: "Patterns that match normal English"**
- kicks.ts:36: `/\bi'll\b/i` -- "I'll show your backlog"
- kicks.ts:37: `/\bi will\b/i` -- "I will default to grid"
- kicks.ts:47: `/\bi'm \w+ing\b/i` -- "I'm glad", "I'm happy", "I'm sorry"
- kicks.ts:48: `/\bi am \w+ing\b/i` -- same
- kicks.ts:52: `/\bi should\b/i` -- "I should mention"
- kicks.ts:53: `/\bi can\b/i` -- "I can help" AND self-triggers from kick message itself (line 29: "I can use final_answer")

### Quick Reference

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
- 2026-03-03 20:45 Set status to NEEDS_REVIEW
- 2026-03-03 20:50 Bug 2 scoping: requires Copilot Chat + buffered mode intersection (Copilot + streaming confirmed working, standard + buffered confirmed working)
- 2026-03-03 20:51 Bug 3 expanded: added proactive saving (bot doesn't call save_friend_note on its own), aggressive ephemerality instruction ("save anything" not "something important"), 5 changes now instead of 3
- 2026-03-03 20:55 Bug 4 expanded: two root causes -- (a) overbroad patterns, (b) final_answer escape hatch available but not forced. Fix both: prune patterns AND force tool_choice after N consecutive kicks
- 2026-03-03 20:56 Bug 4 tightened: all code paths verified with line numbers (core.ts:259-261, 288, 303, 346), removed speculative language, concrete fix location identified
