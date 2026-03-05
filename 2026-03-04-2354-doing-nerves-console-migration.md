# Doing: Replace console.* calls with emitNervesEvent

**Status**: drafting
**Execution Mode**: direct
**Created**: 2026-03-04 23:57
**Planning**: ./2026-03-04-2354-planning-nerves-console-migration.md
**Artifacts**: ./2026-03-04-2354-doing-nerves-console-migration/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Eliminate all `console.log/warn/error` calls from production source files by converting them to structured `emitNervesEvent()` calls, and register the new events in the nerves coverage contract so the CI audit gate passes.

## Completion Criteria
- [ ] Zero `console.*` calls in `src/senses/teams.ts`, `src/heart/core.ts`, `src/mind/friends/resolver.ts`
- [ ] The one `console.warn` in `src/identity.ts` is removed (nerves event already exists there)
- [ ] All new events registered in `REQUIRED_EVENTS` in `contract.ts`
- [ ] `npm run test:coverage` passes (nerves audit gate green)
- [ ] No sensitive data (tokens, secrets) in event meta (respect SENSITIVE_PATTERNS)
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

### ⬜ Unit 0: Setup
**What**: Create branch (already done: `ouroboros/nerves-console-migration`). Verify existing tests pass. Identify all console.* calls to convert and confirm count matches planning (14 calls across 4 files).
**Output**: Baseline test run passes. Console call inventory confirmed.
**Acceptance**: `npm test` passes. Grep confirms exactly 14 console.* calls in target files.

### ⬜ Unit 1a: identity.ts -- Tests
**What**: No new tests needed. This is a pure deletion of a redundant `console.warn` on line 169 of `src/identity.ts`. The nerves event already exists on lines 170-176. Existing tests already cover the nerves event. Verify the existing test for the "missing phrases" path still passes after deletion.
**Output**: Confirmation that existing tests cover this path.
**Acceptance**: Existing identity tests pass and cover the missing-phrases branch.

### ⬜ Unit 1b: identity.ts -- Implementation
**What**: Delete `console.warn("agent.json is missing phrases, added placeholders")` from line 169 of `src/identity.ts`.
**Output**: `src/identity.ts` with zero console.* calls.
**Acceptance**: `grep -c 'console\.' src/identity.ts` returns 0. Tests pass.

### ⬜ Unit 2a: resolver.ts -- Tests
**What**: Write a test in `src/__tests__/mind/friends/resolver.test.ts` that verifies when `store.put()` throws, `emitNervesEvent` is called with `{ component: "friends", event: "friends.persist_error", level: "error" }`. The test must mock `../../nerves/runtime` to capture the call. The test should FAIL initially because resolver.ts still uses console.error.
**Output**: Failing test for friends.persist_error event.
**Acceptance**: Test exists, runs, and FAILS (red) because emitNervesEvent is not called yet.

### ⬜ Unit 2b: resolver.ts -- Implementation
**What**: In `src/mind/friends/resolver.ts`, replace `console.error("failed to persist friend record:", err)` with `emitNervesEvent({ level: "error", event: "friends.persist_error", component: "friends", message: "failed to persist friend record", meta: { reason: err instanceof Error ? err.message : String(err) } })`. Add import for `emitNervesEvent` from `../../nerves/runtime`.
**Output**: `src/mind/friends/resolver.ts` with zero console.* calls.
**Acceptance**: Test from 2a passes (green). No console.* in file.

### ⬜ Unit 2c: resolver.ts -- Coverage & Refactor
**What**: Verify 100% coverage on the new emitNervesEvent call. Refactor if needed.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 3a: core.ts -- Tests
**What**: Write/update tests in `src/__tests__/heart/core.test.ts` for the two `getProviderRuntime()` fatal error paths. Currently these test `console.error` via spies. Update them to verify `emitNervesEvent` is called with `{ component: "engine", event: "engine.provider_init_error", level: "error" }` instead. Tests should FAIL initially.
**Output**: Failing tests for engine.provider_init_error event (two paths: resolve() throws, resolve() returns null).
**Acceptance**: Tests exist, run, and FAIL (red).

### ⬜ Unit 3b: core.ts -- Implementation
**What**: In `src/heart/core.ts` `getProviderRuntime()`, replace the two `console.error(...)` calls with `emitNervesEvent({ level: "error", event: "engine.provider_init_error", component: "engine", message: ..., meta: {} })`. The `emitNervesEvent` import already exists in core.ts.
**Output**: `src/heart/core.ts` with zero console.* calls.
**Acceptance**: Tests from 3a pass (green). No console.* in file.

### ⬜ Unit 3c: core.ts -- Coverage & Refactor
**What**: Verify 100% coverage on the new emitNervesEvent calls. Refactor if needed.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 4a: teams.ts -- Tests (verify-state + message received)
**What**: Write/update tests in `src/__tests__/senses/teams.test.ts` for the verify-state and message-received console calls. Replace `vi.spyOn(console, "log/warn")` assertions with `emitNervesEvent` mock assertions. New events:
- `channel.verify_state` (info for success, warn for all-failed)
- `channel.message_received` (info)
Tests should FAIL initially because teams.ts still uses console.*.
**Output**: Failing tests for verify_state and message_received events.
**Acceptance**: Tests exist, run, and FAIL (red).

