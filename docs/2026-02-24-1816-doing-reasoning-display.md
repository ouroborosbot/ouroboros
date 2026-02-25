# Doing: Normalize and Improve Reasoning Display Across All Surfaces

**Status**: drafting
**Execution Mode**: pending
**Created**: (pending initial commit)
**Planning**: ./2026-02-24-1816-planning-reasoning-display.md
**Artifacts**: ./2026-02-24-1816-doing-reasoning-display/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Normalize how reasoning/thinking tokens are handled at the model-calling level so that downstream adapters (CLI, Teams) receive a clean, provider-agnostic reasoning signal. Different models send reasoning differently (Azure: `reasoning_content` field, MiniMax: inline `<think>` tags in content) -- core should normalize this so adapters never deal with provider-specific reasoning formats.

## Completion Criteria
- [ ] Core normalizes reasoning from both providers into a single interface -- adapters never see `<think>` tags or `reasoning_content`
- [ ] CLI adapter displays reasoning in dim text, separated from answer content
- [ ] Teams adapter routes reasoning through `stream.update()` (informative) and answer through `stream.emit()` (streaming)
- [ ] Both Azure `reasoning_content` and MiniMax inline `<think>` tag patterns are handled
- [ ] All existing tests updated to reflect new structure
- [ ] New tests cover: both providers, both adapters, edge cases (split chunks, empty reasoning, reasoning-only responses)
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
- Not started -- In progress -- Done -- Blocked

### Unit 1a: Add onReasoningChunk to ChannelCallbacks -- Tests
**What**: Write failing tests that assert `ChannelCallbacks` has an `onReasoningChunk` callback. Update ALL existing test files that construct `ChannelCallbacks` objects to include the new callback (they will fail because the interface does not yet have it, but the tests themselves define the expectation).

**Files to change:**
- `src/__tests__/core.test.ts`: Every `ChannelCallbacks` literal (approx 25 instances across all describe blocks) needs `onReasoningChunk: () => {}` or a capturing spy. The 6 reasoning-specific tests (lines 585-606, 1090-1261) need to be rewritten: instead of expecting `<think>` tags in `onTextChunk`, they should expect raw reasoning text in `onReasoningChunk` and only answer text in `onTextChunk`.
- `src/__tests__/cli.test.ts`: The think-tag dimming tests (lines 49-121) need to be rewritten to test the new `onReasoningChunk` callback rendering dim text directly, rather than parsing `<think>` tags from `onTextChunk`.
- `src/__tests__/teams.test.ts`: The think-tag stripping tests (lines 183-225) need to be rewritten to test that `onReasoningChunk` calls `stream.update()` with reasoning text, and `onTextChunk` calls `stream.emit()` without any think-tag parsing. The "thinking..." test (line 83-88) changes: `onModelStart` should still send an initial "thinking..." but `onReasoningChunk` sends actual reasoning text via `update()`.

**Acceptance**: Tests compile but FAIL because `ChannelCallbacks` does not yet have `onReasoningChunk`, and `runAgent` still sends `<think>` tags through `onTextChunk`.

### Unit 1b: Add onReasoningChunk to ChannelCallbacks -- Implementation
**What**: Add `onReasoningChunk(text: string): void` to the `ChannelCallbacks` interface in `src/core.ts` (line 378-385). This is a one-line interface change.

**Files to change:**
- `src/core.ts`: Add `onReasoningChunk(text: string): void` to `ChannelCallbacks` interface.

**Acceptance**: TypeScript compiles. Tests that only check the interface shape pass. Tests that check behavior still fail (implementation not done yet).

### Unit 1c: Verify and refactor Unit 1
**What**: Ensure all tests from 1a that only check the interface shape now pass. Fix any type errors. No behavior changes yet.

**Acceptance**: `npx tsc --noEmit` passes. Interface-shape tests pass. Behavioral tests still fail (expected).

---

### Unit 2a: Normalize Azure reasoning_content in runAgent -- Tests
**What**: Write/update tests in `core.test.ts` that verify `runAgent` calls `onReasoningChunk` (not `onTextChunk`) for Azure `reasoning_content` deltas. Specifically rewrite the following existing tests:

1. "wraps reasoning_content in think tags" (line 1090) -> "calls onReasoningChunk for reasoning_content" -- expects `onReasoningChunk` to receive `"thinking hard"` and `onTextChunk` to receive `"answer"`, with NO `<think>` tags anywhere.
2. "closes reasoning tag at end of stream if still open" (line 1112) -> "calls onReasoningChunk for reasoning-only stream" -- expects `onReasoningChunk` to receive `"still thinking"`, `onTextChunk` not called.
3. "fires onModelStreamStart on first reasoning_content token" (line 1196) -- same behavior, just ensure `onReasoningChunk` is used.
4. "does not re-open think tag for subsequent reasoning chunks" (line 1217) -> "calls onReasoningChunk for each reasoning chunk" -- expects `onReasoningChunk` called twice with `"step 1"` and `"step 2"`.
5. "handles multiple reasoning_content chunks before content" (line 1240) -> expects `onReasoningChunk` for reasoning, then `onTextChunk` for content.

