# Doing: Teams Channel Feedback — Multi-Message, Shared Formatting, Error Severity, Phrases Config

**Status**: drafting
**Execution Mode**: direct
**Created**: 2026-03-02 13:12
**Planning**: ./2026-03-02-1120-planning-teams-feedback.md
**Artifacts**: ./2026-03-02-1120-doing-teams-feedback/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Fix three Teams bot channel issues and improve the presentation architecture: (1) tool/kick results are ephemeral and vanish -- they should be separate persistent messages, (2) bare "Continuing." text doesn't trigger a narration kick, (3) text from successive loop iterations concatenates into one blob -- each iteration's output should be its own message bubble, (4) errors should be classified by severity so channels can render them appropriately, and (5) presentation code (phrases, formatting) should live in a dedicated shared directory with phrases required in agent config rather than hardcoded.

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
- [ ] Early manual testing with user confirms `ctx.send()` behavior alongside open stream
- [ ] Teams `onToolEnd` sends standalone message via `sendMessage` callback
- [ ] Teams `onToolStart` remains ephemeral via `stream.update()` only
- [ ] Teams `onKick` sends standalone message via `sendMessage` callback
- [ ] Teams `onError`: transient = ephemeral (`stream.update()`), terminal = standalone (`sendMessage`)
- [ ] Teams multi-message: tool results, kicks, terminal errors appear as separate chat bubbles
- [ ] `TOOL_INTENT_PATTERNS` includes anchored pattern for bare "Continuing." / "continuing"
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

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

---

### ⬜ Unit 0: Manual testing -- ctx.send() alongside open stream
**What**: Build a minimal test in `src/channels/teams.ts` that sends a standalone message via `ctx.send()` while the stream is still open. Deploy to live Teams and verify with user.
- Add a temporary hardcoded `ctx.send("test standalone message")` call inside `onToolEnd` in `handleTeamsMessage`, right after the existing `safeUpdate` call
- Run the bot in Teams, trigger a tool call, observe whether the standalone message appears as a separate chat bubble alongside the streaming message
- Test both scenarios: (a) stream has text emitted, (b) stream has no text emitted (model returned only tool calls)
**Output**: Confirmed behavior documented in this doing doc's progress log. Either approach 3 (send alongside, preferred) or approach 2 (close-and-send, fallback) is selected.
**Acceptance**: User confirms message ordering is correct in live Teams. Decision is documented and all subsequent units can proceed.

---

### ⬜ Unit 1a: "Continuing." kick pattern -- Tests
**What**: Add test cases to `src/__tests__/engine/kicks.test.ts`:
- `hasToolIntent("Continuing.")` returns `true`
- `hasToolIntent("continuing")` returns `true`
- `hasToolIntent("Continuing")` returns `true`
- `hasToolIntent("continuing.")` returns `true`
- `detectKick("Continuing.")` returns `{ reason: "narration", ... }`
- `hasToolIntent("the process is continuing as expected")` returns `false` (anchored pattern must not match mid-sentence)
- `hasToolIntent("Continuing the work on the project")` returns `false`
**Output**: Failing tests in `src/__tests__/engine/kicks.test.ts`
**Acceptance**: Tests exist and FAIL (red) because pattern not yet added

### ⬜ Unit 1b: "Continuing." kick pattern -- Implementation
**What**: Add `/^continuing\.?$/i` to the `TOOL_INTENT_PATTERNS` array in `src/engine/kicks.ts`
**Output**: Updated `src/engine/kicks.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 1c: "Continuing." kick pattern -- Coverage
**What**: Verify 100% coverage on the new pattern. Run full test suite.
**Output**: Coverage report confirms full coverage
**Acceptance**: 100% coverage on new code, all tests green, no warnings

---

### ⬜ Unit 2: Move phrases.ts to src/wardrobe/ (mechanical refactor)
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

### ⬜ Unit 3a: Phrases required in agent config -- Tests
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

### ⬜ Unit 3b: Phrases required in agent config -- Implementation
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
**Output**: Updated `src/identity.ts`, `src/wardrobe/phrases.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 3c: Phrases required in config -- Coverage
**What**: Verify 100% coverage on the new validation logic in `loadAgentConfig()` and simplified `getPhrases()`. Check branches: phrases present, phrases missing, partial phrases.
**Output**: Coverage report
**Acceptance**: 100% coverage on new code, all tests green

---

### ⬜ Unit 4a: Shared formatter (format.ts) -- Tests
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

### ⬜ Unit 4b: Shared formatter (format.ts) -- Implementation
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

### ⬜ Unit 4c: Shared formatter -- Coverage
**What**: Verify 100% coverage on `format.ts`. All branches covered (success/failure, empty summary, counter/no-counter, empty error message).
**Output**: Coverage report
**Acceptance**: 100% coverage, all tests green

---

### ⬜ Unit 5: Error severity on ChannelCallbacks (coordinated interface change)
**What**: Breaking interface change -- all call sites and implementations must update together:

Source changes:
- In `src/engine/core.ts` line 82: change `onError(error: Error): void` to `onError(error: Error, severity: "transient" | "terminal"): void`
- Update all 5 call sites in `src/engine/core.ts`:
  - Line 270: `callbacks.onError(new Error("tool loop limit..."), "terminal")`
  - Line 309: `callbacks.onError(new Error("tool loop limit..."), "terminal")`
  - Line 385: `callbacks.onError(new Error("context trimmed..."), "transient")`
  - Line 392: `callbacks.onError(new Error("network error..."), "transient")`
  - Line 406: `callbacks.onError(e instanceof Error ? e : new Error(String(e)), "terminal")`
