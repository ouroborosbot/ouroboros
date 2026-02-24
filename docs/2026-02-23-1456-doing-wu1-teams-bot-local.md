# Doing: WU1 -- Teams Bot <> Agent Locally (DevtoolsPlugin)

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-02-23 17:26
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
Not started / In progress / Done / Blocked

### Unit 0: Test Infrastructure Setup
**Status**: Done

**What**: Set up vitest in ouroboros. Add `vitest` as dev dependency, create `vitest.config.ts`, add `test`, `test:coverage` scripts to `package.json`. Verify with a trivial passing test.
**Output**: `vitest.config.ts`, updated `package.json`, one trivial test file proving the setup works.
**Acceptance**: `npm test` runs and passes. `npm run test:coverage` produces a coverage report.

### Unit 1a: Core Extraction -- Tests
**Status**: Done

**What**: Write tests for the new `src/core.ts` module. Mock the OpenAI client. Test:
- `buildSystem()` returns system prompt string; includes self-aware suffix when `isOwnCodebase()` is true, omits it when false
- `isOwnCodebase()` returns true when `src/agent.ts` and `package.json` exist in cwd, false otherwise
- `execTool()` dispatches to correct handler (read_file, write_file, shell, list_directory, git_commit, list_skills, load_skill, get_current_time); returns "unknown: X" for unknown tools
- `summarizeArgs()` produces correct summaries for each tool type (path for read/write/list_directory, truncated command for shell, message for git_commit, name for load_skill, JSON slice for unknown)
- `ChannelCallbacks` interface has these signatures:
  - `onModelStart()` -- no params, called before API request
  - `onModelStreamStart()` -- no params, called on first content token
  - `onTextChunk(text: string)` -- raw text delta including think tags
  - `onToolStart(name: string, args: Record<string, string>)` -- tool name + parsed args
  - `onToolEnd(name: string, summary: string, success: boolean)` -- tool name, arg summary, success/failure
  - `onError(error: Error)` -- the caught error
- `runAgent()` accepts `(messages, callbacks)` and drives the agentic loop:
  - Fires `onModelStart()` before the API call
  - Fires `onModelStreamStart()` on first content token
  - Fires `onTextChunk(delta)` for each text delta (with raw think tags, no stripping)
  - When response has no tool calls, loop ends
  - When response has tool calls: fires `onToolStart(name, args)` before each tool, executes tool, fires `onToolEnd(name, summary, success)` after each tool, then loops back for another model call
  - Fires `onError(error)` on API errors, loop ends
  - Pushes assistant message (with content and/or tool_calls) onto messages array
  - Pushes tool result messages onto messages array
  - Does NOT push user message (adapter responsibility)
**Output**: `src/__tests__/core.test.ts` with comprehensive tests.
**Acceptance**: Tests exist and FAIL (red) because `src/core.ts` does not exist yet.

### Unit 1b: Core Extraction -- Implementation
**Status**: Done

**What**: Create `src/core.ts` by extracting from `agent.ts`:
- Export `ChannelCallbacks` interface: `onModelStart()`, `onModelStreamStart()`, `onTextChunk(text)`, `onToolStart(name, args)`, `onToolEnd(name, summary, success)`, `onError(error)`
- Export `runAgent(messages, callbacks)` -- the agentic loop (currently the `while (!done)` block at lines 210-251), refactored to use callbacks instead of direct stdout/stderr
- Export `buildSystem()` and `isOwnCodebase()` -- moved from `agent.ts`
- Move to core: `client`, `tools`, `toolHandlers` (internal). Export `execTool()` and `summarizeArgs()` for testability.
- Refactor `streamResponse()` into core: remove `flush()`, remove ANSI, remove `process.stdout.write`. Call `callbacks.onModelStreamStart()` on first content token. Call `callbacks.onTextChunk(delta)` for each content delta, passing raw text including think tags. No spinner parameter.
- API key validation stays in core (required for client init)
- Zero references to `process.stdout`, `process.stderr`, or ANSI escape codes in core
**Output**: `src/core.ts` with all exports. `agent.ts` updated to import from core -- minimally refactored so the project still compiles (replace removed code with imports, keep `main()` calling `runAgent()` with stub callbacks that preserve current behavior). Full CLI adapter refactor happens in Unit 2b.
**Acceptance**: All Unit 1a tests PASS (green). `npm run build` succeeds with no errors. `npm run dev` still works (existing behavior preserved via stub callbacks).

### Unit 1c: Core Extraction -- Coverage and Refactor
**Status**: Not started

**What**: Run coverage report on `core.ts`. Identify uncovered branches. Add tests for edge cases: empty tool arguments, JSON parse failure in tool args, unknown tool name, `execTool` error paths, `summarizeArgs` with missing fields. Refactor if needed.
**Output**: Updated `src/__tests__/core.test.ts`, 100% coverage on `core.ts`.
**Acceptance**: `npm run test:coverage` shows 100% branch/line/function coverage on `src/core.ts`. All tests green. No warnings.

### Unit 2a: CLI Adapter Refactor -- Tests
**Status**: Not started