### ⬜ Unit 4b: teams.ts -- Implementation (verify-state + message received)
**What**: In `src/senses/teams.ts`:
1. Add `import { emitNervesEvent } from "../nerves/runtime"`
2. Replace `console.log('[teams] verify-state succeeded...')` with emitNervesEvent (info, channel.verify_state)
3. Replace `console.warn('[teams] verify-state failed...')` with emitNervesEvent (warn, channel.verify_state)
4. Replace `console.log('[teams] msg from=...')` with emitNervesEvent (info, channel.message_received)
**Output**: 3 console.* calls replaced.
**Acceptance**: Tests from 4a pass (green).

### ⬜ Unit 4c: teams.ts -- Tests (token status + signin)
**What**: Write/update tests for token-status and signin console calls:
- `channel.token_status` (info) -- replaces console.log for graph/ado/github token status
- `channel.signin_result` (info) -- replaces console.log for signin success
- `channel.signin_error` (error) -- replaces console.error for signin failure
Tests should FAIL initially.
**Output**: Failing tests for token_status, signin_result, signin_error events.
**Acceptance**: Tests exist, run, and FAIL (red).

### ⬜ Unit 4d: teams.ts -- Implementation (token status + signin)
**What**: Replace 3 console.* calls for token/signin:
1. `console.log('[teams] tokens: graph=...')` -> emitNervesEvent (info, channel.token_status, meta: { graph: bool, ado: bool, github: bool })
2. `console.log('[teams] signin(${cn}): ...')` -> emitNervesEvent (info, channel.signin_result)
3. `console.error('[teams] signin(${cn}) failed: ...')` -> emitNervesEvent (error, channel.signin_error)
**Output**: 3 more console.* calls replaced.
**Acceptance**: Tests from 4c pass (green).

### ⬜ Unit 4e: teams.ts -- Tests (error handlers + startup)
**What**: Write/update tests for remaining console calls:
- `channel.handler_error` (error) -- replaces console.error for handler errors
- `channel.unhandled_rejection` (error) -- replaces console.error for unhandled rejections
- `channel.app_error` (error) -- replaces console.error for app.event("error")
- `channel.app_started` (info) -- replaces console.log for startup banner
Tests should FAIL initially.
**Output**: Failing tests for handler_error, unhandled_rejection, app_error, app_started events.
**Acceptance**: Tests exist, run, and FAIL (red).

### ⬜ Unit 4f: teams.ts -- Implementation (error handlers + startup)
**What**: Replace final 4 console.* calls:
1. `console.error('[teams] handler error: ...')` -> emitNervesEvent (error, channel.handler_error)
2. `console.error('[teams] unhandled rejection: ...')` -> emitNervesEvent (error, channel.unhandled_rejection)
3. `console.error('[teams] app error: ...')` -> emitNervesEvent (error, channel.app_error)
4. `console.log('Teams bot started on port ...')` -> emitNervesEvent (info, channel.app_started, meta: { port, mode })
**Output**: `src/senses/teams.ts` with zero console.* calls.
**Acceptance**: Tests from 4e pass (green). No console.* in file.

### ⬜ Unit 4g: teams.ts -- Coverage & Refactor
**What**: Verify 100% coverage on all new emitNervesEvent calls in teams.ts. Clean up any remaining console spy mocks in tests that are no longer needed.
**Acceptance**: 100% coverage on new code, tests still green, no stale console spies.

### ⬜ Unit 5a: contract.ts -- Tests
**What**: Write a test that verifies all new events are present in `REQUIRED_EVENTS`. The test should import `getRequiredEventKeys()` and assert that the new event keys are included:
- `channels:channel.verify_state`
- `channels:channel.message_received`
- `channels:channel.token_status`
- `channels:channel.signin_result`
- `channels:channel.signin_error`
- `channels:channel.handler_error`
- `channels:channel.unhandled_rejection`
- `channels:channel.app_error`
- `channels:channel.app_started`
- `engine:engine.provider_init_error`
- `friends:friends.persist_error`
Test should FAIL initially because contract.ts hasn't been updated yet.
**Output**: Failing test for new required events.
**Acceptance**: Test exists, runs, and FAILS (red).

### ⬜ Unit 5b: contract.ts -- Implementation
**What**: Add 11 new entries to `REQUIRED_EVENTS` in `src/nerves/coverage/contract.ts`.
**Output**: Updated contract with all new required events.
**Acceptance**: Test from 5a passes (green).

### ⬜ Unit 5c: contract.ts -- Coverage & Refactor
**What**: Verify coverage. The contract is a data-only file so coverage is trivially 100%.
**Acceptance**: Coverage passes, tests green.

### ⬜ Unit 6: Final Gate -- Full Test Suite + Nerves Audit
**What**: Run the full test suite (`npm test`) and nerves coverage gate (`npm run test:coverage`). Verify:
1. All tests pass
2. No warnings
3. Nerves audit passes (all required events observed)
4. Zero console.* calls in target files (grep verification)
**Output**: Clean test run, clean audit, zero console.* in target files.
**Acceptance**: `npm test` exits 0. `npm run test:coverage` exits 0. `grep -r 'console\.' src/senses/teams.ts src/heart/core.ts src/mind/friends/resolver.ts src/identity.ts` returns only allowed patterns (identity.ts should have zero).

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-04-2354-doing-nerves-console-migration/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-04 23:57 Created from planning doc
- 2026-03-04 23:59 Completed 4 conversion passes (first draft, granularity, validation, quality)
