# Doing: Migrate Azure GPT Path to OpenAI Responses API

**Status**: READY_FOR_EXECUTION
**Execution Mode**: pending
**Created**: 2026-02-24 20:01
**Planning**: ./2026-02-24-1949-planning-responses-api-migration.md
**Artifacts**: ./2026-02-24-1949-doing-responses-api-migration/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Migrate the Azure provider path in `runAgent()` from the Chat Completions API to the OpenAI Responses API to unlock reasoning summaries, while keeping MiniMax on Chat Completions. Introduce a layered architecture with clean separation between format conversion, stream processing, and agent orchestration.

## Architecture

The migration introduces a layered architecture with clear boundaries:

```
                    ChannelCallbacks (onTextChunk, onReasoningChunk, etc.)
                           ^                    ^
                           |                    |
              streamChatCompletion()    streamResponsesApi()
              (MiniMax CC stream)      (Azure Responses stream)
                           \                   /
                            \                 /
                         TurnResult (normalized)
                                  |
                           runAgent() orchestrator
                          /         |          \
                   tool execution   state mgmt   loop control
                   (shared)         (shared)     (shared)
```

### Layer 1: Format Converters (pure functions)
- `toResponsesTools(ccTools)` — CC tool definitions -> Responses API FunctionTool[]
- `toResponsesInput(messages)` — CC messages -> `{ instructions, input }` for Responses API

### Layer 2: TurnResult (normalized interface)
```typescript
export interface TurnResult {
  content: string
  toolCalls: { id: string; name: string; arguments: string }[]
  outputItems: any[]  // raw Responses API output items for re-submission (empty for CC path)
}
```
This is the contract between stream processors and the orchestrator. Both providers produce the same shape. The orchestrator never touches provider-specific API details.

### Layer 3: Stream Processors (provider-specific)
- `streamChatCompletion(client, createParams, callbacks, signal)` -> `TurnResult`
  - Makes `client.chat.completions.create()` call
  - Processes CC delta stream (content, reasoning_content, tool_calls)
  - Contains MiniMax `<think>` tag state machine (`processContentBuf`)
  - Fires callbacks during stream (onModelStreamStart, onTextChunk, onReasoningChunk)
  - Returns TurnResult with empty `outputItems`
- `streamResponsesApi(client, createParams, callbacks, signal)` -> `TurnResult`
  - Makes `client.responses.create()` call
  - Processes Responses API event stream
  - Fires callbacks during stream
  - Returns TurnResult with `outputItems` populated from `output_item.done` events

### Layer 4: runAgent() Orchestrator (provider-agnostic loop)
- Gets TurnResult from the appropriate stream processor
- Builds CC-format assistant message from TurnResult (shared)
- Pushes to canonical `messages[]` array (shared)
- Executes tools if present (shared)
- Tracks reasoning items from `outputItems` for Azure re-submission
- Loop control: done when no tool calls (shared)
- Abort/error handling (shared)

### Data Flow per Azure Turn
```
messages[] (CC format)
  -> toResponsesInput() -> { instructions, input }
  -> append reasoningItems from previous turns
  -> streamResponsesApi() -> TurnResult { content, toolCalls, outputItems }
  -> filter reasoning items from outputItems, accumulate for next turn
  -> build CC assistant message from TurnResult, push to messages[]
  -> if toolCalls: execute (shared), push CC tool messages to messages[]
  -> loop or done
```

### Why Only Reasoning Items Are Tracked Separately
The canonical `messages[]` stays in CC format. On each Azure turn, `toResponsesInput()` converts the full CC history to Responses API format. This handles assistant messages, tool calls, and tool results — all have CC equivalents. Reasoning items (`{ type: "reasoning", encrypted_content }`) have NO CC equivalent, so they're tracked in a separate `reasoningItems[]` array and appended to the Responses API input alongside the converted history. This avoids double-sending while maintaining reasoning continuity.

