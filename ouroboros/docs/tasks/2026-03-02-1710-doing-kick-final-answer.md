# Doing: Inject final_answer Tool After Narration Kick

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-02 17:40
**Planning**: ./2026-03-02-1710-planning-kick-final-answer.md
**Artifacts**: ./2026-03-02-1710-doing-kick-final-answer/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Handle false-positive narration kicks gracefully by injecting `final_answer` into the tool list after a kick fires. If the kick was correct, the model will call a real tool on retry. If it was a false positive, the model can route its legitimate answer through `final_answer` instead of being discarded.

## Completion Criteria
- [ ] `activeTools` is computed per-iteration, including `final_answer` when narration kick has fired (`kickCount > 0` and last kick was narration) or `toolChoiceRequired`
- [ ] Narration kick message updated to explicitly name `final_answer`
- [ ] `finalAnswerTool.description` is general-purpose (not tied to tool_choice required)
- [ ] `maxKicks` removed from `RunAgentOptions`, `kickCount < maxKicks` guard removed, kicks fire unconditionally (bounded only by `MAX_TOOL_ROUNDS`)
- [ ] `onKick` signature simplified to `onKick(): void` -- no attempt/maxKicks params
- [ ] `formatKick()` simplified -- no counter, just returns "kick"
- [ ] CLI and Teams `onKick` callbacks updated for new signature
- [ ] Test: after narration kick, `final_answer` is present in tools sent to API
- [ ] Test: model calls `final_answer` after narration kick -- terminates cleanly with extracted answer
- [ ] Test: after empty kick, `final_answer` is NOT in tools (narration-only injection)
- [ ] Existing kick tests updated for new message text and removed maxKicks
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

### ✅ Unit 0: Research and Inventory

**What**: Inventory all code and test locations that need changes. Verify line numbers from planning doc are still accurate.
**Output**: Confirmed list of files and line ranges to modify.
**Acceptance**: All references verified against current codebase. No surprises during implementation.

### ⬜ Unit 1a: Remove maxKicks and simplify onKick -- Tests

**What**: Update all existing test assertions that reference `maxKicks` or the `onKick(attempt, maxKicks)` signature. Write new tests that verify:
- `onKick` callback receives no arguments
- Kicks fire unconditionally (no maxKicks cap) -- bounded only by `MAX_TOOL_ROUNDS`
- The `maxKicks` option no longer exists on `RunAgentOptions`

Tests to update:
- `src/__tests__/engine/core.test.ts`: kick mechanism tests (~lines 2822-2940+) -- remove maxKicks from `runAgent` type, remove `{ attempt, maxKicks }` assertions, remove "does not kick when maxKicks exhausted" test, remove "maxKicks=0" test, update "allows up to 2 kicks" test to verify kicks fire until `MAX_TOOL_ROUNDS`
- `src/__tests__/engine/core.test.ts`: final_answer + kick integration tests (~lines 3620-3930) -- remove maxKicks from `runAgent` calls
- `src/__tests__/channels/cli-main.test.ts`: onKick callback tests (~lines 631-690) -- update `cb.onKick(1, 1)` to `cb.onKick()`, remove "various attempt/maxKicks values" test or rewrite
- `src/__tests__/channels/teams.test.ts`: onKick tests (~lines 338-356, 2165-2182, 3282-3326) -- update `callbacks.onKick!(2, 3)` to `callbacks.onKick!()`
- `src/__tests__/wardrobe/format.test.ts`: formatKick tests -- rewrite for new no-args signature

**Acceptance**: Tests updated for new signatures. Will not compile until Unit 1b production code changes are applied (type mismatch on `onKick` and `formatKick`).

### ⬜ Unit 1b: Remove maxKicks and simplify onKick -- Implementation

**What**: Make the tests from 1a pass by modifying production code:
- `src/engine/core.ts`: Remove `maxKicks` from `RunAgentOptions` interface (line 90), remove `const maxKicks = options?.maxKicks ?? 1` (line 176), change `kickCount < maxKicks` guard to unconditional kick (line 263), change `callbacks.onKick?.(kickCount, maxKicks)` to `callbacks.onKick?.()` (line 274), simplify `onKick` in `ChannelCallbacks` to `onKick?(): void` (line 83)
- `src/wardrobe/format.ts`: Change `formatKick(attempt, maxKicks)` to `formatKick()` -- always returns "kick" (line 11)
- `src/channels/cli.ts`: Update `onKick` callback to no-arg, call `formatKick()` (line 309-316)
- `src/channels/teams.ts`: Update `onKick` callback to no-arg, call `formatKick()` (line 193-200); remove `maxKicks: 3` from `agentOptions` (line 335)

