# Doing: Kick Mechanism & tool_choice Required Mode

**Status**: pending
**Execution Mode**: direct
**Created**: 2026-02-26 19:45
**Planning**: ./2026-02-26-1909-planning-kick-and-tool-required.md

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Fix the agent proactivity bug where the model narrates tool-use intent ("let me read that file") but fails to produce actual `tool_calls`. Implement two complementary mechanisms: (1) a "kick" that detects narrated intent and re-prompts the model, and (2) an optional `tool_choice: "required"` mode with a sentinel `final_answer` tool for graceful text-only responses.

## Completion Criteria
- [ ] Kick mechanism detects tool-intent phrases in text-only responses and re-prompts
- [ ] Kick mechanism does not save the malformed assistant message to conversation history
- [ ] Kick attempts are capped (configurable, default 1) and count against `MAX_TOOL_ROUNDS`
- [ ] `onKick` callback fires on each kick so the CLI can show feedback
- [ ] `final_answer` tool exists with `{ answer: string }` schema
- [ ] `tool_choice: "required"` is passed to both Azure Responses API and MiniMax Chat Completions API when enabled
- [ ] Calling `final_answer` extracts the text and terminates the loop cleanly
- [ ] `final_answer` + other tool calls edge case: rejection message, loop continues
- [ ] `/tool-required` slash command toggles the mode on/off in CLI
- [ ] System prompt includes `final_answer` tool guidance when mode is active
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

### ✅ Unit 1: Kick Mechanism

**What**: Implement the kick mechanism in `src/engine/core.ts` that detects when the model narrates tool-use intent (e.g., "let me read that file") but fails to produce actual `tool_calls`, and re-prompts the model.

**Files to touch**:
- `src/engine/core.ts` — kick detection, self-correction injection, `onKick` callback, `maxKicks` option
- `src/__tests__/engine/core.test.ts` — all kick tests

**Implementation details**:
- After the model responds with text but no `tool_calls` (line 230: `if (!result.toolCalls.length)`), scan `result.content` for tool-intent phrases using regex: "let me", "I'll", "I will", "I'm going to", "going to", "I am going to", "I would like to", "I want to" (case-insensitive)
- If intent detected AND kick budget remaining: do NOT push the malformed assistant message to `messages` (pop it or skip the push), inject a user-role self-correction message `{ role: "user", content: "I narrated instead of acting. Calling the tool now." }`, increment kick counter, count against `toolRounds`, and loop again
- Cap kick attempts at configurable max (default 1) via `maxKicks` in options object
- Export a `hasToolIntent(text: string): boolean` function for testability
- Add `onKick` to `ChannelCallbacks` interface: `onKick(attempt: number, maxKicks: number): void`
- Add `options?` as 5th parameter to `runAgent`: `runAgent(messages, callbacks, channel, signal, options?)` where `options = { toolChoiceRequired?: boolean; maxKicks?: number }`
- Kick attempts count against `MAX_TOOL_ROUNDS` budget (increment `toolRounds` on each kick)

**Tests to write first** (red phase):
1. `hasToolIntent` returns true for each intent phrase ("let me", "I'll", "I will", "I'm going to", "going to", "I am going to", "I would like to", "I want to")
2. `hasToolIntent` returns false for text without intent phrases ("Hello", "Here is the result", "The file contains...")
3. `hasToolIntent` is case-insensitive ("LET ME", "i'll")
4. When model responds with text containing intent phrase and no tool_calls, `onKick` fires, malformed message is NOT in history, and model is called again
5. When model responds with text containing intent phrase but `maxKicks` (default 1) already exhausted, kick does NOT fire, normal termination occurs
6. Kick increments `toolRounds` — verify that kicks + tool rounds together respect `MAX_TOOL_ROUNDS`
7. The self-correction user message `"I narrated instead of acting. Calling the tool now."` is pushed to messages before the retry
8. When `maxKicks` is set to 0 via options, no kicks occur
9. When `maxKicks` is set to 2 via options, up to 2 kicks can occur
10. `onKick` callback is optional (no crash if not provided in callbacks)

**Acceptance criteria**:
- All kick tests pass (green)
- `hasToolIntent` is exported and tested independently
- `onKick` fires with correct attempt/maxKicks counts
- Malformed assistant messages never appear in conversation history after a kick
- Existing tests pass (no regressions) — existing `runAgent` call sites work since `options` is optional
- 100% coverage on all new kick code

---

### ⬜ Unit 2: final_answer Tool & tool_choice Required Plumbing

**What**: Add the `final_answer` sentinel tool, plumb `tool_choice: "required"` through both streaming paths, and handle `final_answer` interception in the agent loop.