## Completion Criteria
- [ ] Azure path calls `client.responses.create()` with streaming, `store: false`, `include: ["reasoning.encrypted_content"]`, `reasoning: { effort: "medium", summary: "auto" }`
- [ ] MiniMax path continues calling `client.chat.completions.create()` with streaming, unchanged
- [ ] Tool definitions correctly converted via `toResponsesTools()` for Azure calls
- [ ] Conversation messages correctly converted via `toResponsesInput()` for Azure calls
- [ ] `TurnResult` interface is the only contract between stream processors and runAgent
- [ ] `streamChatCompletion()` and `streamResponsesApi()` are standalone exported functions
- [ ] Azure streaming events correctly parsed and routed to callbacks
- [ ] Reasoning summaries delivered via `callbacks.onReasoningChunk()` on Azure path
- [ ] Reasoning items tracked and re-submitted in subsequent Azure turns
- [ ] Tool results correctly submitted as `function_call_output` items on Azure path
- [ ] Multi-turn tool-use loops work correctly on both providers
- [ ] MiniMax `<think>` tag state machine works unchanged inside `streamChatCompletion()`
- [ ] `ChannelCallbacks` interface unchanged — no adapter changes needed
- [ ] Tool execution, state management, loop control — all shared, written once
- [ ] `runAgent()` is a thin orchestrator with no provider-specific API knowledge
- [ ] 100% test coverage on all new code
- [ ] All tests pass, no warnings

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

### ✅ Unit 0: Test Infrastructure Setup
**What**: Update the OpenAI mock in `core.test.ts` to support both `client.chat.completions.create` (MiniMax) and `client.responses.create` (Azure).
- Add `mockResponsesCreate` mock alongside existing `mockCreate`
- Update mock factory to include `responses = { create: mockResponsesCreate }`
- Add `mockResponsesCreate.mockReset()` to appropriate `beforeEach` blocks
- Add helper `makeResponsesStream(events)` that returns an async iterable from an array of Responses API events (these are flat `{ type, delta, ... }` objects — NOT CC-format `{ choices: [{ delta }] }` chunks)
- Verify all existing tests still pass unchanged
**Output**: Updated mock infrastructure in `core.test.ts`
**Acceptance**: `npm test` passes with no regressions. `mockResponsesCreate` available for later units.

---

### ✅ Unit 1a: toResponsesTools — Tests
**What**: Write tests for `toResponsesTools()` that converts `OpenAI.ChatCompletionTool[]` to Responses API `FunctionTool[]` format. New `describe("toResponsesTools")` block in `core.test.ts`.
Test cases:
- Single tool: `{ type: "function", function: { name, description, parameters } }` -> `{ type: "function", name, description, parameters, strict: false }`
- All tools in the exported `tools` array (verify length matches, spot-check a couple)
- Tool with missing/undefined description -> `null` for description
- Tool with missing/undefined parameters -> `null` for parameters
**Output**: Failing tests
**Acceptance**: Tests FAIL (red) — `toResponsesTools` not exported yet

### ✅ Unit 1b: toResponsesTools — Implementation
**What**: Implement and export `toResponsesTools()` in `core.ts`. Pure function, no side effects. Maps each CC tool to `{ type: "function", name, description, parameters, strict: false }` by unwrapping the nested `function` property.
**Output**: `toResponsesTools` exported from `core.ts`
**Acceptance**: All Unit 1a tests PASS (green)

### ✅ Unit 1c: toResponsesTools — Coverage
**What**: Verify 100% branch/line coverage on `toResponsesTools`. Add edge case tests if gaps found.
**Acceptance**: 100% coverage on new code, tests green

---

### ✅ Unit 2a: toResponsesInput — Tests
**What**: Write tests for `toResponsesInput()` that converts `ChatCompletionMessageParam[]` to `{ instructions: string, input: any[] }`. New `describe("toResponsesInput")` block.
Test cases:
- Extracts system message content into `instructions`, excludes from `input`
- User message: `{ role: "user", content: "hi" }` -> `{ role: "user", content: "hi" }` in input
- Assistant message (text only): `{ role: "assistant", content: "hello" }` -> `{ role: "assistant", content: "hello" }` in input
- Assistant with tool_calls: produces `{ role: "assistant", content }` (if content truthy) + one `{ type: "function_call", call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments }` per tool_call
- Tool message: `{ role: "tool", tool_call_id: "tc1", content: "result" }` -> `{ type: "function_call_output", call_id: "tc1", output: "result" }`
- No system message: instructions is empty string
- Mixed multi-turn conversation preserves order
- Empty messages array -> empty instructions, empty input
- Assistant with tool_calls but empty/no content: no assistant content message, only function_call items
**Output**: Failing tests
**Acceptance**: Tests FAIL (red)