**Acceptance**: All tests from 1a PASS (green). No warnings.

### ⬜ Unit 1c: Remove maxKicks -- Coverage and Refactor

**What**: Verify 100% coverage on changed code. Ensure no dead code remains from maxKicks removal. Run full test suite.
**Acceptance**: 100% coverage on all changed lines. All tests green. No warnings.

### ⬜ Unit 2a: Inject final_answer after narration kick -- Tests

**What**: Write new tests for the core behavior change AND update existing tests that assert on kick message text or `finalAnswerTool.description`:
- After a narration kick fires, `final_answer` should be in the tools sent to the API on the retry iteration
- After an empty kick fires, `final_answer` should NOT be in the tools (narration-only injection)
- Model calls `final_answer` after narration kick -- terminates cleanly with extracted answer
- `activeTools` is computed per-iteration (moves inside while loop or becomes reactive)
- When `toolChoiceRequired` is true, `final_answer` is still included (existing behavior preserved)
- Update existing assertions on narration kick message text (old: "I narrated instead of acting. Calling the tool now." -> new message mentioning `final_answer`)
- Update any assertions on `finalAnswerTool.description` text (old: tool_choice-specific -> new: general-purpose)

Tests to update for message text:
- `src/__tests__/engine/kicks.test.ts`: kick message assertions
- `src/__tests__/engine/core.test.ts`: any assertions on kick message content
- `src/__tests__/engine/tools.test.ts` (lines 554-563): `finalAnswerTool` description assertion -- update expected text from tool_choice-specific to general-purpose

**Acceptance**: New tests exist, compile, and FAIL (red) because `activeTools` is still computed once before the loop. Message text assertions updated to match planned new text.

### ⬜ Unit 2b: Inject final_answer after narration kick -- Implementation

**What**: Make the tests from 2a pass:
- `src/engine/core.ts`: Move `activeTools` computation inside the while loop. Add `import type { KickReason } from "./kicks"`. Track `let lastKickReason: KickReason | null = null` (set to `kick.reason` when a kick fires). Compute: `const activeTools = (options?.toolChoiceRequired || lastKickReason === "narration") ? [...baseTools, finalAnswerTool] : baseTools`
- `src/engine/kicks.ts`: Update narration kick message to: `"I narrated instead of acting. Calling the tool now -- if I've already finished, I can use final_answer."`
- `src/engine/tools-base.ts`: Update `finalAnswerTool.description` to be general-purpose: `"give your final text response. use this when you want to reply with text instead of calling another tool."`

**Acceptance**: All new tests PASS (green). All existing tests PASS. No warnings.

### ⬜ Unit 2c: Inject final_answer after narration kick -- Coverage and Refactor

**What**: Verify 100% coverage on all new/changed code. Run full test suite. Check for any remaining test assertions that reference old kick message text.
**Acceptance**: 100% coverage. All tests green. No warnings.

### ⬜ Unit 3: Final validation

**What**: Run full test suite. Verify no warnings. Verify 100% coverage on all new and changed code. Verify no leftover `maxKicks` references in production code (test code may reference it in "removed" context).
**Acceptance**: All tests pass. No warnings. No dead maxKicks code. 100% coverage.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-02-1710-doing-kick-final-answer/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-02 17:40 Created from planning doc (Pass 1 - First Draft)
- 2026-03-02 17:43 Pass 2 - Granularity: merged Unit 3 (message text updates) into Unit 2a, renumbered Unit 4 to Unit 3, clarified Unit 1a acceptance
- 2026-03-02 17:44 Pass 3 - Validation: fixed tools-base.test.ts reference to tools.test.ts, added KickReason import detail to Unit 2b
- 2026-03-02 17:44 Pass 4 - Quality: all checks pass, status set to READY_FOR_EXECUTION
- PLACEHOLDER Unit 0 complete
