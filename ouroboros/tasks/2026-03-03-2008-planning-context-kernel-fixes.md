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
- Bug 2 (out-of-order messages): requires BOTH Copilot Chat surface AND buffered mode (nostream). Root cause: `safeSend` is fire-and-forget -- `catchAsync` (teams.ts:86-90) attaches `.catch()` but never awaits, so multiple `ctx.send()` HTTP requests race. Standard Teams serializes incoming bot messages server-side; Copilot Chat does not. Streaming is unaffected because `safeEmit`/`safeUpdate` go through the Teams SDK streaming protocol which handles ordering internally.
- Bug 3 (cold first encounter): surface-agnostic. Confirmed on both surfaces.
- Bug 4 (kick loop): the kick patterns are intentionally broad (they give the model another chance to call tools). The bug is that the `final_answer` escape hatch is never forced via `tool_choice`, so a model that has genuinely finished can't cleanly exit. Plus the kick message self-triggers via "I can" matching `/\bi can\b/i`. Visible symptoms (kick messages as separate messages) are specific to Copilot + buffered via Bug 2.

### Gated Fix Structure

**Gate 1: Bug 1 (AAD extraction) + Bug 2 (out-of-order messages)**
Bug 1 is the most fundamental fix -- the bot must know who the user is. Bug 2 fix: serialize `safeSend` via promise chain so concurrent `ctx.send()` calls don't race. User tests after.

**Gate 2: Bug 4 (kick escape hatch + self-trigger)**
Force `tool_choice = "required"` after any kick (add `|| lastKickReason` to two conditions) and fix kick message self-trigger. Three small changes. Patterns stay as-is. Also resolves Bug 5 (response spam) and Bug 6 (platform timeout). User tests after.

**Gate 3: Bug 3 (friend context instructions)**
Prompt tuning: rewrite ~4 lines in `contextSection()` to be directive with displayName interpolation and aggressive saving. User tests on both surfaces after.

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

Requires the intersection of two conditions: Copilot Chat surface AND buffered mode (`disableStreaming=true`). Copilot Chat with streaming enabled delivers messages in correct order (confirmed via devtunnel). Standard Teams in buffered mode also works clean.

**Root cause: `safeSend` is fire-and-forget. Multiple `ctx.send()` calls race.**

`safeSend` (`teams.ts:117-124`) calls `sendMessage(text)` which returns a Promise. But `catchAsync` (`teams.ts:86-90`) only attaches a `.catch()` handler -- it never awaits the result. So when `onToolEnd`, `onKick`, and `flushTextBuffer` all call `safeSend` in quick succession, multiple `ctx.send()` HTTP POST requests fire concurrently and arrive in arbitrary order.

The three send functions and why only `safeSend` has this problem:
- `safeEmit(text)` = `stream.emit(text)` -- goes through Teams SDK streaming protocol, which handles ordering internally
- `safeUpdate(text)` = `stream.update(text)` -- same streaming protocol, ordering handled
- `safeSend(text)` = `ctx.send(text)` -- raw HTTP POST to Bot Framework, bypasses the stream entirely. No ordering guarantee.

**Why it works in standard Teams but not Copilot Chat:** `ctx.send()` is a raw HTTP POST to the Bot Framework. Standard Teams likely serializes incoming bot messages per-conversation server-side. Copilot Chat surface does not -- messages render in whatever order the HTTP requests complete.

Note: `safeSend` was intentional design for buffered mode (`teams.ts:52-58` comments). The design is correct -- the bug is that concurrent sends aren't serialized.

**Fix: serialize `safeSend` via promise chain.** Each send waits for the previous one to complete:
```typescript
let sendChain = Promise.resolve()
function safeSend(text: string): void {
  if (stopped || !sendMessage) return
  sendChain = sendChain.then(() => sendMessage(text)).catch(() => markStopped())
}
```
Small change to `safeSend` only. No changes to call sites (`onToolEnd`, `onKick`, `onError`, `flushTextBuffer`). No changes to `safeEmit` or `safeUpdate` (they use the streaming protocol which already handles ordering).

