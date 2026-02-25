# Planning: Migrate Azure GPT Path to OpenAI Responses API

**Status**: NEEDS_REVIEW
**Created**: 2026-02-24 19:50

## Goal
Migrate the Azure provider path in `runAgent()` from the Chat Completions API (`client.chat.completions.create()`) to the OpenAI Responses API (`client.responses.create()`) to unlock reasoning summaries (`reasoning: { effort: "medium", summary: "auto" }`), while keeping MiniMax on the Chat Completions API since it does not support the Responses API.

## Scope

### In Scope
- **Provider-branched API call in `runAgent()`**: Azure path uses `client.responses.create()` with streaming; MiniMax path continues using `client.chat.completions.create()` with streaming. Shared code (tool execution, callback dispatch, abort handling) stays shared -- only the API call and stream parsing are provider-specific
- **Tool definition format conversion**: Shared `tools` array stays in Chat Completions format as the source of truth. A converter function produces Responses API `FunctionTool` format (`{ type: "function", name, description, parameters, strict }`) from the existing `{ type: "function", function: { name, description, parameters } }` shape
- **Input/message conversion (Azure path)**: Convert `ChatCompletionMessageParam[]` to `ResponseInput` on-the-fly before each Azure call. System message is extracted and passed via the `instructions` parameter. User/assistant/tool messages are converted to `EasyInputMessage` / `ResponseFunctionToolCallOutputItem` items
- **Reasoning item tracking (Azure path)**: After each Azure response, append `response.output` items (reasoning, message, function_call) to a parallel Azure-specific input array. Include `reasoning.encrypted_content` in the `include` parameter so reasoning items carry encrypted tokens for multi-turn continuity. Use `store: false` for stateless operation
- **Streaming event handling (Azure path)**: Process Responses API event stream -- `response.output_text.delta` for text, `response.function_call_arguments.delta` for tool args, `response.reasoning_summary.delta` for reasoning summaries. Route through the same `ChannelCallbacks` interface as the Chat Completions path
- **Reasoning summary support**: Wire `response.reasoning_summary.delta` events to existing `callbacks.onReasoningChunk()` -- this is the primary motivation for the migration. This follows from the reasoning-display normalization work
- **Tool result submission (Azure path)**: After tool execution, append `ResponseFunctionToolCallOutputItem` (with `call_id` and `output`) to the input array for the next turn, instead of Chat Completions' `{ role: "tool", tool_call_id, content }`
- **Dual-path conversation state**: The canonical `messages` array (`ChatCompletionMessageParam[]`) is maintained for MiniMax. For Azure, a parallel `ResponseInput` array accumulates output items and tool results in Responses API format. Both are kept in sync so switching providers mid-conversation is theoretically possible
- **Update OpenAI mock in `core.test.ts`**: The mock currently only mocks `client.chat.completions.create`. Need to add `client.responses.create` mock for Azure-path tests
- **Update all affected tests**: Ensure all 104 core tests pass with the new dual-path architecture
- **Keep `ChannelCallbacks` interface unchanged**: Adapters (CLI, Teams) should not need any changes -- they consume callbacks, not API details

### Out of Scope
- Migrating MiniMax to the Responses API (it does not support it)
- Changing the `ChannelCallbacks` interface
- Modifying `agent.ts` (CLI adapter) or `teams.ts` (Teams adapter)
- Adding new tools or changing tool behavior
- Using `previous_response_id` for server-side conversation state (we continue managing state client-side)
- Upgrading the `openai` npm package (^4.78.0 already has `client.responses`)
- The reasoning display normalization itself (separate planning doc -- this work feeds into it)

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

## Open Questions
- [x] ~~System prompt: `instructions` param vs `input` array~~ -- resolved, use `instructions`
- [x] ~~Reasoning items for conversation continuity~~ -- resolved, track and re-submit
- [x] ~~`store: false` for privacy~~ -- resolved, use `store: false`
- [x] ~~Internal message type~~ -- resolved, keep `ChatCompletionMessageParam[]` and convert on-the-fly

## Decisions Made
- Client-side state management (manual `input` array) rather than `previous_response_id` -- keeps parity with current architecture and avoids server-side dependency
- Keep `ChannelCallbacks` interface unchanged -- adapters are isolated from API details by design
- MiniMax stays on Chat Completions API indefinitely
- The `openai` package at ^4.78.0 already ships `client.responses` on both `OpenAI` and `AzureOpenAI` classes -- no package upgrade needed
- **System prompt via `instructions` parameter** -- cleaner than stuffing system message into the `input` array. The `instructions` param is purpose-built for this. The system message is extracted from the `messages` array during conversion and passed separately
- **Track and re-submit reasoning items** -- after each Azure Responses API call, append `response.output` (which includes `ResponseReasoningItem`, `ResponseOutputMessage`, and `ResponseFunctionToolCall` items) to the input array for subsequent turns. This gives ~3% performance improvement on reasoning benchmarks and maintains reasoning continuity across tool-use loops
- **Use `store: false` and `include: ["reasoning.encrypted_content"]`** -- `store: false` prevents Azure from persisting response data server-side (default behavior on Azure may store data up to 30 days for abuse monitoring depending on subscription tier). Since we use stateless client-side state management, we must also include `reasoning.encrypted_content` so that reasoning items come back with encrypted tokens that can be passed in subsequent turns. Without this, reasoning items would lack the encrypted content needed for multi-turn reasoning continuity in stateless mode. The encrypted content is decrypted in-memory during inference and never persisted
- **Keep `ChatCompletionMessageParam[]` as canonical message type, convert on-the-fly** -- minimizes disruption. The `messages` array stays in Chat Completions format. Before each Azure API call, a conversion function translates messages to `ResponseInput` format. After the response, output items are stored in a parallel Azure-specific structure for re-submission, while assistant/tool messages are also appended to the canonical `messages` array so both providers share the same conversation history
- **This work is a followup to the reasoning-display normalization** (planning-reasoning-display.md). The `ChannelCallbacks` interface with `onReasoningChunk` is already the unified interface. This migration provides actual reasoning summaries from Azure that feed through that interface. Shared code paths should be used wherever possible -- no unnecessary provider-specific abstractions where a shared approach works

