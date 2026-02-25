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
Not started / In progress / Done / Blocked

### Unit 0: Test Infrastructure Setup
**What**: Update the OpenAI mock in `core.test.ts` to support both `client.chat.completions.create` (MiniMax path) and `client.responses.create` (Azure path). This is prerequisite for all subsequent Azure-path tests.
Changes to mock factory at top of `core.test.ts`:
```typescript
const mockCreate = vi.fn()           // chat.completions.create (MiniMax)
const mockResponsesCreate = vi.fn()  // responses.create (Azure)
vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: mockCreate } }
    responses = { create: mockResponsesCreate }
    constructor(_opts?: any) {}
  }
  return { default: MockOpenAI, AzureOpenAI: MockOpenAI }
})
```
Add `mockResponsesCreate.mockReset()` to the `runAgent` describe's `beforeEach`.
Add helper to create Responses API event streams:
```typescript
function makeResponsesStream(events: any[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) { yield event }
    },
  }
}
```
Verify all existing tests still pass (they use `mockCreate` / Chat Completions path).
**Output**: Updated mock infrastructure in `core.test.ts`, all existing tests green
**Acceptance**: `npm test` passes with no regressions. `mockResponsesCreate` is available for subsequent units.

### Unit 1a: Tool Definition Converter -- Tests
**What**: Write tests for a `toResponsesTools()` function that converts `OpenAI.ChatCompletionTool[]` to Responses API `FunctionTool[]` format. New `describe("toResponsesTools")` block in `core.test.ts`. Test cases:
- Converts a single tool: `{ type: "function", function: { name: "read_file", description: "read file contents", parameters: {...} } }` becomes `{ type: "function", name: "read_file", description: "read file contents", parameters: {...}, strict: false }`
- Converts all tools in the `tools` array (verify length matches)
- Handles tool with missing description (should produce `null`)
- Handles tool with missing parameters (should produce `null`)
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `toResponsesTools` is not exported yet

### Unit 1b: Tool Definition Converter -- Implementation
**What**: Implement and export `toResponsesTools()` in `core.ts`. Pure function, no side effects:
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
**What**: Write tests for `toResponsesInput()` that converts `ChatCompletionMessageParam[]` to `{ instructions: string, input: any[] }`. New `describe("toResponsesInput")` block. Test cases:
- Extracts system message content into `instructions`, excludes it from `input`
- Converts user message: `{ role: "user", content: "hi" }` becomes `{ role: "user", content: "hi" }`
- Converts assistant message (text only): `{ role: "assistant", content: "hello" }` becomes `{ role: "assistant", content: "hello" }`
- Converts assistant message with tool_calls: produces assistant content message (if content exists) plus `{ type: "function_call", call_id, name, arguments }` items per tool_call
- Converts tool message: `{ role: "tool", tool_call_id: "tc1", content: "result" }` becomes `{ type: "function_call_output", call_id: "tc1", output: "result" }`
- No system message: `instructions` is empty string
- Mixed multi-turn conversation preserves order
- Empty messages array returns empty instructions and empty input
- Assistant with tool_calls but no content: no assistant content message emitted, only function_call items
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 2b: Message-to-Input Converter -- Implementation
**What**: Implement and export `toResponsesInput()` in `core.ts`:
- Find first message with `role === "system"`, extract `content` as `instructions`
- For non-system messages, convert based on role:
  - `user` -> `{ role: "user", content }`
  - `assistant` (no tool_calls) -> `{ role: "assistant", content }`
  - `assistant` (with tool_calls) -> optionally `{ role: "assistant", content }` if content is truthy, plus one `{ type: "function_call", call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments }` per tool_call
  - `tool` -> `{ type: "function_call_output", call_id: msg.tool_call_id, output: msg.content }`
**Output**: `toResponsesInput` exported from `core.ts`
**Acceptance**: All Unit 2a tests PASS (green)

### Unit 2c: Message-to-Input Converter -- Coverage & Refactor
**What**: Verify 100% coverage. Add edge case tests if needed (assistant with empty string content and tool_calls, system message with empty content, multiple system messages -- only first extracted).
**Acceptance**: 100% coverage, tests green