- In `src/channels/cli.ts`: update `onError` callback signature to `(error: Error, severity: "transient" | "terminal")`. Behavior unchanged for now -- always writes to stderr regardless of severity (severity-aware rendering comes in Unit 6).
- In `src/channels/teams.ts`: update `onError` callback signature to `(error: Error, severity: "transient" | "terminal")`. Behavior unchanged for now -- always calls `safeEmit` (severity-aware rendering comes in Unit 7).

Test changes (all in the same commit):
- `src/__tests__/engine/core.test.ts`: update all ~128 `onError` mock signatures to accept severity parameter. Add assertions: "fires onError on API errors" verifies severity `"terminal"`. Add tests for transient (context overflow, network retry) and terminal (tool loop limit) severity values.
- `src/__tests__/channels/cli.test.ts`: update onError test to pass severity parameter
- `src/__tests__/channels/teams.test.ts`: update onError test to pass severity parameter
**Output**: Updated `core.ts`, `cli.ts`, `teams.ts`, and all test files
**Acceptance**: All tests PASS (green), no warnings, 100% coverage on changes

---

### ⬜ Unit 6a: CLI uses shared formatter -- Tests
**What**: Update CLI tests to expect formatted output from shared module:
- `onToolEnd` success test: verify spinner.stop called with `formatToolResult()` output
- `onToolEnd` failure test: verify spinner.fail called with formatted output
- `onKick` test: verify stderr output uses `formatKick()` output
- `onError` tests: update for severity-aware rendering. Add tests for transient (spinner message) vs terminal (permanent stderr)
**Output**: Failing tests
**Acceptance**: Tests FAIL (red) because CLI not yet refactored

### ⬜ Unit 6b: CLI uses shared formatter -- Implementation
**What**: In `src/channels/cli.ts`:
- Add import: `import { formatToolResult, formatKick, formatError } from "../wardrobe/format"`
- `onToolEnd`: use `formatToolResult(name, argSummary, success)` for both `spinner.stop()` and `spinner.fail()`
- `onKick`: use `formatKick(attempt, maxKicks)` for the stderr output
- `onError`: branch on severity:
  - `"transient"`: `currentSpinner?.fail(formatError(error))` + continue (spinner handles it)
  - `"terminal"`: `currentSpinner?.fail("request failed")` + `process.stderr.write(...)` with ANSI red
**Output**: Updated `src/channels/cli.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 6c: CLI shared formatter -- Coverage
**What**: Verify all branches covered: success/failure tool results, kick with/without counter, transient/terminal errors.
**Output**: Coverage report
**Acceptance**: 100% coverage, all tests green

---

### ⬜ Unit 7a: Teams multi-message + sendMessage -- Tests
**What**: Add/update tests in `src/__tests__/channels/teams.test.ts`:
- `createTeamsCallbacks` accepts `sendMessage` function parameter
- `onToolEnd` success: calls `sendMessage` with formatted tool result string
- `onToolEnd` failure: calls `sendMessage` with formatted error string
- `onToolEnd` after abort (stopped): does NOT call `sendMessage`
- `onKick(1, 1)`: calls `sendMessage` with `"↻ kick"`
- `onKick(1, 3)`: calls `sendMessage` with `"↻ kick 1/3"`
- `onKick` after abort: does NOT call `sendMessage`
- `onError` transient: calls `stream.update()` (ephemeral), NOT `sendMessage`
- `onError` terminal: calls `sendMessage`, NOT `stream.update()`
- `onError` terminal after abort: does NOT call `sendMessage`
- `onToolStart` unchanged: calls `stream.update()` only (no `sendMessage`)
- `handleTeamsMessage` passes `sendMessage` wrapping `ctx.send()` to `createTeamsCallbacks`
**Output**: Failing tests
**Acceptance**: Tests FAIL (red) because implementation not yet changed

### ⬜ Unit 7b: Teams multi-message + sendMessage -- Implementation
**What**:
- Update `createTeamsCallbacks` signature: add `sendMessage: (text: string) => Promise<void>` parameter (after `controller`, before `options`)
- Add `safeSend` helper (like `safeEmit`/`safeUpdate` -- catches errors, respects `stopped` flag):
  ```typescript
  function safeSend(text: string): void {
    if (stopped) return
    try {
      catchAsync(sendMessage(text))
    } catch {
      markStopped()
    }
  }
  ```
- `onToolEnd`: replace `safeUpdate` with `safeSend(formatToolResult(name, summary, success))`. Keep `safeUpdate` only for ephemeral status while tool is running (that's `onToolStart`'s job, not `onToolEnd`'s).
- Add `onKick`:
  ```typescript
  onKick: (attempt: number, maxKicks: number) => {
    stopPhraseRotation()
    safeSend(formatKick(attempt, maxKicks))
  },
  ```
- `onError`: branch on severity:
  ```typescript
  onError: (error: Error, severity: "transient" | "terminal") => {
    stopPhraseRotation()
    if (stopped) return
    if (severity === "transient") {
      safeUpdate(formatError(error))
    } else {
      safeSend(formatError(error))
    }
  },
  ```
- In `handleTeamsMessage`: pass `sendMessage` when creating callbacks:
  ```typescript
  const sendMessage = async (text: string) => { await ctx.send(text) }
  const callbacks = createTeamsCallbacks(stream, controller, sendMessage, { disableStreaming, conversationId })
  ```
  Note: `ctx.send` needs to be passed into `handleTeamsMessage` -- update the function signature and the call site in `app.on("message")`.
- Add imports: `import { formatToolResult, formatKick, formatError } from "../wardrobe/format"`
**Output**: Updated `src/channels/teams.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 7c: Teams multi-message -- Coverage
**What**: Verify all branches: success/failure tool results, kick counter, transient/terminal errors, stopped state for each, buffered mode interaction with sendMessage.
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