**Files to touch**:
- `src/engine/tools.ts` — `final_answer` tool definition (line ~124, in `tools` array)
- `src/engine/streaming.ts` — `tool_choice` passthrough in `streamChatCompletion` (line 96) and `streamResponsesApi` (line 236)
- `src/engine/core.ts` — `final_answer` interception in the tool execution section (line ~243), conditional injection of `final_answer` into tools list, `tool_choice: "required"` in API params
- `src/__tests__/engine/tools.test.ts` — `final_answer` tool definition tests
- `src/__tests__/engine/streaming.test.ts` — `tool_choice` passthrough tests
- `src/__tests__/engine/core.test.ts` — `final_answer` interception tests, `toolChoiceRequired` option tests

**Implementation details**:
- **`final_answer` tool definition** in `tools.ts`: `{ type: "function", function: { name: "final_answer", description: "provide your final text response when you have no more tools to call", parameters: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] } } }`. This tool is NOT in the default `tools` array — it is only injected when `toolChoiceRequired` is active.
- **`tool_choice` passthrough**: `streamChatCompletion` already receives `createParams` which is spread into the API call — if `tool_choice` is in `createParams`, it passes through naturally. For `streamResponsesApi`, same: `createParams` is spread. No streaming changes needed — just pass `tool_choice` in the createParams from `core.ts`.
- **In `core.ts`**: When `options?.toolChoiceRequired` is true:
  - Inject `final_answer` tool into the tools list: `const activeTools = options?.toolChoiceRequired ? [...tools, finalAnswerTool] : tools`
  - Add `tool_choice: "required"` to the createParams for both providers
  - For Azure Responses API, `tool_choice` format is `"required"` (string) in the createParams
  - For MiniMax Chat Completions, `tool_choice` is `"required"` (string) in createParams
- **`final_answer` interception** (in the tool execution loop, line ~243):
  - **Sole call**: If `result.toolCalls.length === 1` and `result.toolCalls[0].name === "final_answer"`, extract `answer` from args, push assistant message with `content: answer` (not the original `result.content`), set `done = true`, skip tool execution. The assistant message pushed should have the `final_answer` content, not the tool_call.
  - **Mixed call**: If `result.toolCalls` contains `final_answer` alongside other tool calls, execute all other tools normally. For `final_answer`, push a tool result message: `{ role: "tool", tool_call_id: tc.id, content: "rejected: final_answer must be the only tool call. Finish your work first, then call final_answer alone." }`. Do NOT set `done = true`. Loop continues.