### ✅ Unit 2b: toResponsesInput — Implementation
**What**: Implement and export `toResponsesInput()` in `core.ts`. Pure function:
- Find first `role === "system"` message, extract content as `instructions`
- Convert remaining messages based on role (user, assistant, assistant+tool_calls, tool)
- Return `{ instructions, input }`
**Output**: `toResponsesInput` exported from `core.ts`
**Acceptance**: All Unit 2a tests PASS (green)

### ✅ Unit 2c: toResponsesInput — Coverage
**What**: Verify 100% coverage. Add edge cases if needed: assistant with empty string content + tool_calls, system message with empty content, multiple system messages (only first extracted).
**Acceptance**: 100% coverage, tests green

---

### ✅ Unit 3a: TurnResult + streamChatCompletion — Tests
**What**: Define the `TurnResult` interface and write tests for `streamChatCompletion()` — a standalone function extracted from the current MiniMax stream processing in `runAgent()`. New `describe("streamChatCompletion")` block.

The TurnResult interface:
```typescript
export interface TurnResult {
  content: string
  toolCalls: { id: string; name: string; arguments: string }[]
  outputItems: any[]
}
```

Test cases (these mirror existing runAgent behavior but test the extracted function directly):
- Text-only response: returns `{ content: "hello", toolCalls: [], outputItems: [] }`
- Calls `callbacks.onModelStreamStart()` once on first content delta
- Calls `callbacks.onTextChunk()` for each content delta
- Tool calls: accumulates tool call deltas, returns them in `toolCalls`
- `reasoning_content` delta: calls `callbacks.onReasoningChunk()`
- `<think>` tag content: routes through `processContentBuf`, calls `onReasoningChunk` for think content and `onTextChunk` for non-think content
- Mixed content + tool_calls in same response
- `outputItems` is always empty (CC path has no output items)
- Respects abort signal during stream iteration
- Propagates errors from `client.chat.completions.create()`
**Output**: Failing tests
**Acceptance**: Tests FAIL (red) — `streamChatCompletion` and `TurnResult` not exported yet

### ✅ Unit 3b: TurnResult + streamChatCompletion — Implementation
**What**: Extract stream processing from `runAgent()` into a standalone exported function `streamChatCompletion()`.

Steps:
1. Define and export `TurnResult` interface in `core.ts`
2. Create `streamChatCompletion(client, createParams, callbacks, signal)` that:
   - Calls `client.chat.completions.create(createParams, signal ? { signal } : {})`
   - Contains the full CC delta processing loop (content, reasoning_content, tool_calls)
   - Contains the `processContentBuf` state machine for `<think>` tags
   - Fires callbacks during stream (onModelStreamStart once, onTextChunk, onReasoningChunk)
   - Returns `TurnResult` with content, toolCalls, and empty outputItems
3. Update `runAgent()` to call `streamChatCompletion()` instead of inline stream processing
4. All existing runAgent tests must pass unchanged (they test through runAgent which now delegates)

**Critical**: This is a REFACTOR of working code. Behavior must not change. All ~104 existing tests must pass.
**Output**: `TurnResult` and `streamChatCompletion` exported from `core.ts`, runAgent delegates to it
**Acceptance**: All Unit 3a tests PASS, ALL existing tests still pass

### ✅ Unit 3c: streamChatCompletion — Coverage
**What**: Verify 100% coverage on `streamChatCompletion`. This should largely be covered by existing runAgent tests + new direct tests. Add edge cases if gaps:
- Empty stream (no deltas)
- Delta with no content/tool_calls/reasoning_content (skip)
- Partial `<think>` tag at stream boundary
- Abort mid-stream
**Acceptance**: 100% coverage, tests green

