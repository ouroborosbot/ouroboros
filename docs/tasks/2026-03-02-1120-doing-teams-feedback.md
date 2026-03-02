# Doing: Teams Channel Feedback Improvements

**Status**: drafting
**Execution Mode**: direct
**Created**: PENDING
**Planning**: ./2026-03-02-1120-planning-teams-feedback.md
**Artifacts**: ./2026-03-02-1120-doing-teams-feedback/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Fix three Teams bot channel issues: (1) tool/kick results are ephemeral and vanish instead of persisting in the message, (2) bare "Continuing." text doesn't trigger a narration kick, and (3) text from successive agent loop iterations concatenates without spacing.

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

### ⬜ Unit 1a: "Continuing." kick pattern -- Tests
**What**: Add test cases to `src/__tests__/engine/kicks.test.ts` for the new "continuing" pattern:
- `hasToolIntent("Continuing.")` returns `true`
- `hasToolIntent("continuing")` returns `true`
- `hasToolIntent("Continuing")` returns `true`
- `hasToolIntent("continuing.")` returns `true`
- Verify `detectKick("Continuing.")` returns `{ reason: "narration", ... }`
- Ensure existing non-intent texts like `"the process is continuing as expected"` still return `false` (the pattern must be anchored: `^continuing\.?$`)
**Output**: Failing tests in `src/__tests__/engine/kicks.test.ts`
**Acceptance**: Tests exist and FAIL (red) because pattern not yet added

### ⬜ Unit 1b: "Continuing." kick pattern -- Implementation
**What**: Add `/^continuing\.?$/i` to the `TOOL_INTENT_PATTERNS` array in `src/engine/kicks.ts`
**Output**: Updated `src/engine/kicks.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 1c: "Continuing." kick pattern -- Coverage & Refactor
**What**: Verify 100% coverage on the new pattern. Ensure no regressions.
**Output**: Coverage report confirming full coverage
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 2a: Teams onToolEnd permanent feedback -- Tests
**What**: Update existing tests and add new tests in `src/__tests__/channels/teams.test.ts`:
- Update `"onToolEnd updates status with result summary"` test: now expects `stream.emit` called with `"\n\n✓ read_file (package.json)\n\n"` AND `stream.update` still called
- Update `"onToolEnd handles empty summary"` test: now expects `stream.emit` called with `"\n\n✓ get_current_time\n\n"` (no parenthesized summary)
- Update `"onToolEnd handles failure"` test: now expects `stream.emit` called with `"\n\n✗ read_file: missing.txt\n\n"`
- Add test: `onToolEnd` respects stopped state (no emit after abort)
- Add test: `onToolEnd` in buffered mode (`disableStreaming: true`) still calls `safeEmit` directly (not buffered)
**Output**: Failing tests in `src/__tests__/channels/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because implementation not yet changed

### ⬜ Unit 2b: Teams onToolEnd permanent feedback -- Implementation
**What**: In `src/channels/teams.ts`, update the `onToolEnd` callback:
```typescript
onToolEnd: (name: string, summary: string, success: boolean) => {
  stopPhraseRotation()
  if (success) {
    safeUpdate(summary || `${name} done`)
    safeEmit("\n\n✓ " + name + (summary ? " (" + summary + ")" : "") + "\n\n")
  } else {
    safeUpdate(`${name} failed: ${summary}`)
    safeEmit("\n\n✗ " + name + ": " + summary + "\n\n")
  }
},
```
**Output**: Updated `src/channels/teams.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 2c: Teams onToolEnd permanent feedback -- Coverage & Refactor
**What**: Verify 100% coverage on the updated `onToolEnd`. Check success/failure/empty-summary/stopped/buffered branches.
**Output**: Coverage report confirming full coverage
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 3a: Teams onKick callback -- Tests
**What**: Add tests to `src/__tests__/channels/teams.test.ts`:
- `onKick` is defined on the callbacks object
- `onKick(1, 1)` calls `stream.emit` with `"\n\n↻ kick\n\n"` (no counter when maxKicks is 1)
- `onKick(1, 3)` calls `stream.emit` with `"\n\n↻ kick 1/3\n\n"` (counter when maxKicks > 1)
- `onKick` after abort (stopped state) does not emit
- `onKick` stops phrase rotation
**Output**: Failing tests in `src/__tests__/channels/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `onKick` not yet implemented

### ⬜ Unit 3b: Teams onKick callback -- Implementation
**What**: In `src/channels/teams.ts`, add `onKick` to the returned callbacks object:
```typescript
onKick: (attempt: number, maxKicks: number) => {
  stopPhraseRotation()
  const counter = maxKicks > 1 ? ` ${attempt}/${maxKicks}` : ""
  safeEmit("\n\n↻ kick" + counter + "\n\n")
},
```
Place it after `onToolEnd` and before `onError` in the returned object.
**Output**: Updated `src/channels/teams.ts`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 3c: Teams onKick callback -- Coverage & Refactor
**What**: Verify 100% coverage on the new `onKick` callback. Ensure counter branch (maxKicks > 1 vs == 1), stopped state, and phrase rotation stop are all covered.
**Output**: Coverage report confirming full coverage
**Acceptance**: 100% coverage on new code, tests still green

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-02-1120-doing-teams-feedback/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- PENDING Created from planning doc
