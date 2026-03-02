# Planning: Teams Channel Feedback Improvements

**Status**: NEEDS_REVIEW
**Created**: 2026-03-02 11:21

## Goal
Fix three Teams bot channel issues: (1) tool/kick results are ephemeral and vanish instead of persisting in the message, (2) bare "Continuing." text doesn't trigger a narration kick, and (3) text from successive agent loop iterations concatenates without spacing.

## Scope

### In Scope
- Make `onToolEnd` feedback permanent in Teams messages via `safeEmit` using emoji format: `\n\n✓ tool_name (summary)` / `\n\n✗ tool_name: error`
- Keep `onToolStart` ephemeral (matching CLI's ephemeral spinner pattern)
- Implement `onKick` callback in Teams channel callbacks with visible permanent indicator
- Add "continuing" pattern to `TOOL_INTENT_PATTERNS` in `src/engine/kicks.ts`
- Add `\n\n` separator between agent loop iterations in Teams (emitted before tool results and kick indicators)
- Update all existing tests and add new tests for all changes
- Maintain CLI behavior unchanged

### Out of Scope
- Changing the CLI channel callbacks
- Changing the `ChannelCallbacks` interface (onKick is already optional)
- Redesigning the kick system for context-awareness (that's the existing TODO)
- Changing the Teams SDK streaming protocol or buffered mode architecture
- Changing tool execution logic in `src/engine/core.ts`

## Completion Criteria
- [ ] Teams `onToolEnd` emits permanent emoji-based text (`\n\n✓ name (summary)` / `\n\n✗ name: error`) via `safeEmit`
- [ ] Teams `onToolStart` remains ephemeral via `safeUpdate` (matching CLI spinner pattern)
- [ ] Teams `onKick` callback implemented, emits visible permanent kick indicator via `safeEmit`
- [ ] `TOOL_INTENT_PATTERNS` includes pattern for bare "Continuing." / "continuing" text
- [ ] Text from successive loop iterations separated by `\n\n` in Teams messages
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
- [x] Tool feedback format: emoji-based like CLI -- `✓ tool_name (summary)` / `✗ tool_name: error`
- [x] onToolStart: keep ephemeral (match CLI spinner). Don't duplicate logic -- same interface, per-channel rendering.
- [x] Separator: `\n\n` double newline. Teams SDK is one-message-per-turn (emit accumulates, close finalizes). Multiple separate messages would require Bot Framework conversation API directly -- out of scope.
- [x] Kick indicator: keep visible. Kicks are a core differentiator of ouroboros and should be obvious to the user.

## Decisions Made
- Tool feedback format: emoji-based `✓ name (summary)` / `✗ name: error` -- matches CLI style
- onToolStart stays ephemeral via `safeUpdate` -- consistent with CLI's ephemeral spinner
- Each channel renders callbacks its own way; don't duplicate logic, just handle per-channel rendering
- `\n\n` separator between loop iterations (Teams SDK is one-message-per-turn, multi-message requires different API)
- Kick indicator visible in Teams -- kicks are a core ouroboros differentiator
- `onToolEnd` emits `\n\n` prefix before the tool result line to separate from preceding text

## Context / References
- `src/channels/teams.ts` lines 145-157: current `onToolStart`/`onToolEnd` using `safeUpdate` (ephemeral)
- `src/channels/cli.ts` lines 289-295: CLI `onToolEnd` shows permanent checkmark/X
- `src/channels/cli.ts` lines 302-311: CLI `onKick` shows permanent kick indicator
- `src/engine/core.ts` line 83: `onKick?(attempt, maxKicks)` -- already optional in interface
- `src/engine/core.ts` line 274: where `onKick` is called in the agent loop
- `src/engine/kicks.ts` lines 33-111: `TOOL_INTENT_PATTERNS` array
- `src/__tests__/channels/teams.test.ts`: existing Teams test file
- `src/__tests__/engine/kicks.test.ts`: existing kicks test file (if present)

## Notes
The Teams SDK accumulates all `stream.emit()` deltas into one final message. The separator issue happens because iteration N's text ends with a period and iteration N+1's text starts with an emoji/word -- no whitespace between them since each is a separate `emit()` call.

The `\n\n` separator approach: `onToolEnd` and `onKick` emit their permanent lines prefixed with `\n\n`. This ensures separation from any preceding model text without requiring the text-emitting side to know about what follows.

## Progress Log
- 2026-03-02 11:21 Created
- PENDING Resolved open questions, updated decisions