---

### ✅ Unit 4a: streamResponsesApi Text + Reasoning — Tests
**What**: Write tests for `streamResponsesApi()` — the Azure Responses API stream processor. New `describe("streamResponsesApi")` block. Uses `mockResponsesCreate` and `makeResponsesStream` from Unit 0.

Test cases:
- Calls `client.responses.create(createParams, signal ? { signal } : {})`
- `{ type: "response.output_text.delta", delta: "hello" }` -> `callbacks.onTextChunk("hello")`, content accumulated
- `{ type: "response.reasoning_summary_text.delta", delta: "thinking" }` -> `callbacks.onReasoningChunk("thinking")`
  (SDK: `ResponseReasoningSummaryTextDeltaEvent` has `delta: string`. The other event `response.reasoning_summary.delta` has `delta: unknown` and is NOT the text carrier.)
- `onModelStreamStart` fires once on first text or reasoning delta
- Mixed text + reasoning events interleaved: both callbacks fire, `onModelStreamStart` only once
- Text-only response (no tool call events): content returned, toolCalls empty, outputItems empty
- Unknown event types silently ignored
- Empty delta string still fires callback
- Non-string delta cast to String()
- Returns `TurnResult` with accumulated content
**Output**: Failing tests
**Acceptance**: Tests FAIL (red) — `streamResponsesApi` not exported yet

### ✅ Unit 4b: streamResponsesApi Text + Reasoning — Implementation
**What**: Implement and export `streamResponsesApi()` in `core.ts`:
- Calls `client.responses.create(createParams, signal ? { signal } : {})`
- Iterates async event stream, switching on `event.type`:
  - `"response.output_text.delta"`: fire `onModelStreamStart` (once), `onTextChunk(event.delta)`, accumulate content
  - `"response.reasoning_summary_text.delta"`: fire `onModelStreamStart` (once), `onReasoningChunk(String(event.delta))`
  - Other events: will be handled in Unit 5 (tool calls, output items)
  - Unknown events: ignore
- Check `signal?.aborted` during iteration
- Returns `TurnResult` with content, empty toolCalls, empty outputItems (tool call handling added in Unit 5)
**Output**: `streamResponsesApi` exported, handles text + reasoning streaming
**Acceptance**: All Unit 4a tests PASS (green)

### ✅ Unit 4c: streamResponsesApi Text + Reasoning — Coverage
**What**: Verify coverage. Add edge cases:
- Stream with only `response.created` / `response.completed` events (no content callbacks)
- Abort signal already aborted before iteration starts
- Error thrown during stream iteration
**Acceptance**: 100% coverage on new code, tests green

---

### ✅ Unit 5a: streamResponsesApi Tool Calls + Output Items — Tests
**What**: Extend `streamResponsesApi` tests with tool call event handling and output item collection.

Test cases — tool call events:
- `response.output_item.added` with `item.type === "function_call"`: starts tracking tool call
- `response.function_call_arguments.delta`: accumulates arguments for current tool call
- `response.output_item.done` with `item.type === "function_call"`: finalizes tool call using done event's item data
- Multiple tool calls in one response: all tracked independently
- Tool call with accumulated arguments matches done event's arguments

Test cases — output item collection:
- `response.output_item.done` with ANY item type: pushed to `outputItems` (reasoning, message, function_call — all captured)
- Response with reasoning + message + function_call items: all appear in `outputItems`
- Reasoning item's `encrypted_content` field preserved in outputItems
- Response with no done events: outputItems is empty

Test cases — TurnResult:
- Response with tool calls: `toolCalls` populated, content may be empty
- Response with text + tool calls: both content and toolCalls populated
- `outputItems` contains all done items regardless of type

Edge cases:
- `output_item.added` for non-function_call type (e.g., `type: "message"`): not tracked as tool call
- `function_call_arguments.delta` with no active tool call: ignored (defensive)
- Tool call with empty arguments string
**Output**: Failing tests
**Acceptance**: Tests FAIL (red)

