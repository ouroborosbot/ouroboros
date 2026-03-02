# Planning: Teams Channel Feedback Improvements

**Status**: drafting
**Created**: 2026-03-02 11:20

## Goal
Fix three Teams bot channel issues: (1) tool/kick results are ephemeral and vanish instead of persisting in the message, (2) bare "Continuing." text doesn't trigger a narration kick, and (3) text from successive agent loop iterations concatenates without spacing.

## Scope

### In Scope
- Make tool start/end feedback permanent in Teams messages via `safeEmit` (not `safeUpdate`)
- Implement `onKick` callback in Teams channel callbacks
- Add "continuing" pattern to `TOOL_INTENT_PATTERNS` in `src/engine/kicks.ts`
- Add separator between agent loop iterations in Teams (newline before new text after tool runs)
- Update all existing tests and add new tests for all changes
- Maintain CLI behavior unchanged

### Out of Scope
- Changing the CLI channel callbacks
- Changing the `ChannelCallbacks` interface (onKick is already optional)
- Redesigning the kick system for context-awareness (that's the existing TODO)
- Changing the Teams SDK streaming protocol or buffered mode architecture
- Changing tool execution logic in `src/engine/core.ts`

## Completion Criteria
- [ ] Teams `onToolEnd` emits permanent text (e.g. checkmark/X + tool name + summary) via `safeEmit`
- [ ] Teams `onToolStart` behavior decided: either keep ephemeral status update or make permanent
- [ ] Teams `onKick` callback implemented, emits permanent kick indicator via `safeEmit`
- [ ] `TOOL_INTENT_PATTERNS` includes pattern for bare "Continuing." / "continuing" text
- [ ] Text from successive loop iterations has visible separator (newline) in Teams messages
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
- [ ] What format should permanent tool feedback use in Teams? (e.g. emoji-based like CLI's checkmark/X, or markdown bold, or something else?)
- [ ] Should `onToolStart` remain ephemeral (status update) or also become permanent? CLI shows a spinner for tool-start (ephemeral), so keeping it ephemeral in Teams seems consistent.
- [ ] What separator to use between loop iterations in Teams? A newline (`\n`) before tool results, or `\n\n` paragraph break?
- [ ] Should the kick indicator in Teams be visible to the end user (it's a system-level concern)? CLI shows it -- should Teams match?

## Decisions Made
- (none yet)

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

## Progress Log
- 2026-03-02 11:20 Created
