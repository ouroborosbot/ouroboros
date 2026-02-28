# Planning: Disable Streaming Flag for Teams

**Status**: drafting
**Created**: (pending first commit)

## Goal
Add a `--disable-streaming` flag to `npm run teams` that makes the bot collect the full AI response before sending it to Teams as a single message, bypassing the Teams SDK streaming protocol (emit/update) which is extremely slow over devtunnel+local.

## Scope

### In Scope
- CLI argument parsing for `--disable-streaming` in teams-entry.ts
- Non-streaming Teams callbacks that buffer all output and send once at the end
- Non-streaming API calls (stream: false) to Azure/MiniMax when flag is active
- New non-streaming API response handler in streaming.ts (complement to streamChatCompletion / streamResponsesApi)
- Passing the disable-streaming flag through to runAgent so it sets stream: false
- Full test coverage for all new code paths

### Out of Scope
- Changing the CLI adapter's streaming behavior
- Changing default behavior (streaming remains the default)
- Performance profiling of devtunnel
- Any changes to the Teams SDK itself

## Completion Criteria
- [ ] `npm run teams -- --disable-streaming` starts the bot in non-streaming mode
- [ ] In non-streaming mode, the bot sends a single complete message to Teams (no incremental emit/update)
- [ ] In non-streaming mode, API calls use `stream: false` to avoid streaming overhead
- [ ] Status phrases ("thinking...", tool names) still display via `stream.update()` during processing
- [ ] Default behavior (no flag) is unchanged -- streaming works exactly as before
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
- [ ] Should the flag also be settable via config.json or env var (e.g., `OUROBOROS_DISABLE_STREAMING=true`) in addition to CLI arg?
- [ ] When streaming is disabled, should reasoning chunks still be shown as status updates, or only thinking phrases?
- [ ] Should the non-streaming path use `stream: false` on the API call (truly non-streaming) or still use streaming from the API but buffer before sending to Teams? (The former is simpler; the latter still gets incremental status but buffers the final text.)

## Decisions Made
- (none yet)

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
The slowness likely comes from the bot-to-Teams streaming layer: each `stream.emit()` call over devtunnel is an HTTP round-trip back to Teams, and with many small deltas this compounds. Disabling both layers (API streaming + Teams streaming) is the cleanest approach.

## Progress Log
- (pending first commit)
