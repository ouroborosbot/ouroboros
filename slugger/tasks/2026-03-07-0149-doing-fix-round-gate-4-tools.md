# Doing: Fix Round Gate 4 Tools, Memory, and Trust

**Status**: in_progress
**Execution Mode**: direct
**Created**: 2026-03-07 01:49
**Planning**: ./2026-03-07-0149-planning-fix-round-gate-4-tools.md
**Artifacts**: ./2026-03-07-0149-doing-fix-round-gate-4-tools/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Implement Gate 4 tooling/memory/trust architecture changes: explicit memory and friend tools, embeddings graceful degradation, sense-layer trust gates (including stranger handling), `ouro link`, and non-canonical bundle nudge wiring.

## Completion Criteria
- [ ] `memory_save` and `get_friend_note` tools are implemented and tested end-to-end
- [ ] Embedding absence in memory paths degrades gracefully without hard failures
- [ ] Sense-layer trust gating prevents stranger traffic from reaching the LLM
- [ ] Stranger one-time auto-reply + subsequent silent-drop behavior is persisted and tested
- [ ] `ouro link` command writes expected friend identity links and is validated in tests
- [ ] Startup nudge for non-canonical bundle files is emitted and tested
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
**Strict TDD — no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ✅ Unit 0: Gate 4 Baseline Snapshot
**What**: Capture baseline snapshots for current tool registry, friend/trust handling paths, and daemon CLI command parsing before Gate 4 edits.
**Output**: Baseline artifacts under the gate artifacts directory.
**Acceptance**: Baseline files document pre-change behavior for all Gate 4 touchpoints.

### ⬜ Unit 1: `memory_save` + `get_friend_note` Tool Surface
**What**: Add tool contracts, runtime handlers, and registration for explicit memory/friend operations.
**Output**: Tool definitions, handler implementation, and tool-layer tests.
**Acceptance**: Both tools execute through standard tool invocation path and pass tests.

### ⬜ Unit 2: Embeddings Graceful Degradation
**What**: Implement write-time embedding fallback for `memory_save` and search-time fallback for empty-embedding facts in memory lookup.
**Output**: Updated memory module behavior and focused memory tests.
**Acceptance**: Missing embedding API path is non-fatal and fallback retrieval behavior is deterministic in tests.

### ⬜ Unit 3: Prompt Guidance Update
**What**: Update system prompt guidance for memory/friend tools to first-person prescriptive contract language from subsystem audit.
**Output**: Prompt assembly changes and prompt contract tests.
**Acceptance**: Generated prompts include required first-person guidance for all four memory/friend tools.

### ⬜ Unit 4: Trust Levels + Stranger Gate Enforcement
**What**: Wire trust-level evaluation in senses before model invocation and add one-time stranger auto-reply persistence + silent drops.
**Output**: Sense-layer trust gate implementation (`cli`/`teams` paths) and test coverage proving no LLM call on stranger traffic.
**Acceptance**: Stranger path never reaches LLM invocation and reply-once semantics are enforced in tests.

### ⬜ Unit 5: `ouro link` CLI + Identity Link Wiring
**What**: Add `ouro link` command parse/dispatch and integrate friend external-id linking updates.
**Output**: Daemon CLI/parser/handler updates with link-path tests.
**Acceptance**: Command validates inputs and persists identity link changes as expected.

### ⬜ Unit 6: Non-Canonical Bundle Nudge Wiring
**What**: Connect manifest detection output to startup inner-dialog nudge event/message contract.
**Output**: Runtime startup hook + tests for nudge emission.
**Acceptance**: Non-canonical file presence triggers deterministic nudge behavior covered by tests.

### ⬜ Unit 7: Full Verification
**What**: Run full validation (`npm test`, `npm run build`, `npm run lint`, `npm run test:coverage`) and stale-contract scans for Gate 4 surfaces.
**Output**: Verification logs + scan artifacts in the artifacts directory.
**Acceptance**: Full suite/build/lint/coverage all pass with no warnings.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each unit completion
- Push after each unit complete
- Run full relevant tests before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-07-0149-doing-fix-round-gate-4-tools/` directory
- **Fixes/blockers**: Resolve autonomously; only block on hard external impossibility

## Progress Log
- 2026-03-07 01:49 Created from planning doc.
- 2026-03-07 01:49 Unit 0 complete: Captured Gate 4 baseline scan points and established execution units.
