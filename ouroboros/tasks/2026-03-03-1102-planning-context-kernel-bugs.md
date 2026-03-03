# Planning: Fix Context Kernel Integration Bugs

**Status**: NEEDS_REVIEW
**Created**: 2026-03-03 11:03

## Goal
Fix three bugs preventing the context kernel from functioning in production: missing AAD field extraction in the Teams handler, system prompt never receiving resolved context, and context store path being global instead of per-agent.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Bug 1: Extract `aadObjectId`, `tenantId`, `displayName` from Teams Bot Framework activity object in `src/senses/teams.ts` `app.on("message")` handler, populating the `TeamsMessageContext` before passing to `handleTeamsMessage()`
- Bug 2: Ensure resolved context reaches the system prompt in both Teams and CLI channels. Currently `buildSystem("teams")` is called without a `context` parameter and the result is cached for the session. The fix must inject resolved context into the system prompt on each turn (either rebuild the system message or inject a separate system-role message)
- Bug 3: Change context store path from `path.join(os.homedir(), ".agentconfigs", "context")` to use `getAgentRoot()` (e.g., `ouroboros/context/`), in both `src/senses/cli.ts:339` and `src/senses/teams.ts:286`
- Bug 2 also affects CLI: `buildSystem("cli")` at `cli.ts:359` is called without context despite `resolvedContext` being available 7 lines above

### Out of Scope
- FRIENDS.md migration (deferred -- see Notes)
- New context kernel features (authority probing, new identity providers)
- Changes to `ContextResolver`, `FileContextStore`, or `prompt.ts` internals (these already work correctly; the bugs are in the integration/wiring layer)

## Completion Criteria
- [ ] Teams handler extracts AAD fields from activity and populates `TeamsMessageContext`
- [ ] Context resolver guard (`teamsContext?.aadObjectId`) succeeds when AAD identity is present
- [ ] Resolved context is included in the system prompt for both Teams and CLI channels
- [ ] Context store paths use `getAgentRoot()` instead of hardcoded global path
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [x] Bug 2: Should we rebuild the system message each turn, or inject context as a separate system-role message? **Resolved: rebuild.** Psyche files are cached in `_psycheCache`, so rebuilding is cheap. The `buildSystem(channel, options, context)` signature already accepts context.
- [x] Bug 2 (Teams): For existing sessions, the system message was created in a prior request. Should we update `messages[0]` or prepend fresh? **Resolved: update `messages[0]`.** The system message is always the first message in the array. Replace its content with a fresh `buildSystem()` call that includes resolved context. This ensures context is always current even across session reloads.
- [x] Bug 1: Which properties on the Bot Framework `Activity` object carry AAD fields? **Resolved via SDK types.** `Activity.from` is type `Account` with `aadObjectId?: string` and `name: string`. `Activity.conversation` is type `ConversationAccount` with `tenantId?: string`. So: `activity.from.aadObjectId`, `activity.conversation.tenantId`, `activity.from.name`.

## Decisions Made
- Bug 2 fix: Rebuild the system message on each turn by calling `buildSystem(channel, options, context)` and replacing `messages[0].content`. This is cheap because psyche files are cached and the `buildSystem` signature already supports it.
- Bug 1 field mapping: `activity.from.aadObjectId` -> `teamsContext.aadObjectId`, `activity.conversation.tenantId` -> `teamsContext.tenantId`, `activity.from.name` -> `teamsContext.displayName`. These are the standard Bot Framework SDK fields from `@microsoft/teams.api`.
- Bug 3 path: Use `path.join(getAgentRoot(), "context")` in both cli.ts and teams.ts. The `getAgentRoot()` function returns the agent's root directory (e.g., `/path/to/ouroboros`).
- CLI bug 2 fix: Pass `resolvedContext` to `buildSystem("cli", undefined, resolvedContext)` at cli.ts:359. The context is already resolved 7 lines above.

## Context / References
- `src/senses/teams.ts` -- Teams channel adapter, contains bugs 1, 2 (Teams), and 3
- `src/senses/cli.ts` -- CLI channel adapter, contains bugs 2 (CLI) and 3
- `src/mind/prompt.ts` -- `buildSystem()` already accepts optional `context` parameter (line 188)
- `src/mind/context/resolver.ts` -- `ContextResolver` class (working correctly)
- `src/identity.ts` -- `getAgentRoot()` function for per-agent paths
- `src/__tests__/senses/teams.test.ts` -- existing Teams tests
- `src/__tests__/mind/prompt.test.ts` -- existing prompt tests
- Original context kernel planning: `ouroboros/tasks/2026-03-02-1716-planning-context-kernel.md`
- SDK types: `@microsoft/teams.api` `Account` type has `aadObjectId?: string`, `name: string`; `ConversationAccount` has `tenantId?: string`; `Activity.from: Account`, `Activity.conversation: ConversationAccount`

## Notes
**Deferred: FRIENDS.md migration (carry forward, do not implement)**
The context kernel planning doc explicitly deferred removing FRIENDS.md. The plan is:
- Per-friend knowledge moves from static `psyche/FRIENDS.md` to dynamic `FriendMemory` (`world`/`rapport` fields)
- Channel-level social norms ("speaking to Microsoft employees") move to `IDENTITY.md`
- This happens AFTER `toolPreferences` proves the model-managed notes pattern
- For now, FRIENDS.md stays as-is

## Progress Log
- 2026-03-03 11:03 Created
- 2026-03-03 11:04 Resolved all open questions from SDK type inspection; added decisions