**What**: Write tests for the refactored `agent.ts` as a CLI channel adapter. Focus on the adapter wiring (not UX fixes, those are Unit 2d). Test:
- CLI adapter creates messages array with system message from `buildSystem()`
- CLI adapter pushes `{role: "user", content: text}` onto messages before calling `runAgent()`
- `onTextChunk` callback implements think-tag dimming via flush logic (protected zone: closing tag `</think>`, offset 8). Cases: no think tags, think at start, think in middle, multiple blocks, partial tags across chunks
- `onModelStart` starts spinner on stderr
- `onModelStreamStart` stops spinner
- `onToolStart` starts a tool-specific spinner (e.g. "running read_file")
- `onToolEnd` stops tool spinner with summary, logs invocation to stdout
- `onError` writes error to stderr
- Boot greeting: pushes "hello" as first user message, calls `runAgent`, displays response

Note: Tests mock `process.stdin`, `process.stdout`, `process.stderr`. Spinner and inputctrl are CLI-internal, tested through adapter behavior.
**Output**: `src/__tests__/cli.test.ts`.
**Acceptance**: Tests exist and FAIL (red) because `agent.ts` has not been refactored yet.

### Unit 2b: CLI Adapter Refactor -- Implementation
**Status**: Not started

**What**: Refactor `agent.ts` to be a CLI channel adapter:
- Import `runAgent`, `buildSystem`, `ChannelCallbacks` from `./core`
- Remove all code moved to core (client, tools, toolHandlers, execTool, summarizeArgs, buildSystem, isOwnCodebase, streamResponse). No duplication.
- `main()` creates messages array, pushes system message via `buildSystem()`
- For each user input: push user message, call `runAgent(messages, cliCallbacks)`
- Implement `ChannelCallbacks` with CLI-specific behavior:
  - `onModelStart`: start spinner
  - `onModelStreamStart`: stop spinner
  - `onTextChunk`: flush logic with ANSI think-tag dimming (protected zone preserved)
  - `onToolStart`: start tool spinner
  - `onToolEnd`: stop tool spinner with summary, log to stdout
  - `onError`: write to stderr
- Keep `spinner` and `inputctrl` classes in `agent.ts`
- Boot greeting flow preserved
**Output**: Refactored `agent.ts`.
**Acceptance**: All Unit 2a tests PASS (green). `npm run build` succeeds with no warnings. CLI boots and works (same behavior as before, but through `runAgent()`).

### Unit 2c: CLI Adapter Refactor -- Coverage and Refactor
**Status**: Not started

**What**: Run coverage on refactored `agent.ts`. Fill gaps. Refactor for clarity.
**Output**: Updated `src/__tests__/cli.test.ts`, 100% coverage on new CLI adapter code.
**Acceptance**: `npm run test:coverage` shows 100% coverage on new code in `agent.ts`. All tests green. No warnings.

### Unit 2d-a: CLI UX Fixes -- Tests
**Status**: Not started

**What**: Write tests for the four CLI UX improvements. These test the readline/input handling behavior, separate from the adapter wiring tested in Unit 2a. Test:
- **No double echo**: When user types input, it appears exactly once (readline `terminal` config and prompt clearing tested)
- **No garbage during model calls**: When inputctrl suppresses input, characters typed during model calls are not echoed to terminal (raw mode handling tested)
- **Ctrl-C clears input**: When input buffer is non-empty, SIGINT clears the current line and re-displays prompt
- **Ctrl-C confirms exit**: When input buffer is empty, SIGINT shows "press Ctrl-C again to exit" message; second Ctrl-C exits
- **Input history**: Up-arrow retrieves previous user messages; down-arrow moves forward through history
**Output**: Tests added to `src/__tests__/cli.test.ts` (or a new `src/__tests__/cli-ux.test.ts`).
**Acceptance**: Tests exist and FAIL (red) because UX fixes have not been implemented yet.

### Unit 2d-b: CLI UX Fixes -- Implementation
**Status**: Not started

**What**: Implement the four CLI UX fixes in `agent.ts`:
- **Double echo fix**: Configure readline appropriately (terminal mode, prompt management) so input appears once
- **Garbage chars fix**: Fix `inputctrl.suppress()` -- currently sets raw mode to `false` (wrong). Should either stay in raw mode and swallow keystrokes, or properly buffer/discard input during model calls
- **Ctrl-C handling**: Add SIGINT listener. If current input is non-empty, clear the line and re-prompt. If input is empty, show warning; on second consecutive Ctrl-C, exit gracefully
- **Input history**: Wire up readline's history. After each user message, add it to history. Up/down arrows navigate history.
**Output**: Updated `agent.ts`.
**Acceptance**: All Unit 2d-a tests PASS (green). `npm run build` succeeds. Manual verification: no double echo, no garbage, Ctrl-C works, history works.

### Unit 2d-c: CLI UX Fixes -- Coverage and Refactor
**Status**: Not started

**What**: Run coverage on UX fix code. Fill gaps. Refactor.
**Output**: Updated tests, 100% coverage on UX fix code.
**Acceptance**: `npm run test:coverage` shows 100% coverage on all new UX code in `agent.ts`. All tests green. No warnings.

