# Doing: Migrate Azure GPT Path to OpenAI Responses API

**Status**: drafting
**Execution Mode**: pending
**Created**: (pending first commit)
**Planning**: ./2026-02-24-1949-planning-responses-api-migration.md
**Artifacts**: ./2026-02-24-1949-doing-responses-api-migration/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Migrate the Azure provider path in `runAgent()` from the Chat Completions API to the OpenAI Responses API to unlock reasoning summaries, while keeping MiniMax on Chat Completions. The `ChannelCallbacks` interface remains unchanged -- adapters are isolated from API details.

## Completion Criteria
- [ ] Azure path in `runAgent()` calls `client.responses.create()` with streaming, `store: false`, and `include: ["reasoning.encrypted_content"]`
- [ ] MiniMax path in `runAgent()` continues calling `client.chat.completions.create()` with streaming, unchanged
- [ ] Tool definitions are correctly converted to Responses API `FunctionTool` format for Azure calls
- [ ] Conversation messages are correctly converted to Responses API `input` format for Azure calls, with system prompt via `instructions` parameter
- [ ] Azure streaming events (`response.output_text.delta`, `response.function_call_arguments.delta`, `response.reasoning_summary.delta`) are correctly parsed and routed to callbacks
- [ ] Reasoning summaries are delivered via `callbacks.onReasoningChunk()` on the Azure path
- [ ] Reasoning items (with encrypted content) are tracked and re-submitted in subsequent Azure turns for reasoning continuity
- [ ] Tool results are correctly submitted back as `function_call_output` items on the Azure path
- [ ] Multi-turn tool-use loops work correctly on both providers (model calls tool, gets result, calls another tool or produces final text)
- [ ] MiniMax think-tag state machine continues to work unchanged
- [ ] `ChannelCallbacks` interface is unchanged -- no adapter changes needed
- [ ] Shared code (tool execution, callback dispatch, abort handling, tool-use loop control) is not duplicated across provider paths
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
- Not started -- Out of scope / blocked -- In progress -- Done -- Blocked

### Unit 1a: Tool Definition Converter -- Tests
**What**: Write tests for a `toResponsesTools()` function that converts the existing `OpenAI.ChatCompletionTool[]` array to Responses API `FunctionTool[]` format. Test cases:
- Converts a single tool correctly (`{ type: "function", function: { name, description, parameters } }` to `{ type: "function", name, description, parameters, strict: false }`)
- Converts all 10 tools in the `tools` array
- Handles tool with no description (should be `null`)
- Handles tool with no parameters (should be `null`)
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `toResponsesTools` does not exist yet

### Unit 1b: Tool Definition Converter -- Implementation
**What**: Implement `toResponsesTools()` in `core.ts`. Pure function, no side effects. Maps each `ChatCompletionTool` to `FunctionTool` format:
```typescript
export function toResponsesTools(chatTools: OpenAI.ChatCompletionTool[]): any[] {
  return chatTools.map(t => ({
    type: "function" as const,
    name: t.function.name,
    description: t.function.description ?? null,
    parameters: t.function.parameters ?? null,
    strict: false,
  }))
}
```
**Output**: `toResponsesTools` exported from `core.ts`
**Acceptance**: All Unit 1a tests PASS (green), no warnings

### Unit 1c: Tool Definition Converter -- Coverage & Refactor
**What**: Verify 100% coverage on `toResponsesTools`. Refactor if needed.
**Acceptance**: 100% coverage on new code, tests still green

### Unit 2a: Message-to-Input Converter -- Tests
**What**: Write tests for a `toResponsesInput()` function that converts `ChatCompletionMessageParam[]` to `{ instructions: string, input: ResponseInput }`. Test cases:
- Extracts system message into `instructions`, excludes it from `input`
- Converts user messages to `EasyInputMessage` with `role: "user"`
- Converts assistant messages (text only) to `EasyInputMessage` with `role: "assistant"`
- Converts assistant messages with tool_calls to `ResponseFunctionToolCall` items (mapping `tool_call.id` to `call_id`, `tool_call.function.name` to `name`, `tool_call.function.arguments` to `arguments`)
- Converts tool messages to `ResponseFunctionToolCallOutputItem` items (mapping `tool_call_id` to `call_id`, `content` to `output`)
- Handles conversation with no system message (instructions should be empty string)
- Handles mixed multi-turn conversation (system, user, assistant, tool, user, assistant)
- Preserves message order
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 2b: Message-to-Input Converter -- Implementation
**What**: Implement `toResponsesInput()` in `core.ts`. Takes the canonical `messages` array and optional `azureInputItems` (for reasoning item re-submission), returns `{ instructions, input }`. Logic:
- Find first system message, extract content as `instructions`
- For remaining messages, convert based on role:
  - `user` -> `{ role: "user", content }`
  - `assistant` (text only) -> `{ role: "assistant", content }`
  - `assistant` (with tool_calls) -> one `{ role: "assistant", content }` if content exists, plus one `ResponseFunctionToolCall` per tool_call
  - `tool` -> `{ type: "function_call_output", call_id, output }`