### ✅ Unit 5b: streamResponsesApi Tool Calls + Output Items — Implementation
**What**: Add tool call and output item handling to `streamResponsesApi()`:
- Maintain a `currentToolCall` tracker and `toolCalls` array
- On `response.output_item.added` where `item.type === "function_call"`: set `currentToolCall = { call_id: item.call_id, name: item.name, arguments: "" }`
- On `response.function_call_arguments.delta`: if currentToolCall exists, append `event.delta`
- On `response.output_item.done`:
  - Push the full `event.item` to `outputItems` (for ALL item types)
  - If `item.type === "function_call"`: finalize tool call using done item's `call_id`, `name`, `arguments`. Push to toolCalls array as `{ id: item.call_id, name: item.name, arguments: item.arguments }` — note: Responses API `call_id` maps to TurnResult `id` which maps to CC format `tool_call_id`. Clear currentToolCall
- Return TurnResult with populated content, toolCalls, outputItems
**Output**: Full stream processing working
**Acceptance**: All Unit 5a tests PASS (green), all Unit 4a tests still pass

### ✅ Unit 5c: streamResponsesApi Tool Calls + Output Items — Coverage
**What**: Verify coverage on all new branches. Add any missing edge cases.
**Acceptance**: 100% coverage, tests green

---

### ✅ Unit 6a: runAgent Orchestrator — Tests
**What**: Write tests for the refactored `runAgent()` that uses `TurnResult` from both stream processors. This is the integration point. New `describe("runAgent orchestrator")` block or extend existing.

**NOTE**: The existing test "passes reasoning params for Azure provider" currently asserts `mockCreate` is called with `reasoning_effort: "medium"`. After this refactor, Azure calls `mockResponsesCreate` instead. This test MUST be rewritten to check `mockResponsesCreate` params (Responses API format). Similarly, update the `getProvider` test that checks Azure routing.

Test cases — Azure path through orchestrator:
- Azure provider: calls `streamResponsesApi` (via `mockResponsesCreate`), NOT `streamChatCompletion` (via `mockCreate`)
- Azure params: model, converted tools (via `toResponsesTools`), converted input (via `toResponsesInput`), instructions, `stream: true`, `store: false`, `include: ["reasoning.encrypted_content"]`, `reasoning: { effort: "medium", summary: "auto" }`
- Azure text-only response: assistant message pushed to `messages[]` in CC format, loop ends
- Azure tool-use turn: tool calls executed (shared code), tool results pushed to `messages[]` in CC format, loop continues
- Azure two-turn tool-use loop: first response has tool call, second has text — loop completes
- Azure multi-tool response: all tools executed, all results pushed

Test cases — reasoning item tracking:
- Azure response with reasoning items in outputItems: reasoning items (only!) accumulated
- Next Azure turn in same loop: accumulated reasoning items appended to input after converted messages
- Non-reasoning output items (message, function_call) NOT accumulated (they round-trip through CC)
- MiniMax path: outputItems always empty, no reasoning tracking (no-op)

Test cases — shared behavior (both paths):
- Assistant message built from TurnResult.content and TurnResult.toolCalls
- Tool execution: args parsed, `onToolStart`/`onToolEnd` fired, `execTool` called
- Tool error: result is error string, `onToolEnd` with `success: false`
- Malformed tool args JSON: graceful handling
- `onModelStart` fired before each turn's stream processor call
- Loop ends when TurnResult has no tool calls

Test cases — abort and error handling:
- `signal.aborted` before first call: loop breaks, no stream processor called
- `signal.aborted` during stream (stream processor handles internally): processing stops
- Stream processor throws: `callbacks.onError` fired, loop ends
- Stream processor throws non-Error: wrapped in Error for `onError`
- Abort during tool execution: check signal between tools

**Output**: Failing tests
**Acceptance**: Tests FAIL (red)

### ✅ Unit 6b: runAgent Orchestrator — Implementation
**What**: Rewrite `runAgent()` as a thin provider-agnostic orchestrator:

