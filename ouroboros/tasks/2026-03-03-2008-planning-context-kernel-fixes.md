# Planning: Context Kernel Post-Testing Fixes

**Status**: drafting
**Created**: [pending git timestamp]

## Goal
Fix three bugs discovered during live testing of the context kernel on Microsoft 365 Copilot Chat (nostream mode): AAD displayName never extracted from Teams activity, tool-result and kick messages leaking as separate bot messages to the user in buffered mode, and new-friend behavior not triggering (no introduction, no save_friend_note call).

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
- `onToolEnd` (line 194-195) calls `safeSend(msg)` which sends `formatToolResult()` output as a separate bot message
- `onKick` (line 203-204) calls `safeSend(msg)` which sends `formatKick()` output as a separate bot message

These appear to the user as phantom messages like "checkmark ado_backlog_list" and "recycle kick" before the actual response. In streaming mode, these are inline in the stream and get overwritten by final content. But in buffered mode, `safeSend` calls `sendMessage` which sends a wholly new message in the conversation.

Fix: in buffered mode, tool results and kicks should be shown as status updates (`safeUpdate`) instead of separate messages (`safeSend`). Status updates are transient -- they show briefly during processing but don't persist as separate messages in the conversation. This matches the UX pattern already used for `onToolStart` (line 188: `safeUpdate(...)`) and transient errors (line 213: `safeUpdate(msg)`).

Specifically:
- `onToolEnd` buffered branch (line 194-195): change `safeSend(msg)` to `safeUpdate(msg)`
- `onKick` buffered branch (line 203-204): change `safeSend(msg)` to `safeUpdate(msg)`
- Terminal errors in buffered mode (line 215-216) should also change from `safeSend(msg)` to `safeUpdate(msg)` -- terminal errors currently leak as separate messages too

**Bug 3: New-friend behavior not triggering -- prompt instruction insufficient**

The new-friend instruction at `src/mind/prompt.ts:193-194` exists and is correctly conditional on `isNewFriend`. However, during live testing, the model did not exhibit new-friend behavior: no warm introduction, no attempt to learn the user's name, no `save_friend_note` call. The priority guidance ("my friend's request comes first") likely dominated.

This is a prompt tuning issue, not a code bug. The new-friend instruction needs to be stronger and more specific about what to do, while still respecting priority guidance. The current instruction:
```
this is a new friend -- i have no notes or preferences saved yet. i should learn their name and how they like to work, and save what i learn.
```

Needs to more explicitly instruct the model to:
1. Briefly introduce itself (one sentence, not a wall of text)
2. Address the friend's request immediately (respects priority guidance)
3. After addressing the request, weave in a natural question about what the friend prefers to be called
4. Use `save_friend_note` to save what it learns during the conversation

Also, the name quality instruction at line 181 is generic and doesn't mention the actual displayName. The planning doc for context-kernel-bugs specified it should say "The name I have remembered for this friend is {displayName}." -- this was not implemented. When the displayName is "Unknown" (due to Bug 1), this instruction should be even more explicit about asking for the friend's name.

### Out of Scope
- Changes to `save_friend_note` tool behavior (tool works correctly, model just isn't calling it)
- Changes to the `FriendResolver` or `FriendStore` (these work correctly given correct inputs)
- New context kernel features
- Streaming mode changes (streaming mode works correctly for tool results)

## Completion Criteria
- [ ] `teamsContext` object populates `aadObjectId`, `tenantId`, and `displayName` from `activity`
- [ ] Friend record created via Teams has the user's real display name (not "Unknown") when AAD name is available
- [ ] Tool-result messages ("checkmark tool_name") do not appear as separate bot messages in buffered mode
- [ ] Kick messages ("recycle kick") do not appear as separate bot messages in buffered mode
- [ ] Terminal error messages do not appear as separate bot messages in buffered mode
- [ ] Status updates (safeUpdate) are used for tool results, kicks, and terminal errors in buffered mode
- [ ] New-friend system prompt instruction is more specific about introducing itself and asking for the friend's name
- [ ] Name quality instruction includes the actual displayName value
- [ ] When displayName is "Unknown", the instruction explicitly tells the model to ask for the friend's name
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
- [ ] Bug 2: Should terminal errors in buffered mode also switch from `safeSend` to `safeUpdate`? The user reported tool results and kicks, but terminal errors have the same pattern. Likely yes -- if the agent encounters a terminal error mid-turn, it shouldn't send a separate "Error: ..." message.
- [ ] Bug 3: Is the new-friend instruction alone sufficient, or does the model need a stronger behavioral nudge (e.g., few-shot example in the prompt)? Start with improved instruction; if insufficient, consider follow-up.

## Decisions Made
- Bug 1 root cause confirmed: `teamsContext` at teams.ts:492 never sets the three AAD fields despite the interface supporting them and the activity containing them.
- Bug 2 root cause confirmed: `safeSend` in buffered mode sends separate bot messages via `sendMessage`. The fix is to use `safeUpdate` (transient status) for tool results, kicks, and errors, matching what `onToolStart` already does.

## Context / References
- `src/senses/teams.ts:492-506` -- teamsContext construction (Bug 1)
- `src/senses/teams.ts:458` -- activity destructured from ctx (Bug 1)
- `src/senses/teams.ts:298-305` -- TeamsMessageContext interface with AAD fields (Bug 1)
- `src/senses/teams.ts:344-350` -- resolver uses teamsContext AAD fields (Bug 1)
- `src/senses/teams.ts:59-240` -- createTeamsCallbacks (Bug 2)
- `src/senses/teams.ts:191-198` -- onToolEnd buffered branch (Bug 2)
- `src/senses/teams.ts:200-207` -- onKick buffered branch (Bug 2)
- `src/senses/teams.ts:209-219` -- onError buffered branch (Bug 2)
- `src/senses/teams.ts:184-188` -- onToolStart uses safeUpdate (Bug 2 reference pattern)
- `src/mind/prompt.ts:144-206` -- contextSection with friend instructions (Bug 3)
- `src/mind/prompt.ts:181` -- name quality instruction (Bug 3)
- `src/mind/prompt.ts:193-194` -- new-friend instruction (Bug 3)
- `src/wardrobe/format.ts` -- formatToolResult, formatKick, formatError
- `src/mind/friends/resolver.ts` -- FriendResolver (works correctly given correct inputs)
- `src/__tests__/senses/teams.test.ts` -- existing Teams tests
- `src/__tests__/mind/prompt.test.ts` -- existing prompt tests
- Previous planning: `ouroboros/tasks/2026-03-03-1102-planning-context-kernel-bugs.md`

## Notes
The friend record the user showed (`displayName: "Unknown"`) confirms Bug 1 -- the resolver fell through to the `"Unknown"` default because `teamsContext.displayName` was never populated. Once Bug 1 is fixed, the name quality instruction (Bug 3) becomes more useful because it will have a real name to evaluate.

Bug 3 may partially resolve itself once Bug 1 is fixed -- the model might behave differently when it sees a real name vs "Unknown". However, the prompt instruction still needs strengthening regardless, because even with a real name, the model should still introduce itself and use `save_friend_note` on first encounter.

## Progress Log
- [pending git timestamp] Created
