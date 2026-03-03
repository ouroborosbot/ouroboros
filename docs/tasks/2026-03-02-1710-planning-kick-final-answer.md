# Planning: Inject final_answer Tool After Narration Kick

**Status**: drafting
**Created**: 2026-03-02 17:10

## Goal
Handle false-positive narration kicks gracefully by injecting `final_answer` into the tool list after a kick fires. If the kick was correct, the model will call a real tool on retry. If it was a false positive, the model can route its legitimate answer through `final_answer` instead of being discarded.

## Scope

### In Scope
- Move `activeTools` computation inside the while loop (or make it reactive) so it can include `final_answer` after a kick
- After any kick fires (narration, empty, tool_required), include `final_answer` in the tool list for the retry iteration
- Update the narration kick message to hint at `final_answer` as an escape hatch
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
- [ ] `activeTools` is computed per-iteration, including `final_answer` when `kickCount > 0` or `toolChoiceRequired`
- [ ] Narration kick message updated to mention `final_answer` as option
- [ ] `finalAnswerTool.description` is general-purpose
- [ ] Test: after narration kick, `final_answer` is present in tools sent to API
- [ ] Test: model calls `final_answer` after narration kick -- terminates cleanly with extracted answer
- [ ] Test: after empty kick, `final_answer` is present in tools sent to API
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
- [ ] Should `final_answer` be injected after ALL kick types (empty, narration, tool_required) or only narration? Empty kicks seem like they should always retry. Tool_required kicks already have `final_answer` (since `toolChoiceRequired` adds it). Proposal: inject after narration kicks only, since empty kicks are never false positives and tool_required already has the escape hatch.
- [ ] Should the narration kick message be updated to explicitly name `final_answer`, or just hint at it more subtly? Explicit naming teaches the model the tool exists.

## Decisions Made
- (none yet)

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