```
runAgent(messages, callbacks, signal):
  client = getClient()
  provider = getProvider()
  model = getModel()
  reasoningItems = []  // only reasoning items, for Azure re-submission
  done = false

  while !done:
    if signal?.aborted: break
    try:
      callbacks.onModelStart()

      if provider === "azure":
        { instructions, input } = toResponsesInput(messages)
        fullInput = [...input, ...reasoningItems]
        result = await streamResponsesApi(client, {
          model, input: fullInput, instructions,
          tools: toResponsesTools(tools),
          reasoning: { effort: "medium", summary: "auto" },
          stream: true, store: false,
          include: ["reasoning.encrypted_content"]
        }, callbacks, signal)
        // Track ONLY reasoning items (no CC equivalent)
        reasoningItems.push(...result.outputItems.filter(i => i.type === "reasoning"))
      else:
        createParams = { messages, tools, stream: true }
        if model: createParams.model = model
        result = await streamChatCompletion(client, createParams, callbacks, signal)

      // SHARED: build CC-format assistant message from TurnResult
      msg = { role: "assistant" }
      if result.content: msg.content = result.content
      if result.toolCalls.length:
        msg.tool_calls = result.toolCalls.map(tc => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }))
      messages.push(msg)

      if !result.toolCalls.length:
        done = true
      else:
        // SHARED: execute tools
        for tc in result.toolCalls:
          args = JSON.parse(tc.arguments) or {}
          argSummary = summarizeArgs(tc.name, args)
          callbacks.onToolStart(tc.name, args)
          toolResult = await execTool(tc.name, args)  // or error
          callbacks.onToolEnd(tc.name, argSummary, success)
          messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult })

    catch e:
      if signal?.aborted: break
      callbacks.onError(e instanceof Error ? e : new Error(String(e)))
      done = true
```

Key points:
- Stream processor choice is the ONLY provider branch
- All tool execution, message construction, state management, loop control is shared
- `reasoningItems` accumulates across loop iterations (within one runAgent call)
- Existing MiniMax behavior preserved (streamChatCompletion returns same TurnResult)
**Output**: Refactored `runAgent()` using both stream processors
**Acceptance**: All Unit 6a tests PASS, ALL existing tests still pass

### ✅ Unit 6c: runAgent Orchestrator — Coverage
**What**: Verify 100% coverage on refactored `runAgent()`. Focus on:
- Both provider branches exercised
- Reasoning item filter (type === "reasoning" vs other types)
- Empty reasoningItems on first turn
- Tool execution error paths
- Abort at various points (before call, during stream, between tools)
- All edge cases from 6a covered
**Acceptance**: 100% coverage, tests green

---

### ⬜ Unit 7: Full Integration Verification
**What**: Run full test suite across ALL test files. Verify:
- All core tests pass (original + new)
- All CLI tests pass (no changes to `agent.ts`)
- All Teams tests pass (no changes to `teams.ts`)
- No TypeScript warnings
- Coverage meets 100% on all new code
- Existing "passes reasoning params for Azure provider" test updated for Responses API params
- Existing "does not pass reasoning params for MiniMax provider" test still passes
- `TurnResult`, `streamChatCompletion`, `streamResponsesApi`, `toResponsesTools`, `toResponsesInput` all exported and tested
- `runAgent()` contains zero provider-specific API knowledge (no CC delta parsing, no Responses event parsing)
**Output**: Clean `npm test` run, full green
**Acceptance**: `npm test` zero failures, zero warnings

---

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit (0, 1a, 1b, 1c, etc.)
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-24-1949-doing-responses-api-migration/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## SDK Event Type Reference
From `node_modules/openai/resources/responses/responses.d.ts`:

**Stream events we handle:**
- `ResponseTextDeltaEvent`: `{ type: "response.output_text.delta", delta: string }` — text content
- `ResponseReasoningSummaryTextDeltaEvent`: `{ type: "response.reasoning_summary_text.delta", delta: string }` — reasoning summary text (USE THIS for reasoning callbacks)
- `ResponseFunctionCallArgumentsDeltaEvent`: `{ type: "response.function_call_arguments.delta", delta: string }` — tool call args
- `ResponseOutputItemAddedEvent`: `{ type: "response.output_item.added", item: ResponseOutputItem }` — new output item
- `ResponseOutputItemDoneEvent`: `{ type: "response.output_item.done", item: ResponseOutputItem }` — completed output item

