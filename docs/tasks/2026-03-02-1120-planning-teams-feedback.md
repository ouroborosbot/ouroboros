# Planning: Teams Channel Feedback Improvements

**Status**: drafting
**Created**: 2026-03-02 11:21

## Goal
Fix three Teams bot channel issues: (1) tool/kick results are ephemeral and vanish instead of persisting in the message, (2) bare "Continuing." text doesn't trigger a narration kick, and (3) text from successive agent loop iterations concatenates without spacing.

## Scope

### In Scope
- Make `onToolEnd` feedback permanent in Teams messages via `safeEmit` using emoji format: `✓ tool_name (summary)` / `✗ tool_name: error` -- prefixed with `\n\n` for separation from preceding text
- Keep `onToolStart` ephemeral (matching CLI's ephemeral spinner pattern)
- Implement `onKick` callback in Teams channel callbacks with visible permanent indicator via `safeEmit` -- prefixed with `\n\n` for separation
- Add "continuing" pattern to `TOOL_INTENT_PATTERNS` in `src/engine/kicks.ts` -- anchored `^continuing\.?$` so it doesn't match mid-sentence usage
- Maintain CLI behavior unchanged
- Update all existing tests and add new tests for 100% coverage on all changes

### Out of Scope
- Changing the CLI channel callbacks
- Changing the `ChannelCallbacks` interface (onKick is already optional at line 83 of core.ts)
- Redesigning the kick system for context-awareness (that's the existing TODO in kicks.ts)
- Changing the Teams SDK streaming protocol or buffered mode architecture
- Changing tool execution logic in `src/engine/core.ts`

## Completion Criteria
- [ ] Teams `onToolEnd` emits permanent emoji-based text via `safeEmit` -- success: `\n\n✓ name (summary)` / failure: `\n\n✗ name: error`
- [ ] Teams `onToolEnd` also keeps the ephemeral `safeUpdate` for live status feedback while tool runs
- [ ] Teams `onToolStart` remains ephemeral via `safeUpdate` only (unchanged)
- [ ] Teams `onKick` callback implemented, emits `\n\n↻ kick` (or `\n\n↻ kick N/M` when maxKicks > 1) via `safeEmit`
- [ ] `TOOL_INTENT_PATTERNS` includes anchored pattern for bare "Continuing." / "continuing" text
- [ ] Existing false-negative texts like "the process is continuing as expected" still return false
- [ ] The `\n\n` prefix on tool results and kick indicators provides iteration separation in Teams messages
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
- [x] Separator: `\n\n` double newline prefix on permanent indicators. Teams SDK is one-message-per-turn (emit accumulates, close finalizes). Multiple separate messages would require Bot Framework conversation API directly -- out of scope.
- [x] Kick indicator: keep visible. Kicks are a core differentiator of ouroboros and should be obvious to the user.

## Decisions Made
- Tool feedback format: emoji-based `✓ name (summary)` / `✗ name: error` -- matches CLI style
- onToolStart stays ephemeral via `safeUpdate` -- consistent with CLI's ephemeral spinner
- Each channel renders callbacks its own way; don't duplicate logic, just handle per-channel rendering
- `\n\n` prefix on permanent indicators (onToolEnd, onKick) handles the iteration separator issue -- the prefix ensures separation from any preceding model text without requiring the text-emitting side to know what follows
- Kick indicator visible in Teams -- kicks are a core ouroboros differentiator
- "Continuing." pattern must be anchored (`^continuing\.?$`) to avoid false positives on sentences like "the process is continuing as expected"
- onToolEnd keeps both `safeUpdate` (live status) and adds `safeEmit` (permanent result) -- they serve different purposes

## Context / References
- `src/channels/teams.ts` lines 145-157: current `onToolStart`/`onToolEnd` using `safeUpdate` (ephemeral only)
- `src/channels/teams.ts` lines 81-87: `safeEmit` function (emits permanent text to stream)
- `src/channels/teams.ts` lines 91-98: `safeUpdate` function (ephemeral status update)
- `src/channels/cli.ts` lines 289-295: CLI `onToolEnd` -- stops spinner with checkmark/X via `spinner.stop()`/`spinner.fail()`
- `src/channels/cli.ts` lines 302-311: CLI `onKick` -- stops spinner, writes `↻ kick` with optional counter
- `src/engine/core.ts` line 83: `onKick?(attempt, maxKicks)` -- already optional in ChannelCallbacks interface
- `src/engine/core.ts` line 274: where `onKick` is called in the agent loop
- `src/engine/kicks.ts` lines 33-111: `TOOL_INTENT_PATTERNS` array (no "continuing" pattern currently)
- `src/engine/kicks.ts` line 118: `hasToolIntent()` function
- `src/__tests__/channels/teams.test.ts`: existing Teams test file -- tests for onToolEnd (lines 287-308) will need updating
- `src/__tests__/engine/kicks.test.ts`: existing kicks test file -- has `hasToolIntent` and `detectKick` tests

## Notes
The Teams SDK accumulates all `stream.emit()` deltas into one final message. The separator issue happens because iteration N's text ends with a period and iteration N+1's tool result starts with an emoji/word -- no whitespace between them since each is a separate `emit()` call. Example: "Backlog expansion underway.✓ create_work_item (Title)".

The `\n\n` prefix approach: `onToolEnd` and `onKick` emit their permanent lines prefixed with `\n\n`. This ensures separation from any preceding model text. No trailing `\n\n` is needed because the next iteration's model text starts on a new stream anyway.

The `onToolEnd` keeps the `safeUpdate` call alongside the new `safeEmit` -- the update shows live status while the tool runs (ephemeral), the emit writes the permanent result.

## Progress Log
- 2026-03-02 11:21 Created
- 2026-03-02 11:27 Resolved open questions, updated decisions
- 2026-03-02 11:28 Approved, converting to doing doc (previous attempt)
- [pending] Refreshed planning with updated scope and codebase verification
