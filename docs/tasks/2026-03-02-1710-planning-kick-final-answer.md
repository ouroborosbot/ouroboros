# Planning: Inject final_answer Tool After Narration Kick

**Status**: NEEDS_REVIEW
**Created**: 2026-03-02 17:10

## Goal
Handle false-positive narration kicks gracefully by injecting `final_answer` into the tool list after a kick fires. If the kick was correct, the model will call a real tool on retry. If it was a false positive, the model can route its legitimate answer through `final_answer` instead of being discarded.

## Scope

### In Scope
- Move `activeTools` computation inside the while loop (or make it reactive) so it can include `final_answer` after a narration kick
- After a narration kick fires, include `final_answer` in the tool list for the retry iteration
- Update the narration kick message to explicitly name `final_answer` as an escape hatch
- Update `finalAnswerTool.description` to be general-purpose (not tied to `tool_choice required` only)
- Tests: new cases for "after kick, final_answer is in tool list" and "model calls final_answer after narration kick -- terminates cleanly"
- Update existing tests whose assertions depend on the old kick message text or tool list composition

### Out of Scope
- Context-aware kick messages (suggesting specific tools based on conversation)
- Detecting trivial compliance (model calling no-op tools like `get_current_time` to satisfy kicks)
- Changes to kick pattern matching (TOOL_INTENT_PATTERNS)
- Changes to the `final_answer` interception/extraction logic (it already works)
- Changes to Azure Responses API path (the tool injection is provider-agnostic since `activeTools` feeds both paths)

## Completion Criteria
- [ ] `activeTools` is computed per-iteration, including `final_answer` when narration kick has fired (`kickCount > 0` and last kick was narration) or `toolChoiceRequired`
- [ ] Narration kick message updated to explicitly name `final_answer`
- [ ] `finalAnswerTool.description` is general-purpose (not tied to tool_choice required)
- [ ] Test: after narration kick, `final_answer` is present in tools sent to API
- [ ] Test: model calls `final_answer` after narration kick -- terminates cleanly with extracted answer
- [ ] Test: after empty kick, `final_answer` is NOT in tools (narration-only injection)
- [ ] Existing kick tests updated for new message text
- [ ] Existing `final_answer` tests still pass
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
(all resolved)

## Decisions Made
- Inject `final_answer` after narration kicks only. Empty kicks are never false positives (empty response is always wrong). Tool_required kicks already have `final_answer` via `toolChoiceRequired`. Narration kicks are the sole source of false positives.
- Kick message explicitly names `final_answer`. The model needs to know the tool exists to use it. Message: `"I narrated instead of acting. Calling the tool now -- if I've already finished, I can use final_answer."`

## Context / References
- `src/engine/core.ts` line 194-195: `activeTools` is computed once before the while loop
- `src/engine/core.ts` lines 262-283: kick detection and assistant message injection
- `src/engine/core.ts` lines 287-301: `final_answer` sole-call interception (already works)
- `src/engine/kicks.ts` line 29: narration kick message: `"I narrated instead of acting. Calling the tool now."`
- `src/engine/tools-base.ts` lines 247-259: `finalAnswerTool` definition with tool_choice-specific description
- `src/__tests__/engine/core.test.ts` lines 2822-2916: kick mechanism tests
- `src/__tests__/engine/core.test.ts` lines 3155-3619: final_answer tests
- `src/__tests__/engine/core.test.ts` lines 3620-3930: integration kick + tool_choice required tests
- `src/__tests__/engine/kicks.test.ts`: kick unit tests (message assertions will need updating)

## Notes
The existing `final_answer` interception at core.ts:287-301 is fully provider-agnostic and handles sole calls, mixed calls, JSON parse errors, and missing answer fields. No changes needed there -- only the tool list injection point needs to change.

## Progress Log
- 2026-03-02 17:10 Created
- 2026-03-02 17:14 Resolved open questions, finalized scope to narration-only injection
