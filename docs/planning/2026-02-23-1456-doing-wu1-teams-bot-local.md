# Doing: WU1 -- Teams Bot <> Agent Locally (DevtoolsPlugin)

**Status**: drafting
**Execution Mode**: direct
**Created**: TBD
**Planning**: ./2026-02-23-1456-planning-wu1-teams-bot-local.md
**Artifacts**: ./2026-02-23-1456-doing-wu1-teams-bot-local/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective

Refactor ouroboros from a CLI-only agent into a multi-channel architecture (CLI + Teams), extracting the agentic loop into a channel-agnostic core with adapter-based I/O. Prove the Teams channel works locally via DevtoolsPlugin before any cloud deployment.

## Completion Criteria

- [ ] `runAgent()` exported from `src/core.ts`, fully channel-agnostic (no `process.stdout`, no `process.stderr`, no ANSI codes)
- [ ] `ChannelCallbacks` interface covers all channel adapter needs: `onModelStart`, `onModelStreamStart`, `onTextChunk`, `onToolStart`, `onToolEnd`, `onError`
- [ ] CLI channel (`agent.ts`) calls `runAgent()` -- boot greeting, ANSI think tag dimming, spinner on stderr, tool result summaries
- [ ] CLI UX fixes: no double message echo, no garbage chars during model calls, Ctrl-C clears input (or confirms exit if empty), up-arrow history
- [ ] Teams channel adapter (inside ouroboros `src/`) starts with DevtoolsPlugin, calls `runAgent` from core
- [ ] Sending a message in DevtoolsPlugin UI triggers the ouroboros agent and streams a response
- [ ] Tool calls show informative updates in DevtoolsPlugin during execution
- [ ] Think tags stripped from Teams output (not shown to user)
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

- Not started: no marker
- In progress: [WIP]
- Done: [DONE]
- Blocked: [BLOCKED]

### Unit 0: Test Infrastructure Setup

**What**: Set up vitest in ouroboros. Add `vitest` as dev dependency, create `vitest.config.ts`, add `test`, `test:coverage` scripts to `package.json`. Verify with a trivial passing test.
**Output**: `vitest.config.ts`, updated `package.json`, one trivial test file proving the setup works.
**Acceptance**: `npm test` runs and passes. `npm run test:coverage` produces a coverage report.

### Unit 1a: Core Extraction -- Tests

**What**: Write tests for the new `src/core.ts` module. Test the `ChannelCallbacks` interface shape, `runAgent()` function signature, `buildSystem()`, `isOwnCodebase()`, `execTool()`, and `summarizeArgs()`. Mock the OpenAI client. Verify that:
- `runAgent()` accepts `(messages, callbacks)` and drives the agentic loop
- `buildSystem()` returns a system prompt string, with self-aware suffix when `isOwnCodebase()` is true
- `isOwnCodebase()` returns true/false based on filesystem checks
- `execTool()` dispatches to the correct handler and returns results
- `summarizeArgs()` produces correct summaries for each tool type
- `onModelStart` callback fires before the API call
- `onModelStreamStart` callback fires on first token
- `onTextChunk` callback fires for each text delta (with raw think tags)
- `onToolStart` / `onToolEnd` callbacks fire around each tool execution
- `onError` callback fires on API errors
- When no tool calls are returned, the loop ends (done)
- When tool calls are returned, tools execute and loop continues
- Assistant and tool messages are pushed onto the messages array by core
- User message is NOT pushed by core (adapter responsibility)
**Output**: `src/__tests__/core.test.ts` with comprehensive tests.
**Acceptance**: Tests exist and FAIL (red) because `src/core.ts` does not exist yet.

### Unit 1b: Core Extraction -- Implementation

**What**: Create `src/core.ts` by extracting from `agent.ts`:
- `ChannelCallbacks` interface with `onModelStart`, `onModelStreamStart`, `onTextChunk`, `onToolStart`, `onToolEnd`, `onError`
- `runAgent(messages, callbacks)` -- the agentic loop (currently lines 210-251 of `agent.ts`), refactored to use callbacks instead of direct stdout/stderr writes
- `buildSystem()` and `isOwnCodebase()` moved from `agent.ts`
- `client`, `tools`, `toolHandlers`, `execTool()`, `summarizeArgs()` moved from `agent.ts`
- `streamResponse()` refactored: no `flush()`, no ANSI, no `process.stdout.write`. Instead calls `callbacks.onTextChunk(text)` for each delta, passing raw text including think tags
- API key validation stays in core (required for client initialization)
- No `process.stdout`, no `process.stderr`, no ANSI codes anywhere in core
**Output**: `src/core.ts` with all exports. `agent.ts` updated to import from core.
**Acceptance**: All Unit 1a tests PASS (green). `npm run build` succeeds with no warnings.

### Unit 1c: Core Extraction -- Coverage and Refactor

**What**: Run coverage report. Identify any uncovered branches in `core.ts`. Add missing tests. Refactor if needed for clarity.
**Output**: Updated test file, 100% coverage on `core.ts`.
**Acceptance**: `npm run test:coverage` shows 100% branch/line/function coverage on `src/core.ts`. All tests green. No warnings.

### Unit 2a: CLI Channel Adapter -- Tests

