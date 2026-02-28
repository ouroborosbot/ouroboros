# Doing: Disable Streaming Flag for Teams

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-02-27 16:44
**Planning**: ./2026-02-27-1637-planning-disable-streaming.md
**Artifacts**: ./2026-02-27-1637-doing-disable-streaming/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Add a `--disable-streaming` flag to `npm run teams` that buffers the final AI text output and sends it to Teams as a single `emit()` call instead of many small deltas, bypassing the Teams SDK streaming protocol which is extremely slow over devtunnel+local. API-level streaming is kept; only the bot-to-Teams text emission is buffered.

## Completion Criteria
- [ ] `npm run teams -- --disable-streaming` starts the bot in non-streaming mode
- [ ] In non-streaming mode, `onTextChunk` deltas are buffered and sent as a single `stream.emit()` after the agent loop completes
- [ ] API calls still use `stream: true` (engine layer unchanged)
- [ ] Status phrases ("thinking...", tool names) still display via `stream.update()` during processing
- [ ] Reasoning chunks still shown via `stream.update()` during processing
- [ ] Error messages still emitted immediately via `stream.emit()`
- [ ] Default behavior (no flag) is unchanged -- streaming works exactly as before
- [ ] Console log at startup indicates streaming mode (e.g., "streaming: disabled")
- [ ] System prompt tells ouroboros when streaming is disabled and why (flag awareness)
- [ ] Rationale for `--disable-streaming` is documented in code comments (devtunnel limitations)
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

### ✅ Unit 1a: Buffered callbacks -- Tests
**What**: Write failing tests for `createTeamsCallbacks()` when `disableStreaming: true` is passed. Tests should verify:
- `onTextChunk` accumulates text internally (does NOT call `stream.emit()`)
- `onReasoningChunk` still calls `stream.update()` (not buffered)
- `onModelStart` still calls `stream.update()` with thinking phrases
- `onToolStart` / `onToolEnd` still call `stream.update()` (status updates work)
- `onError` still calls `stream.emit()` immediately (errors not buffered)
- A new `flush()` method on the returned callbacks emits the entire buffered text as a single `stream.emit()` call
- `flush()` with empty buffer does not call `stream.emit()`
- When `disableStreaming` is false/undefined, behavior is identical to current (no buffering)
- Stop-streaming (403 error) still works: emit/update errors abort the controller
**Files**: `src/__tests__/channels/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `createTeamsCallbacks` does not yet accept the option or return `flush()`

### ✅ Unit 1b: Buffered callbacks -- Implementation
**What**: Modify `createTeamsCallbacks()` in `src/channels/teams.ts` to accept an options object `{ disableStreaming?: boolean }`. When `disableStreaming` is true:
- `onTextChunk`: append text to an internal buffer instead of calling `safeEmit()`
- All other callbacks unchanged (status updates, reasoning, tools, errors still work)
- Add a `flush()` method to the returned object that calls `safeEmit(buffer)` if buffer is non-empty
- Export the return type to include `flush()` (e.g., `ChannelCallbacks & { flush(): void }`)
**Files**: `src/channels/teams.ts`
**Acceptance**: All Unit 1a tests PASS (green), no warnings

### ✅ Unit 1c: Buffered callbacks -- Coverage & Refactor
**What**: Verify 100% coverage on `createTeamsCallbacks()` changes, refactor if needed
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 2a: handleTeamsMessage threading -- Tests
**What**: Write failing tests for `handleTeamsMessage()` when `disableStreaming: true` is passed. Tests should verify:
- The `disableStreaming` flag is forwarded to `createTeamsCallbacks()`
- After `runAgent()` completes, `flush()` is called on the callbacks
- When `disableStreaming` is false/undefined, `flush()` is still called (no-op since buffer is empty) -- or not called; verify existing behavior unchanged
- Slash command paths (e.g., `/new`) do NOT call `flush()` (they emit directly)
**Files**: `src/__tests__/channels/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `handleTeamsMessage` does not yet accept the option

### ⬜ Unit 2b: handleTeamsMessage threading -- Implementation
**What**: Add `disableStreaming?: boolean` parameter to `handleTeamsMessage()` in `src/channels/teams.ts`. Thread it to `createTeamsCallbacks()`. Call `callbacks.flush()` immediately after `runAgent()` returns and before the AUTH_REQUIRED signin check (line 195), since the stream text must be complete before OAuth cards render.
**Files**: `src/channels/teams.ts`
**Acceptance**: All Unit 2a tests PASS (green), all existing `handleTeamsMessage` tests still pass (backward compat), no warnings

### ⬜ Unit 2c: handleTeamsMessage threading -- Coverage & Refactor
**What**: Verify 100% coverage on `handleTeamsMessage()` changes, refactor if needed
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 3a: CLI arg parsing and startTeamsApp threading -- Tests
**What**: Write failing tests for:
- `startTeamsApp()` reads `process.argv` for `--disable-streaming` and threads it to `handleTeamsMessage()`
- Console log at startup includes streaming mode indicator (e.g., "streaming: disabled")
- `teams-entry.ts` passes no args (existing behavior, streaming enabled by default)
- When `--disable-streaming` is NOT in argv, `handleTeamsMessage()` is called without the flag (or with `false`)
**Files**: `src/__tests__/channels/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `startTeamsApp` does not yet parse the flag

### ⬜ Unit 3b: CLI arg parsing and startTeamsApp threading -- Implementation
**What**: In `startTeamsApp()`:
- Parse `process.argv` for `--disable-streaming` flag
- Store the boolean and thread it to `handleTeamsMessage()` in the `app.on("message")` handler
- Add console log at startup: `"streaming: disabled"` when flag is present
**Files**: `src/channels/teams.ts`
**Acceptance**: All Unit 3a tests PASS (green), no warnings

### ⬜ Unit 3c: CLI arg parsing and startTeamsApp -- Coverage & Refactor
**What**: Verify 100% coverage on `startTeamsApp()` changes, refactor if needed
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 4a: System prompt flag awareness -- Tests
**What**: Write failing tests for `buildSystem()` in `src/mind/prompt.ts` verifying that when `disableStreaming: true` is passed in options:
- The system prompt includes a section explaining that streaming is disabled
- The section mentions the reason: devtunnel relay buffering causes streaming to be slow
- When `disableStreaming` is false/undefined, no streaming section appears in the prompt
- The section only appears for the `"teams"` channel (not `"cli"`)
- Test the `cachedBuildSystem` cache key includes the `disableStreaming` flag (so cached prompts with/without the flag don't collide)
**Files**: `src/__tests__/mind/prompt.test.ts`, `src/__tests__/mind/context.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `buildSystem` does not yet handle `disableStreaming`