**Tests to write first** (red phase):
1. `final_answer` tool definition has correct name, description, and `{ answer: string }` schema (test the exported constant/function)
2. When `toolChoiceRequired` is true, `tool_choice: "required"` is passed in createParams to MiniMax `streamChatCompletion`
3. When `toolChoiceRequired` is true, `tool_choice: "required"` is passed in createParams to Azure `streamResponsesApi`
4. When `toolChoiceRequired` is true, `final_answer` tool is included in the tools list sent to the API
5. When `toolChoiceRequired` is false/undefined, `final_answer` tool is NOT in the tools list
6. When `final_answer` is the sole tool call, the answer text is extracted and treated as assistant content, `done = true`
7. When `final_answer` is called alongside other tool calls, other tools execute normally, `final_answer` gets a rejection tool result, loop continues
8. When `final_answer` has empty/missing `answer` arg, handle gracefully (use empty string or `result.content`)
9. `toolChoiceRequired` option defaults to false (no `tool_choice` in API params when not set)
10. Verify `final_answer` tool is never passed to `execTool` (it's intercepted before execution)

**Acceptance criteria**:
- All tool_choice/final_answer tests pass (green)
- `tool_choice: "required"` is correctly passed to both providers when enabled
- `final_answer` sole-call terminates the loop cleanly with extracted answer
- `final_answer` mixed-call gets rejected, loop continues
- Existing tests pass (no regressions)
- 100% coverage on all new code

---

### ⬜ Unit 3: CLI Integration

**What**: Wire up the `/tool-required` slash command, update the system prompt with `final_answer` guidance when the mode is active, and connect the `onKick` callback in the CLI.

**Files to touch**:
- `src/repertoire/commands.ts` — `/tool-required` command registration
- `src/channels/cli.ts` — `onKick` callback in `createCliCallbacks`, pass `toolChoiceRequired` state to `runAgent` options, system prompt update
- `src/mind/prompt.ts` — `buildSystem` accepts optional `toolChoiceRequired` flag, adds `final_answer` tool guidance section
- `src/__tests__/repertoire/commands.test.ts` — `/tool-required` command tests
- `src/__tests__/channels/cli-main.test.ts` — `onKick` display, `toolChoiceRequired` toggle flow
- `src/__tests__/mind/prompt.test.ts` — system prompt `final_answer` guidance tests

**Implementation details**:
- **`/tool-required` command** in `commands.ts`: Register a new command `tool-required` with `channels: ["cli"]`. The handler returns `{ action: "response", message: "tool-required mode: ON" }` or `"tool-required mode: OFF"`. The toggle state needs to live outside the command handler — use a module-level `let toolChoiceRequired = false` in `cli.ts` that the command toggles.
- **CLI `onKick` callback**: Add `onKick` to `createCliCallbacks` return. When fired, show a spinner message like `"kick ${attempt}/${maxKicks}: re-prompting..."` or just a stderr message: `"\x1b[33mkick ${attempt}/${maxKicks}\x1b[0m\n"`.
- **Pass options to `runAgent`**: In `cli.ts` `main()`, when calling `runAgent`, pass `{ toolChoiceRequired }` as the 5th argument (options).
- **System prompt `final_answer` guidance**: In `prompt.ts` `buildSystem`, accept an optional `options?: { toolChoiceRequired?: boolean }` parameter. When `toolChoiceRequired` is true, append a section:
  ```
  ## tool behavior
  tool_choice is set to "required" — you MUST call a tool on every turn.
  when you have finished all work and want to give a text response, call the `final_answer` tool with your response text.
  `final_answer` must be the ONLY tool call in that turn. do not combine it with other tool calls.
  ```
- **`cachedBuildSystem` update**: The cache in `context.ts` needs to account for the `toolChoiceRequired` flag (different prompt for on vs off). Either add it to the cache key or clear the cache when the flag changes.

**Tests to write first** (red phase):
1. `/tool-required` command toggles between ON and OFF, returns correct response messages
2. `/tool-required` is CLI-only (channels: `["cli"]`)
3. `onKick` callback in CLI callbacks writes kick status to stderr
4. `onKick` callback handles attempt=1/maxKicks=1, attempt=1/maxKicks=2, etc.
5. When `toolChoiceRequired` is true, `buildSystem` output includes the `final_answer` tool guidance section
6. When `toolChoiceRequired` is false/undefined, `buildSystem` output does NOT include the guidance section
7. `runAgent` is called with `{ toolChoiceRequired: true }` when the toggle is on
8. `runAgent` is called with `{ toolChoiceRequired: false }` or no options when the toggle is off

**Acceptance criteria**:
- `/tool-required` slash command works in CLI, shows in `/commands` output
- `onKick` callback displays kick feedback to user
- System prompt includes `final_answer` guidance when mode is active
- `toolChoiceRequired` state is passed through to `runAgent` options
- Existing tests pass (no regressions)
- 100% coverage on all new code

---

### ⬜ Unit 4: Integration Testing & Cleanup

**What**: End-to-end scenarios combining kick + tool_choice required, edge cases, verify all tests pass with 100% coverage, and clean up.

**Files to touch**:
- `src/__tests__/engine/core.test.ts` — integration/combination tests
- Any files needing coverage gaps filled

**Implementation details**:
- **Kick + tool_choice required combined**: Test that when both features are active, kick still fires on tool-intent narration (even though `tool_choice: "required"` should prevent it, the kick is a safety net)
- **Kick + final_answer**: Test that if the model narrates intent but then on the retry produces a `final_answer` call, it terminates cleanly
- **MAX_TOOL_ROUNDS with kicks**: Test that kicks + tool rounds + final_answer all interact correctly with the `MAX_TOOL_ROUNDS` budget
- **Abort during kick**: Test that aborting during a kick attempt stops cleanly
- **Edge cases**:
  - Empty `result.content` with no tool_calls (no kick, normal termination)
  - Intent phrase in tool result text (should NOT trigger kick — kick only looks at model text response)
  - `final_answer` with very long answer text
  - `final_answer` called when `toolChoiceRequired` is false (tool should not be in list, but if somehow called, handle gracefully)
- **Coverage verification**: Run full test suite with coverage, confirm 100% on all new/modified code in `core.ts`, `tools.ts`, `streaming.ts`, `prompt.ts`, `cli.ts`, `commands.ts`
- **Cleanup**: Remove any TODO comments, verify no dead code, ensure consistent code style

**Tests to write first** (red phase):
1. Kick fires when `toolChoiceRequired` is true and model narrates intent
2. After kick, model returns `final_answer` — terminates cleanly
3. `MAX_TOOL_ROUNDS` budget accounts for kicks + tool rounds together
4. Abort during kick attempt — clean stop, no dangling messages
5. Empty content with no tool_calls — normal termination, no kick
6. Intent phrase only in model content triggers kick, not in tool results
7. `final_answer` with long text — full text preserved
8. Coverage gaps identified during testing — add targeted tests

**Acceptance criteria**:
- All integration/combination tests pass
- All edge cases covered
- Full test suite passes: 0 failures, 0 warnings
- 100% coverage on ALL new code across all modified files
- All completion criteria from planning doc checked off
- No TODO comments left (except intentional future work)

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit complete
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-26-1909-doing-kick-and-tool-required/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-02-26 19:45 Created from planning doc (4-unit breakdown)
- 2026-02-26 20:09 Unit 1 complete: hasToolIntent + kick mechanism with 12 new tests, 100% line coverage on core.ts