### Unit 3a: Azure Responses API Call and Text Streaming -- Tests
**What**: Write tests for the Azure path in `runAgent()` using Responses API streaming. Requires Azure env vars set and `mockResponsesCreate` returning event streams. New `describe("runAgent -- Azure Responses API")` block. Each test does `vi.resetModules()`, sets Azure env vars, imports fresh core. Test cases:
- Azure provider calls `mockResponsesCreate` (NOT `mockCreate`)
- Passes correct params: `model`, `input` (from `toResponsesInput`), `instructions` (from `toResponsesInput`), `tools` (from `toResponsesTools`), `stream: true`, `store: false`, `include: ["reasoning.encrypted_content"]`, `reasoning: { effort: "medium", summary: "auto" }`
- `{ type: "response.output_text.delta", delta: "hello" }` event routes to `callbacks.onTextChunk("hello")`
- `{ type: "response.reasoning_summary.delta", delta: "thinking" }` event routes to `callbacks.onReasoningChunk("thinking")`
- `onModelStreamStart` fires once on first text delta event
- `onModelStreamStart` fires once on first reasoning delta event (if reasoning comes first)
- `onModelStreamStart` fires exactly once even with mixed text and reasoning events
- Text-only response (no function_call items) ends the agent loop
- Stream with no relevant events (e.g., only `response.created`) produces no callbacks and ends loop
- `onModelStart` fires before each API call
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 3b: Azure Responses API Call and Text Streaming -- Implementation
**What**: In `runAgent()`, branch on `provider === "azure"`:
- Convert messages via `toResponsesInput()` to get `instructions` and `input`
- Convert tools via `toResponsesTools()`
- Call `client.responses.create({ model, input, instructions, tools: convertedTools, stream: true, store: false, include: ["reasoning.encrypted_content"], reasoning: { effort: "medium", summary: "auto" } }, signal ? { signal } : {})`
- Iterate the async stream, switching on `event.type`:
  - `"response.output_text.delta"` -> fire `onModelStreamStart` (once), call `callbacks.onTextChunk(event.delta)`, accumulate content
  - `"response.reasoning_summary.delta"` -> fire `onModelStreamStart` (once), call `callbacks.onReasoningChunk(String(event.delta))`
  - All other event types: ignore for now (tool call events added in Unit 4)
- After stream: if no tool calls collected, set `done = true`
- Push assistant message to `messages` array for conversation history
- MiniMax path stays completely unchanged (wrapped in `else` branch)
**Output**: Azure text/reasoning streaming working in `runAgent()`
**Acceptance**: All Unit 3a tests PASS (green), all existing MiniMax tests still pass

### Unit 3c: Azure Text Streaming -- Coverage & Refactor
**What**: Verify coverage on new Azure stream code. Add edge cases:
- Event with unknown type is silently ignored
- `delta` field as non-string on reasoning event (cast to string)
- Mixed reasoning and text events interleaved
- Empty string delta (should still call callback)
**Acceptance**: 100% coverage on new code, tests green

### Unit 4a: Azure Tool Call Handling -- Tests
**What**: Write tests for tool call tracking and execution on the Azure Responses API path. Extend the Azure describe block. Test cases:
- `{ type: "response.output_item.added", item: { type: "function_call", name: "read_file", call_id: "call_1", arguments: "" } }` starts tracking a tool call
- `{ type: "response.function_call_arguments.delta", delta: '{"path":' }` followed by `{ ..., delta: '"/foo"}' }` accumulates arguments
- `{ type: "response.output_item.done", item: { type: "function_call", name: "read_file", call_id: "call_1", arguments: '{"path":"/foo"}' } }` finalizes the tool call
- After stream with tool calls: `callbacks.onToolStart` fires for each tool, tool is executed via `execTool`, `callbacks.onToolEnd` fires
- Tool results are passed in the next API call as `function_call_output` items in the input
- The assistant message and tool messages are also appended to canonical `messages` array
- Multiple tool calls in one response: all are tracked and executed
- Tool execution error: result contains error string, `onToolEnd` fires with `success: false`
- Two-turn tool-use loop: first response has tool call, second response has text -- agent loop completes after second turn
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 4b: Azure Tool Call Handling -- Implementation
**What**: Add tool call event handling to the Azure stream processing in `runAgent()`:
- On `response.output_item.added` where `item.type === "function_call"`: initialize tool call tracker `{ call_id: item.call_id, name: item.name, arguments: "" }`
- On `response.function_call_arguments.delta`: append `event.delta` to current tool call's arguments
- On `response.output_item.done` where `item.type === "function_call"`: finalize tool call with completed item data (use `item.call_id`, `item.name`, `item.arguments` from the done event for accuracy)
- After stream: if tool calls exist:
  - For each tool call, run shared tool execution (parse args, `onToolStart`, `execTool`, `onToolEnd`)
  - Build assistant message with tool_calls and push to `messages`
  - Build `function_call_output` input items for tool results
  - Push tool messages to `messages` array (Chat Completions format for history)
  - Continue loop (not done)
