# Planning: Migrate Azure GPT Path to OpenAI Responses API

**Status**: drafting
**Created**: 2026-02-24 19:50

## Goal
Migrate the Azure provider path in `runAgent()` from the Chat Completions API (`client.chat.completions.create()`) to the OpenAI Responses API (`client.responses.create()`) to unlock reasoning summaries (`reasoning: { effort: "medium", summary: "auto" }`), while keeping MiniMax on the Chat Completions API since it does not support the Responses API.

## Scope

### In Scope
- **Provider-branched API call in `runAgent()`**: Azure path uses `client.responses.create()` with streaming; MiniMax path continues using `client.chat.completions.create()` with streaming
- **Tool definition format conversion**: Current `OpenAI.ChatCompletionTool[]` format needs a converter for Responses API `FunctionTool` format (different shape: `{ type: "function", name, description, parameters, strict }` vs Chat Completions' `{ type: "function", function: { name, description, parameters } }`)
- **Input/message format conversion**: Chat Completions uses `messages` array with `role`/`content`; Responses API uses `input` array with `EasyInputMessage` items plus `instructions` for system prompt. Need to convert our `OpenAI.ChatCompletionMessageParam[]` to `ResponseInput` format
- **Streaming event handling**: Responses API uses event-based streaming (`response.output_text.delta`, `response.function_call_arguments.delta`, `response.reasoning_summary.delta`, etc.) instead of Chat Completions' delta-based chunks. Need new stream processing for Azure path
- **Reasoning summary support**: Wire `response.reasoning_summary.delta` events to existing `callbacks.onReasoningChunk()` -- this is the primary motivation for the migration
- **Tool result submission**: Responses API uses `ResponseFunctionToolCallOutputItem` (with `call_id` and `output`) instead of Chat Completions' `{ role: "tool", tool_call_id, content }`. Tool results get appended to `input` array for the next turn
- **Conversation state management**: Decide between `previous_response_id` (server-side state) vs manual `input` array management (client-side state). We currently manage state client-side with the `messages` array
- **Update OpenAI mock in `core.test.ts`**: The mock currently only mocks `client.chat.completions.create`. Need to add `client.responses.create` mock for Azure-path tests
- **Update all affected tests**: Ensure all 104 core tests pass with the new dual-path architecture
- **Keep `ChannelCallbacks` interface unchanged**: Adapters (CLI, Teams) should not need any changes -- they consume callbacks, not API details

### Out of Scope
- Migrating MiniMax to the Responses API (it does not support it)
- Changing the `ChannelCallbacks` interface
- Modifying `agent.ts` (CLI adapter) or `teams.ts` (Teams adapter)
- Adding new tools or changing tool behavior
- Using `previous_response_id` for server-side conversation state (we will continue managing state client-side for now)
- Upgrading the `openai` npm package (^4.78.0 already has `client.responses`)
- The reasoning display normalization work (separate planning doc exists for that)

## Completion Criteria
- [ ] Azure path in `runAgent()` calls `client.responses.create()` with streaming
- [ ] MiniMax path in `runAgent()` continues calling `client.chat.completions.create()` with streaming
- [ ] Tool definitions are correctly converted to Responses API format for Azure calls
- [ ] Conversation messages are correctly converted to Responses API `input` format for Azure calls
- [ ] Azure streaming events (`response.output_text.delta`, `response.function_call_arguments.delta`, `response.reasoning_summary.delta`) are correctly parsed and routed to callbacks
- [ ] Reasoning summaries are delivered via `callbacks.onReasoningChunk()` on the Azure path
- [ ] Tool results are correctly submitted back in Responses API format on the Azure path
- [ ] Multi-turn tool-use loops work correctly (model calls tool, gets result, calls another tool or produces final text)
- [ ] MiniMax think-tag state machine continues to work unchanged
- [ ] `ChannelCallbacks` interface is unchanged -- no adapter changes needed
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [ ] Should we use `instructions` parameter for the system prompt (cleaner) or include it as the first item in the `input` array? The Responses API supports both.
- [ ] How should we handle the `reasoning` output items for conversation continuity? The Responses API docs say to include `ResponseReasoningItem` in subsequent `input` to maintain reasoning context. Do we need to track and re-submit these?
- [ ] Should we pass `store: false` to avoid server-side storage, or leave it as default? (Privacy/data residency consideration for Azure.)
- [ ] The current `messages` array is typed as `OpenAI.ChatCompletionMessageParam[]`. Should we keep that as the canonical type and convert on-the-fly for Azure, or introduce a provider-agnostic internal message type?

## Decisions Made
- Client-side state management (manual `input` array) rather than `previous_response_id` -- keeps parity with current architecture and avoids server-side dependency
- Keep `ChannelCallbacks` interface unchanged -- adapters are isolated from API details by design
- MiniMax stays on Chat Completions API indefinitely
- The `openai` package at ^4.78.0 already ships `client.responses` on both `OpenAI` and `AzureOpenAI` classes -- no package upgrade needed

## Context / References
- `src/core.ts` lines 396-575: `runAgent()` function -- the primary migration target
- `src/core.ts` lines 68-183: `tools` array -- Chat Completions tool format, needs conversion for Responses API
- `src/core.ts` lines 386-394: `ChannelCallbacks` interface -- must remain unchanged
- `src/core.ts` lines 24-56: `getClient()` -- returns `OpenAI` or `AzureOpenAI`, already provider-aware
- `src/core.ts` lines 409-413: current Azure-specific params (`reasoning_effort: "medium"`)
- `src/__tests__/core.test.ts`: 104 tests, mock at lines 22-36 mocks `chat.completions.create` only
- OpenAI SDK types: `node_modules/openai/resources/responses/responses.d.ts`
  - `ResponseCreateParamsBase` (line 3642): `input`, `model`, `instructions`, `reasoning`, `tools`, `stream`
  - `ResponseStreamEvent` (line 3168): union of all streaming events
  - `ResponseTextDeltaEvent`: `{ type: "response.output_text.delta", delta: string }`
  - `ResponseFunctionCallArgumentsDeltaEvent`: `{ type: "response.function_call_arguments.delta", delta: string }`
  - `ResponseReasoningSummaryDeltaEvent`: `{ type: "response.reasoning_summary.delta", delta: unknown }`
  - `ResponseOutputItemAddedEvent`: `{ type: "response.output_item.added", item: ResponseOutputItem }`
  - `ResponseOutputItemDoneEvent`: `{ type: "response.output_item.done", item: ResponseOutputItem }`
  - `ResponseFunctionToolCall`: `{ type: "function_call", call_id, name, arguments }`
  - `ResponseFunctionToolCallOutputItem`: `{ type: "function_call_output", call_id, output }`
  - `FunctionTool`: `{ type: "function", name, description, parameters, strict }`
  - `EasyInputMessage`: `{ role, content, type?: "message" }`
  - `Shared.Reasoning`: `{ effort?: "low"|"medium"|"high", summary?: "auto"|"concise"|"detailed" }`
- Key API differences summary:
  - Chat Completions: `messages` array, `delta.content`, `delta.tool_calls[].function.arguments`, `tool_call.id`
  - Responses API: `input` array + `instructions`, event-based stream, `call_id` instead of `tool_call_id`, `function_call_output` instead of `{ role: "tool" }`

## Notes
The migration is scoped to `core.ts` only. The `ChannelCallbacks` abstraction layer means adapters (agent.ts, teams.ts) are completely isolated from which API is used. The main complexity is in the stream processing -- Responses API uses discrete events instead of delta chunks, so the stream loop needs two separate implementations (one per provider). The tool-use loop structure (call model -> parse tool calls -> execute -> submit results -> call model again) stays the same, just with different wire formats on each side.

## Progress Log
- 2026-02-24 19:50 Created
