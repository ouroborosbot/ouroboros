# Planning: Reasoning Item Persistence and Token Estimation

**Status**: drafting
**Created**: 2026-02-26 15:42

## Goal
Fix two bugs that cause the sliding context window to fail when using Azure Responses API reasoning models (gpt-5.2-chat) with `store: false`. Reasoning items are lost between turns (breaking reasoning continuity) and reasoning tokens are invisible to the token estimator (preventing context trimming from triggering).

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Store reasoning items from `result.outputItems` on assistant messages (e.g., as `_reasoning_items` field) so they persist in session JSON across turns
- Restore reasoning items in `toResponsesInput` when rebuilding `azureInput` from a loaded session
- Count reasoning items (especially `encrypted_content`) in `estimateTokens` so context trimming triggers correctly
- 100% test coverage on all new code

### Possibly In Scope (needs discussion)
- Whether to add per-message structural overhead to `estimateTokens` (~20 chars / 5 tokens per message) -- more accurate but breaks all existing test expectations (each test value shifts by messageCount * 5 tokens)
- Whether to track API-reported `usage` data (input_tokens, output_tokens, reasoning_tokens) instead of or alongside the chars/4 heuristic
- Whether chars/4 is accurate enough for `encrypted_content` (opaque content whose char length may not correlate with token count like natural language does)
- Whether `contextMargin` default should increase from 20% to accommodate within-turn reasoning growth (each tool round generates 1-3K reasoning tokens; over 10 rounds that is 10-30K tokens accumulating in azureInput within a single turn)
- Whether the `responses.compact` API (when available on Azure) should be part of this

### Out of Scope
- Changes to session save/load mechanics (JSON.stringify already preserves arbitrary properties on message objects)
- Changes to MiniMax path (reasoning items are Azure Responses API-specific; MiniMax reasoning is already in content via `<think>` tags)
- Changes to `trimMessages` logic itself (it works correctly once `estimateTokens` is accurate)

## Completion Criteria
- [ ] Reasoning items from `result.outputItems` are stored on assistant messages and persist through session save/load
- [ ] `toResponsesInput` restores reasoning items when rebuilding azureInput from loaded session messages
- [ ] Reasoning items emitted before assistant content in toResponsesInput (matching API item order)
- [ ] `estimateTokens` counts reasoning items including `encrypted_content` field
- [ ] Context trimming triggers correctly for sessions with large reasoning payloads
- [ ] Within-turn reasoning accumulation in azureInput is preserved (existing behavior unchanged)
- [ ] MiniMax path is unaffected
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
- [ ] Should we add per-message overhead to `estimateTokens`? It is more accurate but breaks all existing test expectations (each test value shifts by messageCount * 5 tokens).
- [ ] Should we use API-reported `usage` data for more accurate counting? The Responses API returns `usage.input_tokens`, `usage.output_tokens`, `usage.reasoning_tokens`.
- [ ] Is chars/4 accurate enough for `encrypted_content`? The encrypted content is opaque -- its char length may not correlate with token count the same way natural language does.
- [ ] Should `contextMargin` increase from 20% to accommodate within-turn reasoning growth? Each tool round generates 1-3K reasoning tokens; over 10 rounds that is 10-30K tokens of reasoning accumulating in azureInput within a single turn.

## Decisions Made
- `_reasoning_items` (underscore prefix) signals this is internal/private, not part of OpenAI types
- Reasoning items emitted BEFORE assistant content in `toResponsesInput` (matches API item order)
- Existing azureInput push behavior preserved (within-turn reasoning continuity stays as-is)

## Context / References
- `src/engine/core.ts` -- `runAgent` builds assistant messages at ~line 144-154, pushes outputItems to local azureInput at line 135-137
- `src/engine/streaming.ts` -- `toResponsesInput` at lines 10-59 converts messages to Responses API format; `TurnResult` interface at lines 4-8; `streamResponsesApi` collects outputItems at line 258
- `src/mind/context.ts` -- `estimateTokens` at lines 6-21, `trimMessages` at lines 45-76
- `src/config.ts` -- `contextMargin` default at line 59
- Existing test at `core.test.ts` line 1359 confirms reasoning item structure: `{ type: "reasoning", id: "r1", summary: [{ text: "thought", type: "summary_text" }], encrypted_content: "enc1" }`
- Azure Responses API docs: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses
- Azure docs state: "When using store: false, you must preserve reasoning context across conversation turns"
- OpenAI community discussion on encrypted_content: performance improvement is optional, not mandatory, but API guidance says to preserve them
- The API also supports `responses.compact` for shrinking context (not yet available on Azure)
- Session file observed at 223KB with 188 messages; `estimateTokens` reports only 44,195 tokens -- well under the 80K maxTokens threshold -- while model ran out of context mid-turn

## Notes
The root cause is that `azureInput` in `runAgent` is a local variable. Reasoning items collected during a turn exist there, but when the assistant message is built and pushed to `messages`, only `content` and `tool_calls` are preserved. On the next turn, `toResponsesInput` rebuilds `azureInput` from `messages` -- but reasoning items are gone.

The token estimation gap compounds this: `estimateTokens` only measures `msg.content` and `msg.tool_calls`, so even if reasoning items were somehow present, they would not be counted. The estimate says ~44K tokens while real context (including reasoning) is much higher. Trimming never triggers, and the model runs out of context mid-turn.

## Progress Log
- 2026-02-26 15:42 Created
