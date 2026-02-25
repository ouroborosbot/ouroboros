# Doing: Normalize and Improve Reasoning Display Across All Surfaces

**Status**: READY_FOR_EXECUTION
**Execution Mode**: pending
**Created**: 2026-02-24 18:40
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
Not started / In progress / Done / Blocked

### Unit 1: Add onReasoningChunk to ChannelCallbacks interface
**What**: Add `onReasoningChunk(text: string): void` to the `ChannelCallbacks` interface in `src/core.ts`, and mechanically add `onReasoningChunk: () => {}` to all 27 existing `ChannelCallbacks` literal objects in test files so they continue to compile. Also add a no-op `onReasoningChunk` to both adapter implementations (`createCliCallbacks` in `agent.ts`, `createTeamsCallbacks` in `teams.ts`) so the return types satisfy the interface.

This unit is a mechanical, non-behavioral change. No test behavior changes. No logic changes. Just the interface addition and making everything compile.

**Files to change:**
- `src/core.ts` line 381: Add `onReasoningChunk(text: string): void` to `ChannelCallbacks` interface.
- `src/agent.ts` `createCliCallbacks`: Add `onReasoningChunk: () => {}` to returned object.
- `src/teams.ts` `createTeamsCallbacks`: Add `onReasoningChunk: () => {}` to returned object.
- `src/__tests__/core.test.ts`: Add `onReasoningChunk: () => {}` to all 27 callback literals.
- `src/__tests__/cli.test.ts`: No changes needed (it imports from agent.ts which will have the new callback).
- `src/__tests__/teams.test.ts`: No changes needed (teams.ts will have the new callback).

**Acceptance**: `npx tsc --noEmit` passes. All 202 existing tests still pass (no behavioral changes). The new callback exists but is a no-op everywhere.

---

### Unit 2a: Normalize Azure reasoning_content in runAgent -- Tests
**What**: Rewrite the 5 existing Azure `reasoning_content` tests in `core.test.ts` to expect the new behavior: `onReasoningChunk` receives reasoning text, `onTextChunk` receives only answer text, no `<think>` tags anywhere.

Tests to rewrite:
1. "wraps reasoning_content in think tags" -> "calls onReasoningChunk for reasoning_content": stream has `reasoning_content: "thinking hard"` then `content: "answer"`. Expect `onReasoningChunk` receives `["thinking hard"]`, `onTextChunk` receives `["answer"]`.
2. "closes reasoning tag at end of stream if still open" -> "calls onReasoningChunk for reasoning-only stream": stream has only `reasoning_content: "still thinking"`. Expect `onReasoningChunk` receives `["still thinking"]`, `onTextChunk` never called.
3. "fires onModelStreamStart on first reasoning_content token": same setup, verify `onModelStreamStart` fires once on first `reasoning_content` token.
4. "does not re-open think tag for subsequent reasoning chunks" -> "calls onReasoningChunk for each reasoning chunk": two `reasoning_content` chunks. Expect `onReasoningChunk` receives `["step 1", "step 2"]`.
5. "handles multiple reasoning_content chunks before content" -> same: `onReasoningChunk` gets `["step 1 ", "step 2"]`, `onTextChunk` gets `["result"]`.