## Context / References
- `src/core.ts` lines 396-575: `runAgent()` function -- the primary migration target
- `src/core.ts` lines 68-183: `tools` array -- Chat Completions tool format, needs conversion for Responses API
- `src/core.ts` lines 386-394: `ChannelCallbacks` interface -- must remain unchanged
- `src/core.ts` lines 24-56: `getClient()` -- returns `OpenAI` or `AzureOpenAI`, already provider-aware
- `src/core.ts` lines 409-413: current Azure-specific params (`reasoning_effort: "medium"`)
- `src/__tests__/core.test.ts`: 104 tests, mock at lines 22-36 mocks `chat.completions.create` only
- `docs/2026-02-24-1816-planning-reasoning-display.md`: reasoning display normalization -- this migration is a followup that provides actual reasoning data from Azure
- OpenAI SDK types: `node_modules/openai/resources/responses/responses.d.ts`
  - `ResponseCreateParamsBase` (line 3642): `input`, `model`, `instructions`, `reasoning`, `tools`, `stream`, `store`, `include`
  - `ResponseStreamEvent` (line 3168): union of all streaming events
  - `ResponseTextDeltaEvent`: `{ type: "response.output_text.delta", delta: string }`
  - `ResponseFunctionCallArgumentsDeltaEvent`: `{ type: "response.function_call_arguments.delta", delta: string }`
  - `ResponseReasoningSummaryDeltaEvent`: `{ type: "response.reasoning_summary.delta", delta: unknown }`
  - `ResponseOutputItemAddedEvent`: `{ type: "response.output_item.added", item: ResponseOutputItem }`
  - `ResponseOutputItemDoneEvent`: `{ type: "response.output_item.done", item: ResponseOutputItem }`
  - `ResponseFunctionToolCall`: `{ type: "function_call", call_id, name, arguments }`
  - `ResponseFunctionToolCallOutputItem`: `{ type: "function_call_output", call_id, output, id }`
  - `FunctionTool`: `{ type: "function", name, description, parameters, strict }`
  - `EasyInputMessage`: `{ role, content, type?: "message" }`
  - `ResponseReasoningItem`: `{ type: "reasoning", id, summary: [{ text, type: "summary_text" }], encrypted_content? }`
  - `ResponseIncludable`: `"reasoning.encrypted_content" | ...`
  - `Shared.Reasoning`: `{ effort?: "low"|"medium"|"high", summary?: "auto"|"concise"|"detailed" }`
- Key API differences summary:
  - Chat Completions: `messages` array, `delta.content`, `delta.tool_calls[].function.arguments`, `tool_call.id`
  - Responses API: `input` array + `instructions`, event-based stream, `call_id` instead of `tool_call_id`, `function_call_output` instead of `{ role: "tool" }`
- Multi-turn reasoning pattern (from OpenAI cookbook): append `response.output` to input array between turns, add `function_call_output` for tool results. With `store: false`, must use `include: ["reasoning.encrypted_content"]` so reasoning items carry encrypted tokens for subsequent turns
- Azure data retention: default behavior may store data up to 30 days for abuse monitoring. `store: false` prevents server-side persistence. Zero Data Retention (ZDR) is available for EA/MCA customers via support ticket
- OpenAI data controls docs: https://developers.openai.com/api/docs/guides/your-data/
- Azure OpenAI data privacy: https://learn.microsoft.com/en-us/legal/cognitive-services/openai/data-privacy
- OpenAI reasoning cookbook: https://developers.openai.com/cookbook/examples/responses_api/reasoning_items/

## Notes
The migration is scoped to `core.ts` only. The `ChannelCallbacks` abstraction layer means adapters (agent.ts, teams.ts) are completely isolated from which API is used. The main complexity is in the stream processing -- Responses API uses discrete events instead of delta chunks, so the stream loop needs two separate implementations (one per provider). The outer tool-use loop structure (call model, parse tool calls, execute, submit results, call model again) should be shared, with only the API call and stream parsing branching per provider.

Design principle: anything that makes sense to share across providers IS shared. The provider branch should be as narrow as possible -- ideally just the API call construction and stream event parsing. Tool execution, callback dispatch, abort handling, and loop control are provider-agnostic and stay shared.

## Progress Log
- 2026-02-24 19:50 Created
- 2026-02-24 19:56 Resolved all open questions, refined scope and decisions based on user feedback and API research