**Files to change:**
- `src/__tests__/core.test.ts`: Rewrite the 5 reasoning_content tests listed above.

**Acceptance**: Tests exist and FAIL (runAgent still sends `<think>` tags through onTextChunk).

### Unit 2b: Normalize Azure reasoning_content in runAgent -- Implementation
**What**: Refactor the streaming loop in `runAgent` (core.ts lines 419-431, 438-441, 460-463) to call `callbacks.onReasoningChunk(d.reasoning_content)` directly instead of wrapping in `<think>` tags and sending through `onTextChunk`. Remove the `inReasoning` state tracking and synthetic tag injection.

**Files to change:**
- `src/core.ts`: In `runAgent`, replace the `reasoning_content` handling block (lines 419-431) to call `callbacks.onReasoningChunk(d.reasoning_content)`. Remove the `</think>` injection when transitioning from reasoning to content (lines 438-441). Remove the end-of-stream `</think>` injection (lines 460-463). Remove the `inReasoning` variable.

**Acceptance**: All Azure reasoning_content tests from 2a PASS. `onReasoningChunk` receives raw reasoning text. `onTextChunk` receives only answer content, no `<think>` tags. Existing non-reasoning tests still pass.

### Unit 2c: Unit 2 -- Coverage and refactor
**What**: Verify 100% coverage on changed `runAgent` code. Ensure edge cases: reasoning-only stream (no content), content-only stream (no reasoning), mixed stream, empty reasoning_content.

**Acceptance**: 100% coverage on runAgent reasoning paths. All tests green.

---

### Unit 3a: Normalize MiniMax inline think tags in runAgent -- Tests
**What**: Write/update the test "fires onTextChunk for each text delta with raw think tags" (line 585) and add new tests that verify `runAgent` parses inline `<think>...</think>` tags from MiniMax `content` deltas and routes them to `onReasoningChunk`.

New tests needed:
1. MiniMax content with `<think>reasoning</think>answer` in a single chunk -> `onReasoningChunk("reasoning")`, `onTextChunk("answer")`.
2. MiniMax think tags split across chunks: chunk1=`<think>`, chunk2=`reasoning`, chunk3=`</think>`, chunk4=`answer` -> `onReasoningChunk("reasoning")`, `onTextChunk("answer")`.
3. MiniMax content-only (no think tags) -> only `onTextChunk` called.
4. MiniMax think-only content (no answer) -> only `onReasoningChunk` called.
5. MiniMax partial think tag at chunk boundary: chunk1=`<thi`, chunk2=`nk>reasoning</think>answer` -> needs defined behavior (either buffer or flush partial as content).
6. MiniMax multiple think blocks: `<think>a</think>mid<think>b</think>end` -> `onReasoningChunk("a")`, `onTextChunk("mid")`, `onReasoningChunk("b")`, `onTextChunk("end")`.

**Files to change:**
- `src/__tests__/core.test.ts`: Rewrite line 585-606 test and add 5+ new tests.

**Acceptance**: Tests exist and FAIL (runAgent still passes `<think>` tags through `onTextChunk`).

### Unit 3b: Normalize MiniMax inline think tags in runAgent -- Implementation
**What**: Add a state machine in `runAgent`'s content handling path (around line 433-444) that detects `<think>` and `</think>` tags within `d.content` and routes the text between them to `onReasoningChunk` while routing text outside them to `onTextChunk`. This needs to handle tags split across streaming chunks.

Implementation approach: maintain a buffer and `inThink` boolean state within the streaming loop. When `d.content` arrives, append to buffer and process: text outside `<think>...</think>` goes to `onTextChunk`, text inside goes to `onReasoningChunk`. Only the `content` variable (used for message history) should accumulate the full raw content including tags.

**Files to change:**
- `src/core.ts`: Add think-tag parsing state machine in the content handling section of `runAgent`.

**Acceptance**: All MiniMax think-tag tests from 3a PASS. Both Azure and MiniMax reasoning flows work. All existing tests still pass.

### Unit 3c: Unit 3 -- Coverage and refactor
**What**: Verify 100% coverage on the new state machine code. Test edge cases: empty content, tags at start/end, adjacent tags, nested-looking patterns (which should not occur but should not crash).

**Acceptance**: 100% coverage. All tests green. No warnings.

---

### Unit 4a: Update CLI adapter for onReasoningChunk -- Tests
**What**: Rewrite the CLI think-tag dimming tests in `cli.test.ts` (lines 49-121). The new tests should verify:
1. `onReasoningChunk` renders text in dim (`\x1b[2m...\x1b[0m`) on stdout.
2. `onTextChunk` renders text normally on stdout (no dim, no think-tag parsing).
3. Reasoning followed by content: dim text then normal text.
4. Multiple reasoning chunks: all dim.
5. Content-only: normal rendering (same as before).

