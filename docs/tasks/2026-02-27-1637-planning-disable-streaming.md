# Planning: Disable Streaming Flag for Teams

**Status**: approved
**Created**: 2026-02-27 16:37

## Goal
Add a `--disable-streaming` flag to `npm run teams` that buffers the final AI text output and sends it to Teams as a single `emit()` call instead of many small deltas, bypassing the Teams SDK streaming protocol which is extremely slow over devtunnel+local. API-level streaming (`stream: true`) is kept so tool loops and reasoning work incrementally; only the bot-to-Teams text emission is buffered.

## Scope

### In Scope
- CLI argument parsing for `--disable-streaming` in teams-entry.ts (passed to `startTeamsApp()`)
- Buffered Teams callbacks variant of `createTeamsCallbacks()` that accumulates `onTextChunk` deltas and sends one `emit()` at the end
- Status updates (`stream.update()`) still fire during processing even when streaming is disabled (thinking phrases, tool status)
- Reasoning chunks still shown as status updates when streaming is disabled
- Threading the `disableStreaming` flag from entrypoint through to `handleTeamsMessage()` and `createTeamsCallbacks()`
- Full test coverage for all new code paths

### Out of Scope
- Changing the CLI adapter's streaming behavior
- Changing default behavior (streaming remains the default)
- Config.json or env var for this flag (CLI arg only)
- API-level streaming changes (API calls still use `stream: true` regardless of flag)
- Changes to `runAgent()`, `streamChatCompletion()`, or `streamResponsesApi()` in the engine
- Performance profiling of devtunnel
- Any changes to the Teams SDK itself

## Completion Criteria
- [ ] `npm run teams -- --disable-streaming` starts the bot in non-streaming mode
- [ ] In non-streaming mode, `onTextChunk` deltas are buffered and sent as a single `stream.emit()` after the agent loop completes
- [ ] API calls still use `stream: true` (engine layer unchanged)
- [ ] Status phrases ("thinking...", tool names) still display via `stream.update()` during processing
- [ ] Reasoning chunks still shown via `stream.update()` during processing
- [ ] Error messages still emitted immediately via `stream.emit()`
- [ ] Default behavior (no flag) is unchanged -- streaming works exactly as before
- [ ] Console log at startup indicates streaming mode (e.g., "streaming: disabled")
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
- (all resolved)

## Decisions Made
- CLI arg only (`--disable-streaming`), no config.json or env var -- simplest for quick toggling during dev
- Teams-level buffering only -- API calls still use `stream: true` so tool loops and reasoning work incrementally; only the bot-to-Teams text emission (`stream.emit()`) is buffered and sent once at the end
- Status updates (`stream.update()`) still fire during processing -- thinking phrases, tool status, and reasoning chunks are still shown so the user sees activity
- Error messages still emitted immediately (not buffered) so the user sees failures right away
- No changes to the engine layer (`runAgent`, `streamChatCompletion`, `streamResponsesApi`) -- all changes are in the Teams channel adapter layer

## Context / References
- `src/teams-entry.ts` (line 7) - thin entrypoint, calls `startTeamsApp()`
- `src/channels/teams.ts` - Teams adapter with `createTeamsCallbacks()`, `handleTeamsMessage()`, `startTeamsApp()`
- `src/engine/core.ts` - `runAgent()` sets `stream: true` at lines 215 and 231
- `src/engine/streaming.ts` - `streamChatCompletion()` and `streamResponsesApi()` handle streaming API calls
- `src/config.ts` - configuration pattern (config.json + env var overrides)
- `package.json` line 10 - `"teams": "tsc && node dist/teams-entry.js"`
- Two streaming layers: (1) API-to-bot streaming via OpenAI SDK, (2) bot-to-Teams streaming via Teams SDK `stream.emit()`/`stream.update()`
- Teams SDK `stream.emit(text)` sends text deltas; `stream.update(text)` sends status/informative updates
- The `ChannelCallbacks` interface in core.ts (line 74) is the contract between engine and channel adapters

## Notes
The slowness comes from the bot-to-Teams streaming layer: each `stream.emit()` call over devtunnel is an HTTP round-trip back to Teams, and with many small token-level deltas this compounds significantly. The fix buffers text deltas in the callbacks and emits once after the agent loop finishes. The API still streams so the agent loop (tool calls, reasoning, status) works normally -- only the final text delivery to Teams is batched.

## Progress Log
- 2026-02-27 16:37 Created
- 2026-02-27 16:40 Incorporated user decisions: CLI arg only, Teams-level buffering only, status updates still fire
- 2026-02-27 16:43 Approved, beginning conversion to doing doc