Also rewrite the existing test "fires onTextChunk for each text delta with raw think tags" (line 585) -- this test sends `<think>` tags as `content` (MiniMax pattern). Move it to Unit 3a scope. For now, just leave it as-is (it will still pass since we haven't changed content handling yet).

**Files to change:**
- `src/__tests__/core.test.ts`: Rewrite the 5 reasoning_content tests.

**Acceptance**: Tests exist and FAIL because `runAgent` still wraps `reasoning_content` in `<think>` tags via `onTextChunk` instead of calling `onReasoningChunk`.

### Unit 2b: Normalize Azure reasoning_content in runAgent -- Implementation
**What**: Refactor the streaming loop in `runAgent` (`src/core.ts` lines 412-463). Replace the Azure `reasoning_content` handling:

Current code (lines 419-431):
```
if (d.reasoning_content) {
  if (!streamStarted) { callbacks.onModelStreamStart(); streamStarted = true }
  if (!inReasoning) { callbacks.onTextChunk("<think>"); inReasoning = true }
  callbacks.onTextChunk(d.reasoning_content);
}
```

Replace with:
```
if (d.reasoning_content) {
  if (!streamStarted) { callbacks.onModelStreamStart(); streamStarted = true }
  callbacks.onReasoningChunk(d.reasoning_content);
}
```

Also remove:
- The `inReasoning` variable (line 412)
- The `</think>` injection on reasoning->content transition (lines 438-441)
- The end-of-stream `</think>` injection (lines 460-463)

**Files to change:**
- `src/core.ts`: Refactor `runAgent` reasoning_content handling as described.

**Acceptance**: All 5 rewritten Azure tests from 2a PASS. All other tests still pass (MiniMax `<think>` tag test at line 585 still passes since content handling is unchanged).

### Unit 2c: Unit 2 -- Coverage and refactor
**What**: Run coverage. Verify all `reasoning_content` code paths covered. Add any missing edge case tests (e.g., empty `reasoning_content` string if it can occur).

**Acceptance**: 100% coverage on runAgent reasoning paths. All tests green.

---

### Unit 3a: Normalize MiniMax inline think tags in runAgent -- Tests
**What**: Rewrite the existing test "fires onTextChunk for each text delta with raw think tags" (line 585) and add new tests. These tests send `<think>` tags as part of `content` (the MiniMax pattern) and verify core routes them to `onReasoningChunk`.

Tests needed:
1. **Single chunk with both**: content `"<think>reasoning</think>answer"` -> `onReasoningChunk` receives `"reasoning"`, `onTextChunk` receives `"answer"`.
2. **Tags split across chunks**: chunks `["<think>", "reasoning", "</think>", "answer"]` as content -> `onReasoningChunk` receives `"reasoning"`, `onTextChunk` receives `"answer"`.
3. **Content-only (no think tags)**: content `"just text"` -> only `onTextChunk("just text")`, `onReasoningChunk` never called.
4. **Think-only content**: content `"<think>only thinking</think>"` -> only `onReasoningChunk("only thinking")`, `onTextChunk` never called.
5. **Multiple think blocks**: content `"<think>a</think>mid<think>b</think>end"` -> `onReasoningChunk("a")`, `onTextChunk("mid")`, `onReasoningChunk("b")`, `onTextChunk("end")`.
6. **Partial tag at chunk boundary**: chunk1=`"some text<thi"`, chunk2=`"nk>reasoning</think>answer"` -> defined behavior needed. Simplest: buffer potential partial tags. Test the chosen behavior.
7. **Think tags split across many chunks**: chunk1=`"<th"`, chunk2=`"ink>"`, chunk3=`"reas"`, chunk4=`"oning</thi"`, chunk5=`"nk>answer"` -> `onReasoningChunk("reasoning")`, `onTextChunk("answer")`.

**Files to change:**
- `src/__tests__/core.test.ts`: Rewrite line 585-606 test, add 6 new tests.

**Acceptance**: Tests exist and FAIL (runAgent still passes `<think>` tags through onTextChunk as raw content).

### Unit 3b: Normalize MiniMax inline think tags in runAgent -- Implementation
**What**: Add a state machine in `runAgent`'s content handling path (around lines 433-444) that detects `<think>` and `</think>` tags within `d.content` chunks and routes text accordingly.

Implementation approach:
- Add `contentBuf: string` and `inThinkTag: boolean` state variables alongside the existing streaming loop state.
- When `d.content` arrives, append to `contentBuf` and run a processing loop:
  - If `inThinkTag`: scan for `</think>`. If found, send text before it to `onReasoningChunk`, advance past tag, set `inThinkTag = false`. If not found, send buffered text to `onReasoningChunk` (it's all reasoning), clear buffer.
  - If not `inThinkTag`: scan for `<think>`. If found, send text before it to `onTextChunk`, advance past tag, set `inThinkTag = true`. If not found but buffer ends with a partial `<` or `<t` etc., keep the potential partial tag in the buffer. Otherwise flush all to `onTextChunk`.
- The `content` variable for message history accumulates the raw `d.content` including tags (unchanged).
- Handle potential partial tag at buffer end: if buffer ends with a prefix of `<think>` or `</think>`, retain it in the buffer for next chunk. On stream end, flush any remaining buffer as content.

**Files to change:**
- `src/core.ts`: Add think-tag parsing state machine in the content handling section of `runAgent`.

**Acceptance**: All 7 MiniMax tests from 3a PASS. Both Azure and MiniMax reasoning flows work. All other tests still pass.

### Unit 3c: Unit 3 -- Coverage and refactor
**What**: Run coverage on the state machine code. Add edge case tests if any branches uncovered: empty content chunks, content that is just `<think>`, content that is just `</think>`, buffer flush at end of stream with partial tag.

**Acceptance**: 100% coverage on all new state machine code. All tests green. No warnings.

---

### Unit 4a: Update CLI adapter for onReasoningChunk -- Tests
**What**: Rewrite the CLI think-tag dimming tests in `src/__tests__/cli.test.ts` (the describe block "CLI adapter - onTextChunk think-tag dimming", lines 49-121).

New tests for the renamed describe block "CLI adapter - onReasoningChunk and onTextChunk rendering":
1. **onTextChunk outputs plain text unchanged** (no dim, no tag parsing): `callbacks.onTextChunk("hello world")` -> stdout contains `"hello world"`, no ANSI dim codes.
2. **onReasoningChunk outputs dim text**: `callbacks.onReasoningChunk("reasoning")` -> stdout contains `\x1b[2m` (dim) and `"reasoning"` and `\x1b[0m` (reset).
3. **Reasoning then content**: `onReasoningChunk("thinking")` then `onTextChunk("answer")` -> dim text followed by normal text.
4. **Multiple reasoning chunks**: two `onReasoningChunk` calls -> both dim.
5. **Content-only**: only `onTextChunk` called -> no dim codes in output.

Remove the old partial-tag-split tests (lines 103-121) -- they tested adapter-level tag parsing which no longer exists.

**Files to change:**
- `src/__tests__/cli.test.ts`: Rewrite the think-tag describe block.

**Acceptance**: Tests exist and FAIL (CLI adapter still has think-tag parsing in onTextChunk, onReasoningChunk is a no-op).

### Unit 4b: Update CLI adapter for onReasoningChunk -- Implementation
**What**: Refactor `createCliCallbacks` in `src/agent.ts` (lines 103-153):
1. Remove the `buf`, `inThink`, and `flush` function used for think-tag parsing.
2. Simplify `onTextChunk` to: `process.stdout.write(text)`.
3. Replace the no-op `onReasoningChunk` with: `process.stdout.write(\`\x1b[2m${text}\x1b[0m\`)`.

**Files to change:**
- `src/agent.ts`: Refactor `createCliCallbacks`.

**Acceptance**: All CLI tests from 4a PASS. Dim rendering via `onReasoningChunk`. Direct write via `onTextChunk`. No tag parsing.

### Unit 4c: Unit 4 -- Coverage and refactor
**What**: Run coverage on CLI adapter. Verify no dead code remains from the old flush/buf/inThink logic.

**Acceptance**: 100% coverage on `createCliCallbacks`. All tests green.

---

### Unit 5a: Update Teams adapter for onReasoningChunk -- Tests
**What**: Rewrite Teams think-tag tests in `src/__tests__/teams.test.ts`. The describe block "Teams adapter - createTeamsCallbacks (SDK-delegated streaming)" needs these changes:

**Remove these tests** (no longer applicable):
- "think tags stripped, visible text emitted" (line 183)
- "think tags split across chunks" (line 192)
- "content that is only think tags does not emit" (line 207)
- "leading whitespace trimmed after think block" (line 218)
- "preserves whitespace after first real content" (line 227)

**Add new tests:**
1. **onReasoningChunk calls stream.update()**: `callbacks.onReasoningChunk("analyzing code")` -> `mockStream.update` called with `"analyzing code"`.
2. **Multiple reasoning chunks each call update()**: two `onReasoningChunk` calls -> `mockStream.update` called twice.
3. **onReasoningChunk after stop (403) does not call update()**: emit throws 403, then `onReasoningChunk` -> `mockStream.update` NOT called.
4. **onReasoningChunk when update() throws (403) aborts controller**: `mockStream.update` throws, `onReasoningChunk` called -> `controller.signal.aborted` is true.
5. **onTextChunk calls stream.emit() directly**: `callbacks.onTextChunk("hello")` -> `mockStream.emit` called with `"hello"`. No think-tag processing.

**Keep these existing tests unchanged** (they still apply):
- "onModelStart sends thinking status update" (line 83)
- "emits text delta directly to stream" (line 100)
- "emits each chunk as a delta" (line 108)
- All stop-streaming tests (lines 122-155)
- All tool/status callback tests (lines 241-279)

**Also**: Remove the `stripThinkTags` tests (lines 32-68) and the export test for it (line 25) if we decide to remove the function in 5b.

**Files to change:**
- `src/__tests__/teams.test.ts`: Remove think-tag tests, add onReasoningChunk tests.

**Acceptance**: Tests exist and FAIL (Teams adapter onReasoningChunk is still a no-op, onTextChunk still has think-tag parsing).

### Unit 5b: Update Teams adapter for onReasoningChunk -- Implementation
**What**: Refactor `createTeamsCallbacks` in `src/teams.ts` (lines 31-127):
1. Remove state variables: `inThink`, `thinkBuf`, `emittedContent`.
2. Simplify `onTextChunk` to just: `if (stopped) return; safeEmit(text)`.
3. Replace the no-op `onReasoningChunk` with: `if (stopped) return; safeUpdate(text)`.
4. Keep `onModelStart` sending `"thinking..."` via `safeUpdate()`.
5. Remove `stripThinkTags` function (now dead code -- core handles tag parsing).

**Files to change:**
- `src/teams.ts`: Refactor `createTeamsCallbacks`, remove `stripThinkTags`.

**Acceptance**: All Teams tests from 5a PASS. Reasoning goes through `stream.update()`. Answer goes through `stream.emit()`. No think-tag parsing in adapter.

### Unit 5c: Unit 5 -- Coverage and refactor
**What**: Run coverage on Teams adapter. Verify `stripThinkTags` is removed and no dead code remains. Clean up any unused imports or variables.

**Acceptance**: 100% coverage on `createTeamsCallbacks`. All tests green. No warnings.

---

### Unit 6: Final validation
**What**: Run full test suite, coverage, and type checks. Verify the normalization is complete end-to-end.

**Verification steps:**
1. `npx vitest run` -- all tests pass
2. `npx vitest run --coverage` -- 100% on all changed files (core.ts, agent.ts, teams.ts)
3. `npx tsc --noEmit` -- no type errors
4. `git diff --stat` -- review all changed files
5. Grep verification: no `<think>` tag handling in adapters (`agent.ts`, `teams.ts`)
6. Grep verification: no `<think>` tag generation in core (`core.ts` -- no synthetic tag wrapping)
7. Grep verification: `onReasoningChunk` is implemented in both adapters and called from `runAgent`
8. Verify the `content` variable in `runAgent` still accumulates full raw content for message history (including any think tags from MiniMax)

**Acceptance**: All tests pass. 100% coverage. No type errors. No warnings. Clean diff. Normalization complete -- adapters are provider-agnostic.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1, 2a, 2b, 2c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-24-1816-doing-reasoning-display/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-02-24 18:40 Created from planning doc