**Stream events we DO NOT handle (for reference):**
- `ResponseReasoningSummaryDeltaEvent`: `{ type: "response.reasoning_summary.delta", delta: unknown }` — NOT the text carrier, `delta` is `unknown` not `string`. Do not use for text streaming.

**Data types:**
- `ResponseFunctionToolCall`: `{ type: "function_call", call_id: string, name: string, arguments: string, id?: string }` — `call_id` maps to TurnResult `id` and CC `tool_call_id`
- `ResponseReasoningItem`: `{ type: "reasoning", id: string, summary: [{ text, type: "summary_text" }], encrypted_content?: string | null }`
- `FunctionTool`: `{ type: "function", name: string, description?: string | null, parameters: Record<string, unknown> | null, strict: boolean | null }`
- `EasyInputMessage`: `{ role: "user"|"assistant"|"system"|"developer", content: string | ContentList, type?: "message" }`
- `ResponseFunctionToolCallOutputItem`: `{ type: "function_call_output", id: string, call_id: string, output: string }`
- `ResponseInput`: `Array<ResponseInputItem>` — just an array
- `ResponseIncludable`: `"reasoning.encrypted_content" | "file_search_call.results" | ...`

**API call:**
- `client.responses.create(body: ResponseCreateParamsStreaming, options?: RequestOptions)` -> `APIPromise<Stream<ResponseStreamEvent>>`
- `RequestOptions` includes `signal?: AbortSignal | null`
- `Stream<T>` implements `AsyncIterable<T>` — use `for await`

## Progress Log
- 2026-02-24 20:01 Created from planning doc (Pass 1 -- First Draft)
- 2026-02-24 20:05 Pass 2 (Granularity), Pass 3 (Validation), Pass 4 (Quality) complete. Set READY_FOR_EXECUTION
- 2026-02-24 21:15 Major revision: restructured around layered architecture (TurnResult, stream processors, thin orchestrator). Modularized per user feedback. 20 units retained, reorganized around proper layer separation.
- 2026-02-24 21:30 4-pass validation complete. Fixes: (1) resolved reasoning event type ambiguity — use `response.reasoning_summary_text.delta` definitively, (2) noted existing Azure test must be rewritten in Unit 6, (3) fixed pseudocode variable shadowing, (4) clarified call_id->id mapping for TurnResult, (5) enriched SDK reference section with typed fields and API call signature.
- 2026-02-24 20:40 Unit 0 complete: Added mockResponsesCreate, updated MockOpenAI with responses.create, added makeResponsesStream helper. 208 tests pass.
- 2026-02-24 20:42 Units 1a/1b/1c complete: toResponsesTools -- 4 tests, 100% coverage on new code. 212 tests pass.
- 2026-02-24 20:44 Units 2a/2b/2c complete: toResponsesInput -- 11 tests, 100% coverage on new code. 223 tests pass.
- 2026-02-24 20:46 Units 3a/3b/3c complete: TurnResult + streamChatCompletion -- extracted CC stream processor from runAgent, 10 direct tests + all 104 existing runAgent tests still pass. 233 tests total. 100% coverage.
- 2026-02-24 20:49 Units 4a/4b/4c complete: streamResponsesApi text+reasoning -- 14 tests, handles text deltas, reasoning deltas, abort, errors. 247 tests total. 100% coverage.
- 2026-02-24 20:51 Units 5a/5b/5c complete: streamResponsesApi tool calls + output items -- added 9 tests for tool call tracking and output item collection. 256 tests total. 100% coverage.
- 2026-02-24 20:53 Units 6a/6b/6c complete: runAgent orchestrator -- Azure path wired to streamResponsesApi with toResponsesInput/toResponsesTools. Reasoning item tracking. Existing Azure test rewritten. 261 tests total. 100% coverage.