### Unit 3a: Teams Channel Adapter -- Tests
**Status**: Not started

**What**: Write tests for `src/teams.ts` Teams channel adapter. Mock `@microsoft/teams.apps`. Test:
- Adapter initializes `App` (from `@microsoft/teams.apps`) with `DevtoolsPlugin` (from `@microsoft/teams.dev`)
- On incoming message: creates/reuses messages array, pushes system message (via `buildSystem()`) and user message, calls `runAgent()`
- `onTextChunk` strips think tags before emitting to stream. Edge cases: no think tags, think at start, think at end, think in middle, multiple think blocks, partial think tags split across chunks
- `onTextChunk` emits non-think content via streaming API
- `onModelStart` sends "thinking..." status update
- `onToolStart` sends informative status (e.g. "running read_file (package.json)...")
- `onToolEnd` updates status with result summary
- `onError` sends error text to stream
- Stream is closed after `runAgent()` completes
- Single global messages array used (WU1 simplification)
**Output**: `src/__tests__/teams.test.ts`.
**Acceptance**: Tests exist and FAIL (red) because `src/teams.ts` does not exist yet.

### Unit 3b: Teams Channel Adapter -- Implementation
**Status**: Not started

**What**: Create `src/teams.ts`:
- Import `runAgent`, `buildSystem`, `ChannelCallbacks` from `./core`
- Import `App` from `@microsoft/teams.apps`, `DevtoolsPlugin` from `@microsoft/teams.dev`
- Add `@microsoft/teams.apps`, `@microsoft/teams.dev`, and related Teams SDK packages as dependencies in `package.json`
- Create `App` instance with `DevtoolsPlugin` for local testing
- Register message handler via `app.on('message', async ({ stream, activity }) => {...})`: push system + user message onto global messages array, call `runAgent(messages, teamsCallbacks)`
- Implement `ChannelCallbacks` for Teams:
  - `onTextChunk`: strip `<think>...</think>` tags, call `stream.emit(text)` with remaining content
  - `onModelStart`: call `stream.update("thinking...")`
  - `onToolStart(name, args)`: call `stream.update("running read_file (package.json)...")`
  - `onToolEnd(name, summary)`: call `stream.update(summary)`
  - `onError(err)`: call `stream.emit(errorText)`
- Call `stream.close()` after `runAgent()` returns
- Add `teams` script to `package.json`: `tsc && node dist/teams.js`
- App starts on `process.env.PORT || 3978`
**Output**: `src/teams.ts`, updated `package.json`.
**Acceptance**: All Unit 3a tests PASS (green). `npm run build` succeeds. `npm run teams` starts DevtoolsPlugin UI. Sending a message triggers the agent, streams a response with tool status updates, think tags stripped.

### Unit 3c: Teams Channel Adapter -- Coverage and Refactor
**Status**: Not started

**What**: Run coverage on `src/teams.ts`. Fill gaps in think-tag stripping edge cases and error paths. Refactor.
**Output**: Updated `src/__tests__/teams.test.ts`, 100% coverage on `src/teams.ts`.
**Acceptance**: `npm run test:coverage` shows 100% coverage on `src/teams.ts`. All tests green. No warnings.

### Unit 4: Integration Smoke Test
**Status**: Not started

**What**: Run full test suite. Verify both channels end-to-end:
- `npm test` -- all unit tests pass
- `npm run test:coverage` -- 100% on all new code, save report to artifacts directory
- `npm run build` -- no warnings
- CLI manual smoke: `npm run dev` -- boot greeting, send message, get response, tool usage works, think tags dimmed, Ctrl-C clears/confirms, history works, no double echo, no garbage chars
- Teams manual smoke: `npm run teams` -- DevtoolsPlugin opens, send message, streamed response appears, tool status updates visible, think tags stripped
- Walk through all completion criteria checklist
**Output**: Coverage report saved to artifacts directory. All completion criteria checked off.
**Acceptance**: All automated tests pass with 100% coverage on new code. Both manual smoke tests succeed. No build warnings. All 11 completion criteria satisfied.

## Execution

- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-23-1456-doing-wu1-teams-bot-local/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log

- 2026-02-23 17:26 Created from planning doc (Pass 1: first draft)
- 2026-02-23 17:28 Pass 2: granularity -- split CLI UX fixes into Unit 2d-a/b/c, detailed test specs for all units
- 2026-02-23 17:29 Pass 3: validation -- fixed Teams SDK class names (App not Application, DevtoolsPlugin from @microsoft/teams.dev), fixed Unit 1b to keep agent.ts compilable
- 2026-02-23 17:30 Pass 4: quality -- added ChannelCallbacks parameter signatures, exported execTool/summarizeArgs for testability
- 2026-02-23 17:37 Unit 0 complete: vitest + coverage configured, trivial test passes, npm test and npm run test:coverage both work
- 2026-02-23 17:39 Unit 1a complete: 46 tests for core.ts (isOwnCodebase, buildSystem, execTool, summarizeArgs, ChannelCallbacks, runAgent). All 45 fail (red) as expected -- core.ts does not exist yet
