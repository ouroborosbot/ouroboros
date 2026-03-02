# Doing: Teams Channel Feedback — Multi-Message, Shared Formatting, Error Severity, Phrases Config

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-02 13:12
**Planning**: ./2026-03-02-1120-planning-teams-feedback.md
**Artifacts**: ./2026-03-02-1120-doing-teams-feedback/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Fix three Teams bot channel issues and improve the presentation architecture: (1) tool/kick results are ephemeral and vanish -- in streaming mode they should appear inline in the stream, in buffered mode they should be separate persistent messages, (2) bare "Continuing.", "continues.", and "Next up" text doesn't trigger a narration kick, (3) text from successive loop iterations concatenates into one blob -- in buffered mode each iteration's output should be its own message, (4) errors should be classified by severity so channels can render them appropriately, and (5) presentation code (phrases, formatting) should live in a dedicated shared directory with phrases required in agent config rather than hardcoded.

## Completion Criteria
- [ ] `src/wardrobe/` directory exists with `format.ts` and `phrases.ts`
- [ ] `src/repertoire/phrases.ts` removed; all imports updated to `src/wardrobe/phrases.ts`
- [ ] `src/repertoire/` retains only `commands.ts` and `skills.ts`
- [ ] `AgentConfig.phrases` (with `thinking`, `tool`, `followup`) is required in `src/identity.ts`
- [ ] `loadAgentConfig()` writes placeholder phrases + warning if missing from agent.json
- [ ] Hardcoded fallback arrays removed from `phrases.ts`; `getPhrases()` returns `config.phrases` directly
- [ ] `src/wardrobe/format.ts` has `formatToolResult()`, `formatKick()`, `formatError()`
- [ ] CLI `onToolEnd`, `onKick`, `onError` use shared formatter (identical visual output)
- [ ] `ChannelCallbacks.onError` signature updated to `onError(error: Error, severity: "transient" | "terminal"): void`
- [ ] All `callbacks.onError()` call sites in `src/engine/core.ts` pass correct severity
- [x] Early manual testing with user confirms `ctx.send()` behavior alongside open stream
- [ ] Teams streaming mode: `onToolEnd`, `onKick`, terminal `onError` emit inline via `stream.emit()`
- [ ] Teams buffered mode: `onToolEnd`, `onKick`, terminal `onError` send via `ctx.send()` as separate messages
- [ ] Teams buffered mode: `onToolStart` flushes text buffer; first text → `stream.emit()`, subsequent → `ctx.send()`
- [ ] Teams buffered mode: `flush()` is async, awaits final `ctx.send()`
- [ ] Teams buffered mode: no-text fallback emits "(completed with tool calls only — no text response)"
- [ ] Teams `onToolStart` remains ephemeral via `stream.update()` only (both modes)
- [ ] Teams `onError`: transient = ephemeral `stream.update()` (both modes)
- [ ] Dual-mode pattern documented in code comments as reference for future non-streaming channels
- [ ] `TOOL_INTENT_PATTERNS` includes anchored pattern for bare "Continuing." / "continuing"
- [ ] `TOOL_INTENT_PATTERNS` includes sentence-final "continues." pattern
- [ ] `TOOL_INTENT_PATTERNS` includes "Next up" pattern
- [ ] Existing false-negative texts like "the process is continuing as expected" still return false
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

## Prerequisites / Notes

**Earlier bug fixes must be built first**: Commits `cf4ec1c` through `66453f8` from this session contain independent fixes (async stream error handling, confirmation timeout, skipConfirmation default to true, AGENTS.md). These are already on main — just ensure `npm run build` is run before Unit 0 manual testing so the bot picks them up.

**Unit 5 is a coordinated breaking change**: The `onError` signature change (`error` → `error, severity`) touches the `ChannelCallbacks` interface, all 5 call sites in core.ts, both channel implementations, and ~128 test mocks. All must update in a single commit to keep the build green.

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

---

### ✅ Unit 0: Manual testing -- ctx.send() alongside open stream
**What**: Build minimal tests in `src/channels/teams.ts` that exercise `ctx.send()` and `stream.emit()` behavior alongside an open stream. Deploy to live Teams and verify with user.
**Acceptance**: User confirms message ordering is correct in live Teams. Decision is documented and all subsequent units can proceed.