The `onTextChunk` flush loop with think-tag parsing should be gone -- `onTextChunk` just writes directly.

**Files to change:**
- `src/__tests__/cli.test.ts`: Rewrite describe block "CLI adapter - onTextChunk think-tag dimming" to test `onReasoningChunk` and simplified `onTextChunk`.

**Acceptance**: Tests exist and FAIL (CLI adapter still parses think tags in onTextChunk, does not implement onReasoningChunk).

### Unit 4b: Update CLI adapter for onReasoningChunk -- Implementation
**What**: Refactor `createCliCallbacks` in `agent.ts` (lines 103-153):
1. Remove the `buf`/`inThink`/`flush` think-tag parsing from `onTextChunk`. Replace with direct `process.stdout.write(text)`.
2. Add `onReasoningChunk` handler that writes dim text: `process.stdout.write(\`\x1b[2m${text}\x1b[0m\`)`.

**Files to change:**
- `src/agent.ts`: Refactor `createCliCallbacks` -- simplify `onTextChunk`, add `onReasoningChunk`.

**Acceptance**: All CLI tests from 4a PASS. `onReasoningChunk` renders dim. `onTextChunk` renders normal. No think-tag parsing in the adapter.

### Unit 4c: Unit 4 -- Coverage and refactor
**What**: Verify 100% coverage on CLI adapter changes. Clean up any dead code.

**Acceptance**: 100% coverage. All tests green.

---

### Unit 5a: Update Teams adapter for onReasoningChunk -- Tests
**What**: Rewrite Teams think-tag tests in `teams.test.ts`:
1. Remove the "think tags stripped" tests (lines 183-213) -- no longer applicable.
2. Remove the "leading whitespace trimmed after think block" test (line 218) -- no longer applicable (no think blocks in onTextChunk).
3. Add new tests for `onReasoningChunk`:
   - `onReasoningChunk` calls `stream.update()` with the reasoning text.
   - Multiple reasoning chunks each call `stream.update()`.
   - `onReasoningChunk` after stream stop (403) does not call `stream.update()`.
   - `onReasoningChunk` when `update()` throws (403) sets stopped and aborts controller.
4. Update `onTextChunk` tests: verify it calls `stream.emit()` directly (no think-tag parsing, no thinkBuf).
5. Keep the "onModelStart sends thinking..." test (line 83-88) -- initial status before any tokens arrive.

Also update `stripThinkTags` tests: if the function is still exported (for backward compat or other uses), keep tests. If removed, remove tests.

**Files to change:**
- `src/__tests__/teams.test.ts`: Rewrite/remove think-tag tests, add `onReasoningChunk` tests.

**Acceptance**: Tests exist and FAIL (Teams adapter still strips think tags, does not implement onReasoningChunk).

### Unit 5b: Update Teams adapter for onReasoningChunk -- Implementation
**What**: Refactor `createTeamsCallbacks` in `teams.ts` (lines 31-127):
1. Remove the `inThink`/`thinkBuf`/`emittedContent` state and the think-tag parsing loop from `onTextChunk`. Replace with direct `safeEmit(text)`.
2. Add `onReasoningChunk` handler that calls `safeUpdate(text)` to send reasoning as informative typing activities.
3. Keep `onModelStart` sending "thinking..." as the initial status.
4. Evaluate whether `stripThinkTags` is still needed. If not, remove it.

**Files to change:**
- `src/teams.ts`: Refactor `createTeamsCallbacks` -- simplify `onTextChunk`, add `onReasoningChunk`, potentially remove `stripThinkTags`.

**Acceptance**: All Teams tests from 5a PASS. Reasoning goes through `stream.update()`. Answer goes through `stream.emit()`. No think-tag parsing in adapter.

### Unit 5c: Unit 5 -- Coverage and refactor
**What**: Verify 100% coverage on Teams adapter changes. Remove dead code (stripThinkTags if unused). Clean up imports.

**Acceptance**: 100% coverage. All tests green. No warnings.

---

### Unit 6: Final validation
**What**: Run full test suite. Verify all 100%+ coverage. Run `npx tsc --noEmit` for type safety. Verify no warnings. Review that the ChannelCallbacks interface change is backward-compatible (any external consumers would need updating -- check if any exist).

**Verification steps:**
1. `npx vitest run` -- all tests pass
2. `npx vitest run --coverage` -- 100% on all changed files
3. `npx tsc --noEmit` -- no type errors
4. `git diff --stat` -- review all changed files
5. Verify: no `<think>` tag handling remains in adapters (agent.ts, teams.ts)
6. Verify: no `<think>` tag generation remains in core (core.ts)
7. Verify: `onReasoningChunk` is the sole channel for reasoning in both directions

**Acceptance**: All tests pass. 100% coverage. No type errors. No warnings. Clean diff.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-24-1816-doing-reasoning-display/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- (pending initial commit) Created from planning doc