- If no tool calls: push assistant message to `messages`, set `done = true`
**Output**: Full tool-use loop working on Azure path
**Acceptance**: All Unit 4a tests PASS (green), all existing tests still pass

### Unit 4c: Azure Tool Call Handling -- Coverage & Refactor
**What**: Verify coverage. Add edge cases:
- Tool with malformed JSON arguments (graceful handling, same as MiniMax path)
- Tool call with empty arguments string
- `output_item.added` for non-function_call types (should be ignored)
- `function_call_arguments.delta` with no active tool call (defensive, should not crash)
**Acceptance**: 100% coverage, tests green

### Unit 5a: Reasoning Item Re-submission -- Tests
**What**: Write tests for reasoning item tracking and re-submission across turns on the Azure path. Test cases:
- `response.output_item.done` with `item.type === "reasoning"` captures the item (including `encrypted_content`)
- On next API call (tool-use loop), the captured reasoning item appears in the `input` array
- Multi-turn: reasoning items from turn 1 are included in turn 2's input, alongside turn 2's tool results
- Response with no reasoning items: no reasoning items in next turn's input (empty is fine)
- Response with multiple reasoning items: all are captured and re-submitted
- `encrypted_content` field is preserved exactly (not mutated or stripped)
- MiniMax path does not track reasoning items (no-op, no regression)
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 5b: Reasoning Item Re-submission -- Implementation
**What**: Implement reasoning item tracking in the Azure path of `runAgent()`:
- Maintain a `azureOutputItems: any[]` array scoped to the `runAgent()` call (persists across loop iterations)
- On `response.output_item.done` events: push the item to a per-iteration collector
- After each stream: append all collected done items to `azureOutputItems`
- Before each Azure API call: pass `azureOutputItems` as additional input items. These should be appended after the converted messages in the `input` array
- For tool-use loops: the sequence is: prior items + current turn's output items + tool result items
- Update `toResponsesInput()` to accept an optional `additionalItems` parameter and append them
**Output**: Reasoning items tracked and re-submitted
**Acceptance**: All Unit 5a tests PASS (green)

### Unit 5c: Reasoning Item Re-submission -- Coverage & Refactor
**What**: Verify coverage. Ensure no edge cases are missed. Verify `toResponsesInput` additional items parameter has coverage.
**Acceptance**: 100% coverage, tests green

### Unit 6a: Azure Abort and Error Handling -- Tests
**What**: Write tests for abort signal and error handling on the Azure path. Test cases:
- Abort signal already aborted before API call: loop breaks, no API call made, no error callback
- Abort signal fires during stream iteration: processing stops cleanly, no error callback
- `client.responses.create` throws an error: `callbacks.onError` fires with the error, loop ends
- `client.responses.create` throws non-Error: `callbacks.onError` fires with wrapped Error
- Stream iteration throws: `callbacks.onError` fires, loop ends
**Output**: Failing tests in `core.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### Unit 6b: Azure Abort and Error Handling -- Implementation
**What**: Ensure the Azure path in `runAgent()` has identical abort/error semantics to the MiniMax path:
- Check `signal?.aborted` at top of loop before API call
- Pass `signal` to `client.responses.create` options: `signal ? { signal } : {}`
- Check `signal?.aborted` inside stream iteration loop
- Wrap Azure path in try/catch: on abort, break cleanly; on error, fire `callbacks.onError`, set `done = true`
**Output**: Abort and error handling working on Azure path
**Acceptance**: All Unit 6a tests PASS (green)

### Unit 6c: Azure Abort and Error Handling -- Coverage & Refactor
**What**: Verify coverage on all error/abort branches. Add any missing edge cases.
**Acceptance**: 100% coverage, tests green

### Unit 7: Full Integration Verification
**What**: Run full test suite across all test files. Verify:
- All core tests pass (original + new)
- All 19 CLI tests pass (no changes to `agent.ts`)
- All 47 Teams tests pass (no changes to `teams.ts`)
- No warnings from TypeScript compilation
- Coverage meets 100% on all new code
- Existing Azure-specific test ("passes reasoning params for Azure provider") now correctly tests Responses API params
- Existing MiniMax-specific test ("does not pass reasoning params for MiniMax provider") still passes unchanged
**Output**: Clean `npm test` run, full green
**Acceptance**: `npm test` passes with zero failures, zero warnings

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (0, 1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-24-1949-doing-responses-api-migration/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