**What**: Write tests for the refactored `agent.ts` CLI adapter. Test that:
- CLI adapter creates messages array with system message from `buildSystem()`
- CLI adapter pushes user message before calling `runAgent()`
- `onTextChunk` callback implements think-tag dimming (the flush logic, protected zone)
- `onModelStart` starts the spinner
- `onModelStreamStart` stops the spinner
- `onToolStart` shows tool spinner, `onToolEnd` shows result summary
- `onError` displays error on stderr
- Ctrl-C with non-empty input clears the line
- Ctrl-C with empty input prompts for exit confirmation
- Up-arrow retrieves previous messages from history
- Input is not echoed twice (no double message)
- Input during model calls does not produce garbage characters

Note: CLI adapter tests will need to mock `process.stdin`, `process.stdout`, `process.stderr`, and `readline`. The spinner and inputctrl classes are CLI-internal and tested through the adapter's behavior.
**Output**: `src/__tests__/cli.test.ts`.
**Acceptance**: Tests exist and FAIL (red) because the CLI adapter has not been refactored yet.

### Unit 2b: CLI Channel Adapter -- Implementation

**What**: Refactor `agent.ts` to be a CLI channel adapter:
- Import `runAgent`, `buildSystem`, `ChannelCallbacks` from `./core`
- `main()` creates messages array, pushes system message via `buildSystem()`
- `main()` pushes user message, then calls `runAgent(messages, callbacks)`
- Implement `ChannelCallbacks` with CLI-specific behavior: spinner, ANSI think tag dimming (flush logic stays here, protected zone preserved), tool result logging
- Fix double message echo: manage readline prompt/line clearing properly
- Fix garbage chars during model calls: correct the raw mode handling in inputctrl (currently sets raw mode to false, which is wrong)
- Add Ctrl-C handling: SIGINT clears current input, or confirms exit if input is empty
- Add input history: wire up readline's built-in history support
- Keep `spinner` and `inputctrl` classes in `agent.ts` (they are CLI-specific)
- Remove all code that was moved to `core.ts` (no duplication)
**Output**: Refactored `agent.ts`.
**Acceptance**: All Unit 2a tests PASS (green). `npm run build` succeeds. CLI boots, greets, accepts input, runs tools, streams responses with think tag dimming -- same behavior as before but through `runAgent()`.

### Unit 2c: CLI Channel Adapter -- Coverage and Refactor

**What**: Run coverage on CLI adapter. Fill coverage gaps. Refactor for clarity.
**Output**: Updated test file, 100% coverage on new CLI adapter code.
**Acceptance**: `npm run test:coverage` shows 100% coverage on new code in `agent.ts`. All tests green. No warnings.

### Unit 3a: Teams Channel Adapter -- Tests

**What**: Write tests for `src/teams.ts` Teams channel adapter. Test that:
- Teams adapter initializes `@microsoft/teams.apps` Application with DevtoolsPlugin
- On incoming message, adapter creates/reuses messages array, pushes system message and user message, calls `runAgent()`
- `onTextChunk` strips think tags from text before emitting to stream
- `onTextChunk` emits non-think content via the streaming API
- `onModelStart` sends a "thinking..." status update
- `onToolStart` sends informative status (e.g. "running read_file (package.json)...")
- `onToolEnd` updates status with result summary
- `onError` sends error text to stream
- Stream is properly closed after `runAgent()` completes
- Think tag stripping handles: no think tags, think at start, think at end, think in middle, multiple think blocks, partial think tags across chunks
**Output**: `src/__tests__/teams.test.ts`.
**Acceptance**: Tests exist and FAIL (red) because `src/teams.ts` does not exist yet.

### Unit 3b: Teams Channel Adapter -- Implementation

**What**: Create `src/teams.ts`:
- Import `runAgent`, `buildSystem`, `ChannelCallbacks` from `./core`
- Import from `@microsoft/teams.apps` (Application, DevtoolsPlugin)
- Create Application instance with DevtoolsPlugin for local testing
- Register message handler: on incoming message, push system + user message, call `runAgent()`
- Implement `ChannelCallbacks` for Teams: strip think tags from `onTextChunk`, stream content via Teams streaming API, send status updates for tool execution
- Add `teams` script to `package.json` to start the Teams adapter
- Single global messages array for WU1
**Output**: `src/teams.ts`, updated `package.json`.
**Acceptance**: All Unit 3a tests PASS (green). `npm run build` succeeds. `npm run teams` starts the DevtoolsPlugin UI. Sending a message triggers the agent and streams a response.

### Unit 3c: Teams Channel Adapter -- Coverage and Refactor

**What**: Run coverage on Teams adapter. Fill coverage gaps. Refactor for clarity.
**Output**: Updated test file, 100% coverage on `src/teams.ts`.
**Acceptance**: `npm run test:coverage` shows 100% coverage on `src/teams.ts`. All tests green. No warnings.

### Unit 4: Integration Smoke Test

**What**: Run the full test suite. Verify both channels work end-to-end:
- CLI: `npm run dev` -- boot greeting, send message, get response, tool usage works, think tags dimmed, Ctrl-C works, history works
- Teams: `npm run teams` -- DevtoolsPlugin opens, send message, get streamed response, tool status updates visible, think tags stripped
- All completion criteria satisfied
**Output**: All tests pass, coverage report in artifacts directory.
**Acceptance**: `npm test` passes. `npm run test:coverage` shows 100% on all new code. Manual smoke test of both channels succeeds. No warnings from `npm run build`.

## Execution

- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-23-1456-doing-wu1-teams-bot-local/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log

- TBD Created from planning doc