### ⬜ Unit 4b: System prompt flag awareness -- Implementation
**What**: In `src/mind/prompt.ts`:
- Add `disableStreaming?: boolean` to `BuildSystemOptions` interface
- Add a new `flagsSection(channel, options)` function that returns a `## my flags` section when `disableStreaming` is true AND channel is `"teams"`. Content should tell ouroboros: streaming to Teams is disabled because devtunnel relay buffering makes SSE/chunked streaming extremely slow; responses are buffered and sent as one message; the user will not see incremental text output, only status updates
- Include the section in `buildSystem()` output (between `selfAwareSection` and `providerSection`)

In `src/engine/core.ts`:
- Add `disableStreaming?: boolean` to `RunAgentOptions` interface (informational -- already flows to `cachedBuildSystem` via `options`)

In `src/mind/context.ts`:
- Update `cachedBuildSystem` cache key to include `disableStreaming` flag (e.g., append `:ds` when true)

In `src/channels/teams.ts`:
- Pass `disableStreaming` in the `runAgent()` options object in `handleTeamsMessage()` so it flows through to the system prompt. Note: the current call `runAgent(..., toolContext ? { toolContext } : undefined)` must be refactored to always build the options object when either `toolContext` or `disableStreaming` is present (e.g., build an options object first, pass it or `undefined`)
**Files**: `src/mind/prompt.ts`, `src/engine/core.ts`, `src/mind/context.ts`, `src/channels/teams.ts`
**Acceptance**: All Unit 4a tests PASS (green), no warnings

### ⬜ Unit 4c: System prompt flag awareness -- Coverage & Refactor
**What**: Verify 100% coverage on all prompt/context/options changes, refactor if needed
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 5a: Rationale documentation -- Tests
**What**: Write a test that verifies the `flagsSection()` output includes the key rationale points as code-level documentation:
- Devtunnel nginx relay buffers responses (reference: microsoft/dev-tunnels#518)
- 60-second hard timeout on web-forwarded connections
- No HTTP/2 support on devtunnels.ms
- Teams throttles streaming updates to 1 req/sec
- Buffering avoids compounding latency through a known-slow tunnel
**Files**: `src/__tests__/mind/prompt.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `flagsSection` does not yet include the rationale detail

### ⬜ Unit 5b: Rationale documentation -- Implementation
**What**: Update the `flagsSection()` function in `src/mind/prompt.ts` to include the rationale in the system prompt text. Also add a code comment block at the top of the `flagsSection` function documenting the research findings (devtunnel limitations, Teams throttling, the GitHub issue reference). The system prompt text should be concise but informative for the agent; the code comment should be detailed for developers.
**Files**: `src/mind/prompt.ts`
**Acceptance**: All Unit 5a tests PASS (green), no warnings

### ⬜ Unit 5c: Rationale documentation -- Coverage & Refactor
**What**: Verify 100% coverage on rationale additions, refactor if needed
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 6: Full integration validation
**What**: Run full test suite (`npm test`), verify 100% coverage (`npm run test:coverage`), verify build (`npm run build`), verify no warnings. Confirm all existing tests still pass unchanged. Verify that the system prompt contains the flags section when `disableStreaming` is active.
**Output**: Clean test run, coverage report showing 100% on all modified files
**Acceptance**: All tests pass, no warnings, 100% coverage on new code, build succeeds

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-27-1637-doing-disable-streaming/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-02-27 16:44 Created from planning doc (Pass 1 -- First Draft)
- 2026-02-27 16:45 Pass 2 -- Granularity: tightened Unit 2b backward compat acceptance
- 2026-02-27 16:45 Pass 3 -- Validation: verified file paths, function signatures, call sites against codebase; fixed flush() placement to go before AUTH_REQUIRED check
- 2026-02-27 16:46 Pass 4 -- Quality: all units have acceptance criteria, emoji headers, no TBDs; set READY_FOR_EXECUTION
- 2026-02-27 16:57 Added Units 4a-5c for system prompt flag awareness and rationale documentation; validated against prompt.ts, context.ts, core.ts; quality checked all 16 unit headers
- 2026-02-27 17:02 Unit 1a complete: 13 failing tests for createTeamsCallbacks disableStreaming option (buffering, flush, stop-streaming, backward compat)
- 2026-02-27 17:03 Unit 1b complete: implemented disableStreaming option with text buffering, flush(), TeamsCallbacksWithFlush type; all 662 tests pass
- 2026-02-27 17:04 Unit 1c complete: 100% coverage on new code verified; uncovered lines 292-305,316-324 are existing startTeamsApp code