**Gate 1 checkpoint:** User tests on Copilot Chat. Expects: messages arrive in correct order (tool results, kicks, and final response in proper sequence), displayName populated (or confirmed that Copilot Chat doesn't provide `activity.from.name`, in which case the conversation-ID fallback is correct behavior).

---

#### GATE 2: Kick Escape Hatch + Self-Trigger

**Bug 4: Kick loop from missing `tool_choice` forcing + self-triggering kick message**

**The kick patterns are intentionally broad and correct.** The kick mechanism gives the model another chance to call tools. If the model says "I'll show your backlog" without calling a tool, the kick forces it to reconsider and actually call the tool. Without the kick, that narration would be the final response and the user never gets their backlog. The patterns are intentionally aggressive to overcorrect. All patterns stay as-is.

**Root cause:** After a kick, `final_answer` is added to the tool list (`core.ts:259-261`) but `tool_choice` is NOT set to `"required"`. The conditions at `core.ts:288` (Azure) and `core.ts:303` (non-Azure) only check `options?.toolChoiceRequired`, not `lastKickReason`. So the model can respond with text-only, which gets kicked again, creating the loop.

In CLI before `final_answer` existed, the model WAS forced to call a tool after a kick (it would call `get_current_time` as a no-op). Same forcing is needed here.

The screenshot shows the spiral:
- Kick 1: "I'll default to grid/table format..." -- kicked (model narrated, `final_answer` added to tools but not forced)
- Model responds with text: "And I'll stop doing that stray internal note as well." -- kicked again (still not forced to call a tool)
- Model responds with text: "Right. That internal leak is on me. Won't happen again." -- kicked again (continues until MAX_TOOL_ROUNDS)

**Additional issue: kick message self-triggers.** The narration kick message at `kicks.ts:29`:
```
I narrated instead of acting. Calling the tool now -- if I've already finished, I can use final_answer.
```
Contains "I can" which matches `/\bi can\b/i` in `TOOL_INTENT_PATTERNS`. The kick message itself guarantees the next text response will also be kicked.

The pattern matching is in `core.ts` (surface-agnostic). The visible symptoms (kick messages as separate persistent messages) are specific to Copilot + buffered via Bug 2.

**Three changes:**

1. **`core.ts:288`** (Azure path): change `if (options?.toolChoiceRequired)` to `if (options?.toolChoiceRequired || lastKickReason)`. One condition added.

2. **`core.ts:303`** (non-Azure path): same change. One condition added.

3. **`kicks.ts:29`**: rewrite kick message to not contain "I can" or any phrase matching `TOOL_INTENT_PATTERNS`. Example: "I narrated instead of acting. Using the tool now -- if done, calling final_answer."

**No pattern changes.** All existing `TOOL_INTENT_PATTERNS` stay as-is. All existing kick test expectations stay as-is. Add new tests for: `tool_choice = "required"` when `lastKickReason` is truthy, and kick message not self-triggering `hasToolIntent()`.

**Bug 5: Response spam** -- consequence of Bug 4 (kick loop) + Bug 2 (out-of-order messages on Copilot). Resolves when both are fixed.

**Bug 6: Platform timeout** -- consequence of Bug 4 (10 API round trips). Resolves when Bug 4 is fixed.

**Gate 2 checkpoint:** User tests on Copilot Chat with a tool-using request (e.g., "show me my backlog"). Expects: no kick loop, no response spam, no timeout.

---

#### GATE 3: New-Friend Prompts

**Bug 3: Passive friend context instructions -- confirmed on both surfaces**

The friend context instructions in `contextSection()` (`prompt.ts:178-194`) are aspirational, not directive. The model treats them as optional. Observed on both surfaces:
- Copilot Chat: user sent "hi, can you show me my backlog?" -- bot showed backlog, no introduction, didn't learn name, didn't call `save_friend_note`
- Standard Teams: user sent "hi pal" -- bot responded "hello. what are we sorting today?" -- cold, transactional, no warmth
- Neither surface: bot proactively saves preferences when it learns them (e.g., "always show this in a grid" should trigger `save_friend_note` without being asked)

**Fix: rewrite ~4 lines of prompt text in `contextSection()` at `prompt.ts:178, 181, 184, 193-194`.** The rewritten instructions should:
- Interpolate displayName with "Unknown" handling ("i don't know this friend's name yet -- i ask what they'd like to be called")
- Push aggressive saving of anything learned -- name, preferences, display format, role, projects, working style. Better to save too much than too little. Bar is "would future me want to know this?" not "is this important enough?"
- Be directive, not aspirational -- "i save it immediately with save_friend_note" not "i should learn"
- Clarify that priority guidance means "help first AND get to know them" not "help only"

This is prompt tuning. The code structure of `contextSection()` doesn't change -- just the instruction strings.

**Gate 3 checkpoint:** User tests on both Copilot Chat and standard Teams with fresh friend records. Expects: bot helps first, introduces itself along the way, proactively calls `save_friend_note` when learning anything about the user without being asked.

---

### Out of Scope
- Streaming mode changes (Bug 2 is `safeSend` serialization only; streaming uses SDK protocol which handles ordering)
- Kick pattern changes (patterns are intentionally broad; broader context-aware redesign deferred)
- Changes to `save_friend_note` tool behavior (tool works correctly)
- Changes to `FriendResolver` or `FriendStore` (work correctly given correct inputs)
- Message deduplication via `activity.id` (deferred hardening)

## Completion Criteria

### Gate 1: Identity + Out-of-Order Messages
- [ ] `teamsContext` populates `aadObjectId`, `tenantId`, and `displayName` from `activity`
- [ ] Friend record has real display name when AAD name is available
- [ ] Conversation-ID fallback works when AAD fields are absent
- [ ] `safeSend` serialized via promise chain -- concurrent `ctx.send()` calls no longer race
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

## Open Questions
- [x] Bug 2: Terminal errors too? **Yes.** All callbacks using `safeSend` are affected (onToolEnd, onKick, terminal onError, flushTextBuffer).
- [x] Bug 2: Which fix approach? **Serialize `safeSend` via promise chain.** Root cause is fire-and-forget concurrent sends, not wrong function choice. No changes to call sites needed.
- [x] Bug 3: Priority vs warmth balance? **Help first, introduce along the way, save what you learn.**
- [x] Bug 3: displayName interpolation? **Yes.** With "Unknown" special case.
- [x] Bug 4: Pattern pruning scope? **No pattern removals.** Patterns are intentionally broad -- they give the model another chance to call tools. The bug is the toothless escape hatch, not the patterns.
- [x] Bug 5: Platform retries or kick loop? **Kick loop.** Session file confirms. Dedup deferred.
- [ ] Bug 1: Does Copilot Chat surface populate `activity.from.aadObjectId`? Gate 1 testing will confirm. Fix is the same regardless.

## Decisions Made
- Bug 1 is the top priority. The bot must know who the user is. Three-line fix with optional chaining handles both surfaces.
- Bug 2 requires both Copilot Chat surface AND buffered mode. Root cause: `safeSend` is fire-and-forget (`catchAsync` attaches `.catch()` but never awaits). Multiple `ctx.send()` HTTP requests race. Standard Teams serializes server-side; Copilot Chat does not. Fix: serialize `safeSend` via promise chain. Small change to `safeSend` only, no call-site changes needed.
- Bug 4: kick patterns are intentionally broad and stay as-is. Root cause: after any kick, `tool_choice` is not set to `"required"` (core.ts:288/303 only check `options.toolChoiceRequired`). Fix: add `|| lastKickReason` to both conditions. Plus kick message self-triggers via "I can" -- rewrite to avoid. Three small changes total.
- Bug 4 pattern matching is surface-agnostic (core.ts). Visible symptoms are specific to Copilot + buffered via Bug 2.
- Bug 3 confirmed on both surfaces. Friend context instructions at prompt.ts:178-194 are aspirational not directive. Fix: rewrite ~4 lines of prompt text to be directive with displayName interpolation and aggressive saving.
- Bug 5 = Bug 4 + Bug 2. Bug 6 = Bug 4. Both resolve automatically.
- Gated structure: Gate 1 (Bug 1 + 2), Gate 2 (Bug 4), Gate 3 (Bug 3). User tests between gates.

## Context / References

### Fix Sites (for work-doer)

**Bug 1 -- `src/senses/teams.ts:492-506`:**
- Add `aadObjectId: activity.from?.aadObjectId` to teamsContext object literal
- Add `tenantId: activity.conversation?.tenantId` to teamsContext object literal
- Add `displayName: activity.from?.name` to teamsContext object literal
- `activity` is available at line 458: `const { stream, activity, api, signin } = ctx`

**Bug 2 -- `src/senses/teams.ts:117-124` (`safeSend`):**
- Replace fire-and-forget `catchAsync(sendMessage(text))` with promise chain serialization
- Add `let sendChain = Promise.resolve()` before `safeSend` definition
- Change body to: `sendChain = sendChain.then(() => sendMessage(text)).catch(() => markStopped())`
- No changes to call sites (`onToolEnd` line 194-195, `onKick` line 203-204, `onError` line 209+, `flushTextBuffer` line 128+)
- `catchAsync` (line 86-90) is the root cause -- attaches `.catch()` but never awaits

**Bug 3 -- `src/mind/prompt.ts:178-194` (prompt tuning):**
- Rewrite ~4 lines of friend context instructions in `contextSection()` to be directive with displayName interpolation and aggressive saving
- Lines: 178 (priority guidance), 181 (name quality), 184 (ephemerality), 193-194 (new-friend instruction)
- Code structure of `contextSection()` doesn't change -- just the instruction strings

**Bug 4 -- three changes:**
1. `src/heart/core.ts:288` (Azure path): change `if (options?.toolChoiceRequired)` to `if (options?.toolChoiceRequired || lastKickReason)`. One condition added.
2. `src/heart/core.ts:303` (non-Azure path): same change. One condition added.
3. `src/heart/kicks.ts:29`: rewrite kick message to not contain "I can" or any phrase matching `TOOL_INTENT_PATTERNS`. Example: "I narrated instead of acting. Using the tool now -- if done, calling final_answer."
- All patterns in `TOOL_INTENT_PATTERNS` (lines 33-120) stay as-is -- no removals
- `core.ts:259-261`: `final_answer` already injected into `activeTools` when `lastKickReason === "narration"` (existing, not changed)

### Supporting References

- `src/senses/teams.ts:52-58` -- code comments documenting intentional dual-mode design
- `src/senses/teams.ts:86-90` -- `catchAsync`: attaches `.catch()` but never awaits (Bug 2 root cause)
- `src/senses/teams.ts:117-124` -- `safeSend`: fire-and-forget via `catchAsync` (Bug 2 fix site)
- `src/senses/teams.ts:128+` -- `flushTextBuffer`: also calls `safeSend` (affected by Bug 2)
- `src/senses/teams.ts:298-305` -- TeamsMessageContext interface (declares aadObjectId?, tenantId?, displayName?)
- `src/senses/teams.ts:344-350` -- resolver AAD fallback logic
- `src/senses/teams.ts:104-113` -- safeUpdate implementation (`stream.update()` -- uses streaming protocol, not affected)
- `src/senses/teams.ts:508` -- ctxSend = ctx.send()
- `src/mind/prompt.ts:144-206` -- contextSection function
- `src/heart/kicks.ts:33-120` -- full TOOL_INTENT_PATTERNS array
- `src/heart/core.ts:100` -- MAX_TOOL_ROUNDS = 10
- `src/__tests__/heart/kicks.test.ts` -- existing kick tests (all expectations stay as-is; add new tests for forced final_answer and kick message self-trigger)
- `src/__tests__/senses/teams.test.ts` -- existing Teams tests
- `src/__tests__/mind/prompt.test.ts` -- existing prompt tests
- `src/wardrobe/format.ts` -- formatToolResult, formatKick, formatError

## Notes

### Cross-Cutting Themes (for work-doer context)

**Theme 1: "Defined but never wired"**
- Bug 1: `TeamsMessageContext` interface defines `aadObjectId`, `tenantId`, `displayName` (teams.ts:303-305) but line 492 never sets them from the activity
- Bug 4: `final_answer` injected into tool list (core.ts:259) but `tool_choice` not set to `"required"` (core.ts:288/303 only check `toolChoiceRequired`, not `lastKickReason`). Fix: add `|| lastKickReason`. Plus kick message (kicks.ts:29) contains "I can" which self-triggers `/\bi can\b/i`
- Pattern: escape hatches and data paths exist architecturally but the conditions aren't wired at the call site

**Theme 2: "Fire-and-forget sends race on Copilot"**
- Bug 2: `safeSend` (teams.ts:117-124) calls `sendMessage` via `catchAsync` which attaches `.catch()` but never awaits. Multiple `ctx.send()` HTTP POSTs fire concurrently and arrive in arbitrary order.
- `safeEmit` and `safeUpdate` go through Teams SDK streaming protocol which handles ordering internally. `safeSend` bypasses the stream -- raw HTTP to Bot Framework.
- Standard Teams serializes bot messages per-conversation server-side. Copilot Chat does not.
- `safeSend` was intentional design (teams.ts:52-58) -- the design is correct, the serialization is missing.

**Theme 3: "Aspirational instructions the model ignores"**
- prompt.ts:181: "i prefer to use whatever name my friend prefers" -- vague, no action
- prompt.ts:184: "to remember something important about my friend" -- model decides nothing is important enough
- prompt.ts:194: "i should learn their name and how they like to work" -- aspirational, not directive
- kicks.ts:29: "Calling the tool now -- if I've already finished, I can use final_answer" -- suggests but doesn't compel

**Theme 4: "Intentionally aggressive patterns need a working exit"**
- Kick patterns are broad by design -- they give the model another chance to call tools instead of narrating
- The problem is not that kicks fire too often, but that the model has no forced exit once it has genuinely finished
- In CLI before `final_answer`, the model was forced to call a tool (used `get_current_time` as no-op). Same forcing needed here.
- Self-trigger in kick message (kicks.ts:29: "I can use final_answer" matches `/\bi can\b/i`) makes the loop worse

### Quick Reference

**Kick patterns:** ALL stay as-is. No removals.

**Kick message self-trigger:** kicks.ts:29 contains "I can" matching `/\bi can\b/i`. Rewrite to avoid.

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
- 2026-03-03 21:02 Added cross-cutting themes (4 themes for work-doer context) and restructured Context/References into fix-site references per bug + supporting references
- 2026-03-03 21:09 Bug 2 corrected: safeSend was intentional design (teams.ts:52-58 comments), not an accident. Removed "3-line fix" claim. Added 3 fix options (A/B/C), marked as needing Gate 1 testing. Added open question for fix approach.
- 2026-03-03 21:12 Bug 2 root cause found: safeSend is fire-and-forget (catchAsync attaches .catch() but never awaits). Multiple ctx.send() race. Fix: serialize via promise chain. Removed options A/B/C, resolved open question.
- 2026-03-03 21:19 Bug 4 reframed: patterns are intentionally aggressive, stay as-is. Root cause is missing tool_choice forcing after kick. Three small changes total. Removed all pattern removal references and kickCount >= 2 logic.
- 2026-03-03 21:42 Bug 4 simplified: check `lastKickReason` (truthy) not `=== "narration"`. After ANY kick, force tool_choice. Even simpler condition.
- 2026-03-03 21:49 Bug 3 simplified: prompt tuning of ~4 lines in contextSection(), not five separate changes. Reframed as single rewrite task.