- If `azureInputItems` is provided, append those items (reasoning items, etc.) to the input array. These take precedence over the converted messages for items that overlap (same turn's output items)
**Output**: `toResponsesInput` exported from `core.ts`
**Acceptance**: All Unit 2a tests PASS (green)

### Unit 2c: Message-to-Input Converter -- Coverage & Refactor
**What**: Verify 100% coverage. Add edge case tests if needed (empty messages array, assistant with empty content and tool_calls, etc.)
**Acceptance**: 100% coverage, tests green

### Unit 3a: Responses API Stream Processing -- Tests
**What**: Write tests for Azure-path stream processing in `runAgent()`. This requires updating the mock to support `client.responses.create` when Azure env vars are set. Test cases:
- Azure provider calls `client.responses.create` (not `client.chat.completions.create`)
- Passes correct params: `model`, `input`, `instructions`, `tools` (converted), `stream: true`, `store: false`, `include: ["reasoning.encrypted_content"]`, `reasoning: { effort: "medium", summary: "auto" }`
- `response.output_text.delta` events route to `callbacks.onTextChunk()`
- `response.reasoning_summary.delta` events route to `callbacks.onReasoningChunk()`
- `response.output_text.delta` fires `onModelStreamStart` on first token (exactly once)
- `response.reasoning_summary.delta` fires `onModelStreamStart` on first reasoning token
- Text-only response (no tool calls) ends the loop
- Empty/null events are skipped gracefully
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 3b: Responses API Stream Processing -- Implementation
**What**: In `runAgent()`, branch on `provider === "azure"` to use `client.responses.create()` with the Responses API streaming format. The stream is `AsyncIterable<ResponseStreamEvent>`. Process events:
- `response.output_text.delta` -> `callbacks.onTextChunk(event.delta)`, accumulate content
- `response.reasoning_summary.delta` -> `callbacks.onReasoningChunk(event.delta)` (note: `delta` is typed as `unknown`, cast to string)
- `response.output_item.added` where `item.type === "function_call"` -> start tracking tool call (name from item, accumulate arguments)
- `response.function_call_arguments.delta` -> accumulate arguments for current tool call
- `response.output_item.done` where `item.type === "function_call"` -> finalize tool call (name, arguments, call_id)
- `response.output_item.done` where `item.type === "reasoning"` -> capture for re-submission
- Fire `onModelStreamStart` on first text or reasoning event
- After stream ends: if tool calls present, execute them (shared tool execution code); otherwise mark done
The MiniMax path (Chat Completions) should remain completely unchanged.
**Output**: Azure path in `runAgent()` processes Responses API streaming events
**Acceptance**: All Unit 3a tests PASS (green), all existing MiniMax tests still pass

### Unit 3c: Responses API Stream Processing -- Coverage & Refactor
**What**: Verify coverage. Add tests for edge cases:
- Stream with no events
- Event with unknown type (should be ignored)
- Mixed reasoning and text events
- `onModelStreamStart` fires exactly once even with mixed event types
**Acceptance**: 100% coverage on new stream processing code, tests green

### Unit 4a: Tool Call Handling in Responses API -- Tests
**What**: Write tests for tool call execution and result submission on the Azure Responses API path. Test cases:
- `response.output_item.added` with `type: "function_call"` starts tool tracking
- `response.function_call_arguments.delta` accumulates arguments
- `response.output_item.done` with `type: "function_call"` finalizes tool call with `call_id`, `name`, `arguments`
- After stream ends with tool calls: `callbacks.onToolStart` and `callbacks.onToolEnd` fire for each tool
- Tool results are submitted as `function_call_output` items in next turn's input
- Multiple tool calls in single response are handled correctly
- Tool execution error is captured and submitted as result
- Tool-use loop: model calls tool, gets result, responds with text (2-turn loop)
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 4b: Tool Call Handling in Responses API -- Implementation
**What**: Implement tool call handling for the Azure Responses API path:
- Track tool calls from stream events: `output_item.added` (type function_call) initializes, `function_call_arguments.delta` accumulates, `output_item.done` (type function_call) finalizes
- After stream: for each tool call, execute via shared `execTool()` and callback pattern
- Build `function_call_output` items: `{ type: "function_call_output", call_id: tc.call_id, output: result }`
- Append output items + tool results to the Azure input array for next loop iteration
- Also append equivalent messages to the canonical `messages` array for conversation history parity
- Loop continues (not done) when tool calls are present
**Output**: Full tool-use loop working on Azure path
**Acceptance**: All Unit 4a tests PASS (green), existing tests still pass

### Unit 4c: Tool Call Handling -- Coverage & Refactor
**What**: Verify coverage on tool handling code. Add edge cases:
- Tool with malformed JSON arguments (should handle gracefully like MiniMax path)
- Tool call with empty arguments
- Tool call with `call_id` missing (defensive coding)
**Acceptance**: 100% coverage, tests green

### Unit 5a: Reasoning Item Re-submission -- Tests
**What**: Write tests for reasoning item tracking and re-submission across turns. Test cases:
- After Azure response with reasoning item, the reasoning item (with encrypted_content) is included in the next turn's input
- After Azure response with tool calls, reasoning items from that response are preserved and re-submitted alongside tool results
- Multi-turn conversation: reasoning items accumulate correctly across turns
- Response output items (message, function_call) are also re-submitted correctly
- Reasoning items are NOT tracked/submitted on MiniMax path (no-op)
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 5b: Reasoning Item Re-submission -- Implementation
**What**: Implement reasoning item tracking:
- After each Azure Responses API stream completes, collect all `response.output_item.done` items
- Store these in a running `azureInputItems` array that persists across loop iterations
- On each Azure API call, pass these items as part of the input (via `toResponsesInput()`)
- For tool-use loops: the reasoning items from the current turn plus the tool results form the next turn's input
- The `azureInputItems` array is scoped to the `runAgent()` call (not global)
**Output**: Reasoning items tracked and re-submitted across turns
**Acceptance**: All Unit 5a tests PASS (green)

### Unit 5c: Reasoning Item Re-submission -- Coverage & Refactor
**What**: Verify coverage. Edge cases:
- Response with no reasoning items (empty array)
- Response with multiple reasoning items
- Encrypted content is preserved exactly (no mutation)
**Acceptance**: 100% coverage, tests green

### Unit 6a: Abort and Error Handling -- Tests
**What**: Write tests for abort signal and error handling on the Azure Responses API path. Test cases:
- Abort signal during Azure stream stops processing cleanly (no error callback)
- Abort signal before Azure API call skips the call
- API error from `client.responses.create` fires `callbacks.onError`
- API error does not crash -- loop ends gracefully
- Network timeout fires error callback
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 6b: Abort and Error Handling -- Implementation
**What**: Ensure Azure path has same abort/error behavior as MiniMax path:
- Pass `signal` to `client.responses.create` options
- Check `signal?.aborted` before API call and during stream iteration
- Catch errors from API call and stream, route to `callbacks.onError`
- On abort, break cleanly without firing error callback
**Output**: Abort and error handling working on Azure path
**Acceptance**: All Unit 6a tests PASS (green)

### Unit 6c: Abort and Error Handling -- Coverage & Refactor
**What**: Verify coverage on error/abort paths. Add edge cases if needed.
**Acceptance**: 100% coverage, tests green

### Unit 7a: Update Existing Azure Tests -- Tests
**What**: Update the existing Azure-specific test ("passes reasoning params for Azure provider") to verify the new Responses API call shape instead of Chat Completions. The mock needs to support `client.responses.create` in addition to `client.chat.completions.create`. Update the mock factory:
```typescript
const mockCreate = vi.fn()
const mockResponsesCreate = vi.fn()
vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: mockCreate } }
    responses = { create: mockResponsesCreate }
    constructor(_opts?: any) {}
  }
  return { default: MockOpenAI, AzureOpenAI: MockOpenAI }
})
```
Test cases:
- Existing "passes reasoning params for Azure provider" test now verifies `mockResponsesCreate` was called with `reasoning: { effort: "medium", summary: "auto" }`, `store: false`, `include: ["reasoning.encrypted_content"]`
- Existing "does not pass reasoning params for MiniMax provider" test still passes (MiniMax uses `mockCreate` / `chat.completions.create`)
- All existing MiniMax runAgent tests still pass unchanged
**Output**: Updated mock and existing tests adapted
**Acceptance**: All tests PASS (green)

### Unit 7b: Integration Verification
**What**: Run full test suite. Verify:
- All 104+ core tests pass
- All 19 CLI tests pass (no changes needed)
- All 47 Teams tests pass (no changes needed)
- No warnings
- Coverage meets requirements
**Output**: Clean test run
**Acceptance**: `npm test` passes with no failures, no warnings

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-24-1949-doing-responses-api-migration/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