#### Findings

**Test 1**: `ctx.send()` works alongside open stream. Standalone message appears as separate bubble below streaming bubble. Stream continues normally.

**Test 2**: `stream.update()` locks the stream bubble's timeline position. Any `ctx.send()` messages always appear below the stream bubble, regardless of when they're sent. This is a Teams SDK constraint.

**Test 3 (streaming mode)**: Emitting tool results inline into the stream via `safeEmit("\n\n✓ tool (summary)\n\n")` works perfectly. Tool results appear in correct chronological position within the streamed text. This is the right approach for streaming mode and Copilot (which has no per-message bubbles).

**Test 4 (buffered/non-streaming mode)**: Using `ctx.send()` for tool results and text, with `flushTextBuffer()` at `onToolStart` boundaries, produces separate bubbles in correct chronological order. First text goes into stream (so bubble isn't empty), subsequent text/tool results go via `ctx.send()`. Edge case: if model produces only tool calls with no text, emit "(completed with tool calls only — no text response)" to stream.

#### Architecture decision — dual-mode rendering

- **Streaming mode**: Everything goes through `stream.emit()` — tool results inline (`\n\n✓ tool\n\n`), kicks inline, text streaming. One bubble, correct chronological order within it. Works for Teams and Copilot.
- **Buffered mode**: `sendMessage` callback (`ctx.send()`) for tool results and subsequent text. First text → `safeEmit()` to stream. `flushTextBuffer()` at `onToolStart` boundaries. `flush()` is async to await final `ctx.send()`. Separate bubbles in correct order.
- **Both modes**: `stream.update()` for ephemeral status (thinking phrases, "running tool..."). `onToolStart` remains ephemeral. Stream auto-closes when handler returns.

#### Implementation details confirmed

- `createTeamsCallbacks` gains `sendMessage?: (text: string) => Promise<void>` parameter
- New helpers: `safeSend()`, `flushTextBuffer()`
- New state: `streamHasContent` flag
- `TeamsCallbacksWithFlush` type: `flush()` returns `void | Promise<void>`
- `handleTeamsMessage` gains `sendMessage` parameter, `await callbacks.flush()`
- `app.on("message")` passes `async (t) => { await ctx.send(t) }` as sendMessage

#### Kick detection gaps found

"Backlog theatre continues." and "Next up:" not caught by any existing pattern. Need to add: bare "Continuing." pattern, sentence-final "continues." pattern, and "Next up" pattern.

---

### ✅ Unit 1a: Kick pattern gaps -- Tests
**What**: Add test cases to `src/__tests__/engine/kicks.test.ts`:

"Continuing." / "continues." patterns:
- `hasToolIntent("Continuing.")` returns `true`
- `hasToolIntent("continuing")` returns `true`
- `hasToolIntent("Continuing")` returns `true`
- `hasToolIntent("continuing.")` returns `true`
- `hasToolIntent("Backlog theatre continues.")` returns `true` (sentence-final "continues.")
- `hasToolIntent("The work continues.")` returns `true`
- `detectKick("Continuing.")` returns `{ reason: "narration", ... }`
- `detectKick("Backlog theatre continues.")` returns `{ reason: "narration", ... }`
- `hasToolIntent("the process is continuing as expected")` returns `false`
- `hasToolIntent("Continuing the work on the project")` returns `false`
- `hasToolIntent("The task continues to be complex")` returns `false` ("continues" not sentence-final)

"Next up" pattern:
- `hasToolIntent("Next up:")` returns `true`
- `hasToolIntent("next up:")` returns `true`
- `hasToolIntent("Next up, I'll create the task")` returns `true`
- `hasToolIntent("What's next up on the agenda?")` returns `false` (not at start of sentence)
**Output**: Failing tests in `src/__tests__/engine/kicks.test.ts`
**Acceptance**: Tests exist and FAIL (red) because patterns not yet added

### ✅ Unit 1b: Kick pattern gaps -- Implementation
**What**: Add three patterns to the `TOOL_INTENT_PATTERNS` array in `src/engine/kicks.ts`:
- `/^continuing\.?$/i` — bare "Continuing." / "continuing"
- `/\bcontinues\.\s*$/i` — sentence-final "continues." (e.g., "Backlog theatre continues.")
- `/^next up\b/i` — "Next up:" / "Next up, I'll..." at start of text
**Output**: Updated `src/engine/kicks.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 1c: Kick pattern gaps -- Coverage
**What**: Verify 100% coverage on all three new patterns. Run full test suite.
**Output**: Coverage report confirms full coverage
**Acceptance**: 100% coverage on new code, all tests green, no warnings

---

### ✅ Unit 2: Move phrases.ts to src/wardrobe/ (mechanical refactor)
**What**: Atomic file move -- no TDD needed since there's no new logic, just path changes:
- Create `src/wardrobe/` directory
- Move `src/repertoire/phrases.ts` to `src/wardrobe/phrases.ts` (content unchanged)
- Update source imports in `src/channels/cli.ts` and `src/channels/teams.ts` from `../repertoire/phrases` to `../wardrobe/phrases`
- Move `src/__tests__/repertoire/phrases.test.ts` to `src/__tests__/wardrobe/phrases.test.ts`
- Update all test imports: `../../repertoire/phrases` to `../../wardrobe/phrases` in `phrases.test.ts`, `cli.test.ts`, `teams.test.ts`
- Delete `src/repertoire/phrases.ts`
- Verify `src/repertoire/` contains only `commands.ts` and `skills.ts`
**Output**: File moved, all imports updated, all tests pass
**Acceptance**: `npm test` passes, no warnings, no coverage regressions

---

### ✅ Unit 3a: Phrases required in agent config -- Tests
**Depends on**: Unit 2 (phrases.test.ts path changes)
**What**: Update tests in `src/__tests__/identity.test.ts`:
- Add test: `loadAgentConfig()` with agent.json missing `phrases` field calls `console.warn` with message containing "agent.json is missing phrases" and writes placeholders to file via `fs.writeFileSync`
- Add test: `loadAgentConfig()` with agent.json missing `phrases` returns config with placeholder arrays (`["working"]`, `["running tool"]`, `["processing"]`)
- Add test: `loadAgentConfig()` with agent.json that HAS phrases does NOT warn and does NOT write
- Update existing test "works without phrases field (optional)" to expect placeholders instead of `undefined`

Update tests in `src/__tests__/wardrobe/phrases.test.ts`:
- Remove tests for hardcoded `THINKING_PHRASES`, `TOOL_PHRASES`, `FOLLOWUP_PHRASES` exports (they won't exist)
- Update `getPhrases()` tests to reflect it returns `config.phrases` directly
- Update "returns default phrases when agent.json has no phrases" test -- now expects placeholders since `loadAgentConfig` auto-fills them
**Output**: Failing tests
**Acceptance**: Tests exist and FAIL (red)

### ✅ Unit 3b: Phrases required in agent config -- Implementation
**What**:
- In `src/identity.ts`: make `phrases` and its children required in `AgentConfig` interface:
  ```typescript
  export interface AgentConfig {
    name: string
    configPath: string
    phrases: {
      thinking: string[]
      tool: string[]
      followup: string[]
    }
  }
  ```
- In `loadAgentConfig()`: after JSON.parse, check if `phrases` (or any child) is missing. If so:
  - Build placeholder: `{ thinking: ["working"], tool: ["running tool"], followup: ["processing"] }`
  - Merge with any partial phrases from file
  - Write updated config back to agent.json via `fs.writeFileSync`
  - Print `console.warn("agent.json is missing phrases, added placeholders")`
  - Set the full phrases on the config object
- In `src/wardrobe/phrases.ts`:
  - Remove `THINKING_PHRASES`, `TOOL_PHRASES`, `FOLLOWUP_PHRASES` exports
  - Simplify `getPhrases()` to: `return loadAgentConfig().phrases`
  - Keep `pickPhrase()` and `PhrasePools` unchanged
- Update consumers that import the removed exports:
  - `src/channels/cli.ts`: replace `THINKING_PHRASES` etc. with `getPhrases().thinking` etc.
  - `src/channels/teams.ts`: replace `THINKING_PHRASES`, `FOLLOWUP_PHRASES` with `getPhrases().thinking`, `getPhrases().followup`
**Output**: Updated `src/identity.ts`, `src/wardrobe/phrases.ts`, `src/channels/cli.ts`, `src/channels/teams.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 3c: Phrases required in config -- Coverage
**What**: Verify 100% coverage on the new validation logic in `loadAgentConfig()` and simplified `getPhrases()`. Check branches: phrases present, phrases missing, partial phrases.
**Output**: Coverage report
**Acceptance**: 100% coverage on new code, all tests green

---

### ✅ Unit 4a: Shared formatter (format.ts) -- Tests
**Depends on**: Unit 2 (`src/wardrobe/` directory)
**What**: Create `src/__tests__/wardrobe/format.test.ts` with tests for:
- `formatToolResult("read_file", "package.json", true)` returns `"✓ read_file (package.json)"`
- `formatToolResult("read_file", "", true)` returns `"✓ read_file"` (no parens for empty summary)
- `formatToolResult("read_file", "missing.txt", false)` returns `"✗ read_file: missing.txt"`
- `formatKick(1, 1)` returns `"↻ kick"` (no counter when maxKicks is 1)
- `formatKick(1, 3)` returns `"↻ kick 1/3"` (counter when maxKicks > 1)
- `formatKick(2, 3)` returns `"↻ kick 2/3"`
- `formatError(new Error("connection failed"))` returns `"Error: connection failed"`
- `formatError(new Error(""))` handles empty message
**Output**: Failing tests in `src/__tests__/wardrobe/format.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `src/wardrobe/format.ts` doesn't exist

### ✅ Unit 4b: Shared formatter (format.ts) -- Implementation
**What**: Create `src/wardrobe/format.ts`:
```typescript
export function formatToolResult(name: string, summary: string, success: boolean): string {
  if (success) {
    return "✓ " + name + (summary ? " (" + summary + ")" : "")
  }
  return "✗ " + name + ": " + summary
}

export function formatKick(attempt: number, maxKicks: number): string {
  const counter = maxKicks > 1 ? " " + attempt + "/" + maxKicks : ""
  return "↻ kick" + counter
}

export function formatError(error: Error): string {
  return "Error: " + error.message
}
```
**Output**: New `src/wardrobe/format.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 4c: Shared formatter -- Coverage
**What**: Verify 100% coverage on `format.ts`. All branches covered (success/failure, empty summary, counter/no-counter, empty error message).
**Output**: Coverage report
**Acceptance**: 100% coverage, all tests green

---

### ✅ Unit 5: Error severity on ChannelCallbacks (coordinated interface change)
**What**: Breaking interface change -- all call sites and implementations must update together:

Source changes:
- In `src/engine/core.ts` `ChannelCallbacks` interface: change `onError(error: Error): void` to `onError(error: Error, severity: "transient" | "terminal"): void`
- Update all 5 `callbacks.onError()` call sites in `src/engine/core.ts`:
  - Tool loop limit errors → `"terminal"`
  - Context trimmed overflow → `"transient"`
  - Network/retry errors → `"transient"`
  - Outer catch (API/unknown errors) → `"terminal"`
- In `src/channels/cli.ts`: update `onError` callback signature to `(error: Error, severity: "transient" | "terminal")`. Behavior unchanged for now -- always writes to stderr regardless of severity (severity-aware rendering comes in Unit 6).
- In `src/channels/teams.ts`: update `onError` callback signature to `(error: Error, severity: "transient" | "terminal")`. Behavior unchanged for now -- always calls `safeEmit` (severity-aware rendering comes in Unit 7).

Test changes (all in the same commit):
- `src/__tests__/engine/core.test.ts`: update all ~128 `onError` mock signatures to accept severity parameter. Add assertions: "fires onError on API errors" verifies severity `"terminal"`. Add tests for transient (context overflow, network retry) and terminal (tool loop limit) severity values.
- `src/__tests__/channels/cli.test.ts`: update onError test to pass severity parameter
- `src/__tests__/channels/teams.test.ts`: update onError test to pass severity parameter
**Output**: Updated `core.ts`, `cli.ts`, `teams.ts`, and all test files
**Acceptance**: All tests PASS (green), no warnings, 100% coverage on changes

---

### ✅ Unit 6a: CLI uses shared formatter -- Tests
**Depends on**: Unit 4 (format.ts), Unit 5 (error severity)
**What**: Update CLI tests to expect formatted output from shared module:
- `onToolEnd` success test: verify stderr contains `formatToolResult(name, summary, true)` output (green colored)
- `onToolEnd` failure test: verify stderr contains `formatToolResult(name, summary, false)` output (red colored)
- `onKick` test: verify stderr output contains `formatKick()` output (yellow colored)
- `onError` tests: update for severity-aware rendering. Add tests for transient (ephemeral stderr line) vs terminal (permanent stderr line)

Note: the current CLI writes `"✗ name: error"` (literal word "error") on tool failure. The shared formatter will change this to `"✗ name: <actual summary>"` -- this is an intentional improvement, showing the actual tool arg summary on failure instead of a generic word.
**Output**: Failing tests
**Acceptance**: Tests FAIL (red) because CLI not yet refactored

### ✅ Unit 6b: CLI uses shared formatter -- Implementation
**What**: In `src/channels/cli.ts`:
- Add import: `import { formatToolResult, formatKick, formatError } from "../wardrobe/format"`
- `onToolEnd`: The shared formatter returns complete strings with emoji (e.g., `"✓ name (summary)"`). The CLI spinner's `stop(msg)` and `fail(msg)` add their own emoji. To avoid doubling up, call `spinner.stop()` (no arg, just clears the spinner line), then write the formatted string with ANSI colors directly to stderr:
  ```typescript
  onToolEnd: (name: string, argSummary: string, success: boolean) => {
    currentSpinner?.stop()
    currentSpinner = null
    const msg = formatToolResult(name, argSummary, success)
    const color = success ? "\x1b[32m" : "\x1b[31m"
    process.stderr.write(`${color}${msg}\x1b[0m\n`)
  },
  ```
- `onKick`: use `formatKick(attempt, maxKicks)` for the stderr output, with yellow ANSI:
  ```typescript
  onKick: (attempt: number, maxKicks: number) => {
    currentSpinner?.stop()
    currentSpinner = null
    if (textDirty) { process.stdout.write("\n"); textDirty = false }
    process.stderr.write(`\x1b[33m${formatKick(attempt, maxKicks)}\x1b[0m\n`)
  },
  ```
- `onError`: branch on severity:
  - `"transient"`: show ephemeral spinner message (existing behavior -- `spinner.fail()` + continue)
  - `"terminal"`: permanent stderr line with ANSI red
**Output**: Updated `src/channels/cli.ts`
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 6c: CLI shared formatter -- Coverage
**What**: Verify all branches covered: success/failure tool results, kick with/without counter, transient/terminal errors.
**Output**: Coverage report
**Acceptance**: 100% coverage, all tests green

---

### ⬜ Unit 7a: Teams dual-mode rendering + sendMessage -- Tests
**Depends on**: Unit 4 (format.ts), Unit 5 (error severity)
**What**: Add/update tests in `src/__tests__/channels/teams.test.ts`:

Streaming mode (default) tests:
- `onToolEnd` success: calls `stream.emit` with `"\n\n"` + formatted tool result + `"\n\n"` (inline in stream)
- `onToolEnd` failure: calls `stream.emit` with inline formatted error
- `onToolEnd` after abort (stopped): does NOT call `stream.emit`
- `onKick`: calls `stream.emit` with inline formatted kick
- `onKick` after abort: does NOT call `stream.emit`
- `onError` transient: calls `stream.update()` (ephemeral)
- `onError` terminal: calls `stream.emit` with `"\n\n"` + formatted error + `"\n\n"` (inline in stream)
- `onError` after abort: does NOT emit (existing `stopped` guard)

Buffered mode (disableStreaming=true) tests — this is the path non-streaming channels will follow:
- `createTeamsCallbacks` accepts `sendMessage` function parameter
- `onToolEnd` success: calls `sendMessage` with formatted tool result
- `onToolEnd` failure: calls `sendMessage` with formatted error
- `onToolEnd` after abort (stopped): does NOT call `sendMessage`
- `onToolStart` with accumulated text: flushes text buffer via `stream.emit` (first flush) or `sendMessage` (subsequent)
- `onKick`: calls `sendMessage` with formatted kick
- `onKick` after abort: does NOT call `sendMessage`
- `onError` transient: calls `stream.update()` (ephemeral)
- `onError` terminal: calls `sendMessage` with formatted error
- `onError` terminal after abort: does NOT call `sendMessage`
- `flush()` with no prior stream content: first text goes to `stream.emit` (primary output gets real content)
- `flush()` with prior stream content: text goes via `sendMessage`
- `flush()` with no text and no prior stream content: emits "(completed with tool calls only — no text response)"
- `flush()` is async: awaits `sendMessage` for final text

Both modes:
- `onToolStart` unchanged: calls `stream.update()` only (ephemeral)
- `handleTeamsMessage` passes `sendMessage` wrapping `ctx.send()` to `createTeamsCallbacks`
- `TeamsCallbacksWithFlush` type: `flush()` returns `void | Promise<void>`
**Output**: Failing tests
**Acceptance**: Tests FAIL (red) because implementation not yet changed

### ⬜ Unit 7b: Teams dual-mode rendering + sendMessage -- Implementation
**What**: Dual-mode rendering based on Unit 0 manual testing. The pattern is designed for reuse: any channel that lacks streaming uses the buffered path (sendMessage for standalone messages, first text to primary output, subsequent to sendMessage). Future channels (iMessage, Slack, etc.) follow the same pattern — only the `sendMessage` implementation changes.

New state and helpers in `createTeamsCallbacks`:
- Add `sendMessage?: (text: string) => Promise<void>` parameter (after `controller`, before `options`)
- Add `streamHasContent` flag (tracks whether primary output has received content)
- Add `safeSend` helper (like `safeEmit`/`safeUpdate` — catches errors, respects `stopped` flag)
- Add `flushTextBuffer` helper: first flush → `safeEmit` (primary output gets content); subsequent → `safeSend`

Streaming mode (`buffered === false`):
- `onToolEnd`: `safeEmit("\n\n" + formatToolResult(...) + "\n\n")` — tool results inline in stream
- `onKick`: `safeEmit("\n\n" + formatKick(...) + "\n\n")` — kicks inline in stream
- `onError` terminal: `safeEmit("\n\n" + formatError(...) + "\n\n")` — errors inline in stream
- `onError` transient: `safeUpdate(formatError(...))` — ephemeral

Buffered mode (`buffered === true`) — reference implementation for non-streaming channels:
- `onToolStart`: call `flushTextBuffer()` before showing ephemeral tool status
- `onToolEnd`: `safeSend(formatToolResult(...))` — separate message
- `onKick`: `safeSend(formatKick(...))` — separate message
- `onError` terminal: `safeSend(formatError(...))` — separate message
- `onError` transient: `safeUpdate(formatError(...))` — ephemeral
- `flush()`: async — first text → `safeEmit` (so primary output isn't empty); subsequent → `await sendMessage`
- `flush()` fallback: if no primary output content, emit "(completed with tool calls only — no text response)"

Wiring:
- `handleTeamsMessage`: add `sendMessage` parameter, `await callbacks.flush()`
- `app.on("message")`: pass `async (t) => { await ctx.send(t) }` as sendMessage
- Add imports: `import { formatToolResult, formatKick, formatError } from "../wardrobe/format"`
**Output**: Updated `src/channels/teams.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 7c: Teams dual-mode rendering -- Coverage
**What**: Verify all branches: streaming vs buffered, success/failure tool results, kick counter, transient/terminal errors, stopped state for each, first-flush-to-primary vs subsequent-to-sendMessage, no-text-fallback.
**Output**: Coverage report
**Acceptance**: 100% coverage, all tests green

---

### ⬜ Unit 8: Full integration test run
**What**: Run the complete test suite (`npm test`). Verify:
- All tests pass
- No warnings
- 100% coverage on all new and changed code
- No regressions in existing functionality
**Output**: Clean test run
**Acceptance**: `npm test` exits 0, coverage report shows 100% on new code

---

### ⬜ Unit 9: Documentation updates
**What**: Update project documentation:
- `README.md`: update project structure to show `src/wardrobe/` directory with `format.ts` and `phrases.ts`. Remove `phrases.ts` from `src/repertoire/` listing. Add brief description of `wardrobe/` purpose.
- `CONTRIBUTING.md`: if it references `src/repertoire/phrases.ts` or the phrase system, update those references.
- Verify no other docs reference the old path.
**Output**: Updated `README.md`, `CONTRIBUTING.md` (if needed)
**Acceptance**: Docs accurately reflect the new directory structure

---

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (a, b, c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-02-1120-doing-teams-feedback/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-02 13:12 Created from planning doc (pass 1)
- 2026-03-02 13:17 All 4 passes complete, status READY_FOR_EXECUTION
- 2026-03-02 13:44–15:05 **Unit 0 DONE** — extensive manual testing with user (4 tests). Findings documented inline in Unit 0 section. Key decisions: dual-mode rendering architecture, kick detection gaps identified.

- 2026-03-02 15:05–16:30 **Review pass** — consistency and completeness fixes:
  - Unit 1a/1b/1c: renamed to "Kick pattern gaps", added "continues." and "Next up" patterns from Unit 0 findings
  - Unit 3b: added consumer updates (cli.ts, teams.ts) for removed phrase exports
  - Unit 4a: added dependency on Unit 2 (src/wardrobe/ directory)
  - Unit 5: replaced fragile line numbers with descriptive error categories
  - Unit 6a: added dependency on Units 4 and 5
  - Unit 7a/7b/7c: completely rewritten for dual-mode rendering architecture per Unit 0 findings
  - Unit 7b: fixed `\n\n` wrapping consistency for onError terminal
  - Completion criteria updated with Teams-specific dual-mode items
  - Objective updated to reflect dual-mode reality
  - Dependencies added across units
  - Prerequisites section added (build before Unit 0, Unit 5 breaking change coordination)
- 2026-03-02 15:36 Unit 1a complete: Added 10 failing tests for bare "Continuing.", sentence-final "continues.", and "Next up" patterns plus 4 false-negative guards
- 2026-03-02 15:36 Unit 1b complete: Added 3 patterns to TOOL_INTENT_PATTERNS — all 100 tests pass, build clean
- 2026-03-02 15:37 Unit 1c complete: kicks.ts 100% coverage (Stmts/Branch/Funcs/Lines), full suite 874 tests pass
- 2026-03-02 15:38 Unit 2 complete: phrases.ts moved to src/wardrobe/, all 6 import sites updated, 874 tests pass, build clean
- 2026-03-02 15:40 Unit 3a complete: 3 failing tests — identity auto-fill placeholders, warn+write, phrases no hardcoded exports
- 2026-03-02 15:45 Unit 3b complete: AgentConfig.phrases required, auto-fill in loadAgentConfig, getPhrases() simplified, consumers updated (cli.ts, teams.ts), identity mocks added to cli.test.ts/teams.test.ts, 872 tests pass
- 2026-03-02 15:46 Unit 3c complete: identity.ts 100%, wardrobe/phrases.ts 100% (all metrics)
- 2026-03-02 15:46 Unit 4a complete: 8 failing tests for formatToolResult, formatKick, formatError (module doesn't exist yet)
- 2026-03-02 15:47 Units 4b+4c complete: format.ts created, all 8 tests pass, 100% coverage
- 2026-03-02 15:51 Unit 5 complete: onError(error, severity) interface change — 5 call sites, both channels, all test mocks updated atomically. 880 tests pass, build clean
- 2026-03-02 15:53 Unit 6a complete: 3 failing tests for shared formatter (onToolEnd green/red, onError severity branching)
- 2026-03-02 15:55 Units 6b+6c complete: CLI uses shared formatters, severity branching on onError, 881 tests pass, cli.ts 100% lines/funcs
