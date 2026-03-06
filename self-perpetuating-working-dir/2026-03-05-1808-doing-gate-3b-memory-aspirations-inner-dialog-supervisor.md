# Doing: Gate 3b Memory, Aspirations, Inner Dialog + Supervisor

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-05 18:08
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-1808-doing-gate-3b-memory-aspirations-inner-dialog-supervisor/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Implement Gate 3b foundations that make the agent persistent and self-directed: memory write/read paths, aspiration bootstrap loading, autonomous inner dialog session, instincts framework, and a supervisor with heartbeat/restart behavior.

## Completion Criteria
- [ ] Agent memory: fact extraction runs after each engine turn (regex highlight detector)
- [ ] Agent memory: extract-before-trim hook prevents fact loss on context window trim
- [ ] Agent memory: `memory_search` tool callable by the model
- [ ] Agent memory: associative recall injects relevant facts into system prompt before model calls (embedding-based similarity)
- [ ] Agent memory: provider-agnostic embedding interface implemented (swappable between OpenAI, Anthropic, etc.)
- [ ] Agent memory: fact store (with vectors), entity index, and daily log data structures working
- [ ] Agent memory: dedup prevents duplicate fact storage (word-overlap >60% = skip)
- [ ] Agent memory complements (not replaces) per-friend `save_friend_note` system
- [ ] Aspiration layer exists in bundle and is loaded on bootstrap
- [ ] Inner dialog session starts on supervisor boot (self-initiated, no friend message needed)
- [ ] Inner dialog uses CLI-like tool access (local tools yes, Teams/OAuth tools no)
- [ ] Inner dialog bootstrap message provides full context (psyche, aspirations, current state)
- [ ] Inner dialog persists to disk and survives crash/restart
- [ ] Inner dialog instincts framework exists — agent can configure instinct definitions in its bundle
- [ ] Instincts produce user-role messages during autonomous inner dialog (not hardcoded "continue")
- [ ] Heartbeat fires at configurable interval when agent is resting, nudging inner dialog to check in
- [ ] Agent can rest (not burning tokens) without going permanently dormant (heartbeat wakes it)
- [ ] Supervisor keeps agent process alive (tested with simulated crash)
- [ ] Supervisor starts inner dialog session on boot and maintains heartbeat
- [ ] `npm test` green
- [ ] 100% coverage on new code
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

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ✅ Unit 0: Baseline Gate 3b Inventory
**What**: Capture current memory/runtime/autonomy state so implementation deltas are explicit.
**Output**: `baseline-gate-3b-inventory.md` artifact.
**Acceptance**: Inventory identifies current gaps for memory, inner dialog, instincts, and supervisor.

### ⬜ Unit 1a: Memory Write Path Tests (Red)
**What**: Add failing tests for post-turn regex highlight extraction, fact persistence, and dedup (>60% overlap skip).
**Output**: Failing tests for memory write pipeline behavior.
**Acceptance**: Tests fail before memory write implementation exists.

### ⬜ Unit 1b: Memory Write Path Implementation (Green)
**What**: Implement fact extraction/persistence and dedup pipeline.
**Output**: Memory write pipeline code + passing tests.
**Acceptance**: Facts are captured once per novel highlight and stored in bundle memory paths.

### ⬜ Unit 1c: Memory Write Coverage + Refactor
**What**: Close branch/error-path coverage for write pipeline and refactor for clarity.
**Output**: Coverage evidence for memory write path.
**Acceptance**: New write-path code 100% covered.

### ⬜ Unit 2a: Extract-Before-Trim Hook Tests (Red)
**What**: Add failing tests that verify extraction runs before context trim drops messages.
**Output**: Red tests around post-turn ordering.
**Acceptance**: Ordering tests fail before hook integration.

### ⬜ Unit 2b: Extract-Before-Trim Hook Implementation (Green)
**What**: Integrate extraction-before-trim hook in turn lifecycle.
**Output**: Lifecycle integration code + passing tests.
**Acceptance**: Facts preserved even when trim removes original messages.

### ⬜ Unit 2c: Hook Coverage + Refactor
**What**: Cover ordering/error paths and refactor lifecycle integration.
**Output**: Coverage evidence for hook behavior.
**Acceptance**: Hook-related code 100% covered.

### ⬜ Unit 3a: `memory_search` Tool Tests (Red)
**What**: Add failing tests for model-callable memory search tool behavior.
**Output**: Red tool tests for query, empty, and error paths.
**Acceptance**: Tests fail before tool implementation/registration.

### ⬜ Unit 3b: `memory_search` Tool Implementation (Green)
**What**: Implement and register `memory_search` in repertoire tools.
**Output**: Tool implementation + registry wiring.
**Acceptance**: Tool callable and returns relevant memory hits.

### ⬜ Unit 3c: `memory_search` Coverage + Contract Refactor
**What**: Raise tool coverage and tighten contracts/summaries.
**Output**: Coverage evidence + contract updates.
**Acceptance**: New memory search code 100% covered.

### ⬜ Unit 4a: Associative Recall + Embedding Interface Tests (Red)
**What**: Add failing tests for provider-agnostic embedding interface and recalled-context prompt injection.
**Output**: Red tests for recall retrieval and prompt integration.
**Acceptance**: Tests fail before embedding/retrieval implementation.

### ⬜ Unit 4b: Associative Recall + Embedding Interface Implementation (Green)
**What**: Implement pluggable embeddings + cosine recall and inject recalled facts pre-model-call.
**Output**: Embedding interface + recall integration.
**Acceptance**: Relevant facts appear in prompt recalled-context section.

### ⬜ Unit 4c: Recall Coverage + Refactor
**What**: Cover retrieval thresholds/fallbacks and refactor interface boundaries.
**Output**: Coverage evidence for recall path.
**Acceptance**: New recall code 100% covered.

### ⬜ Unit 5a: Memory Data Structures + Compatibility Tests (Red)
**What**: Add failing tests for facts-with-vectors, entity index, daily logs, and non-replacement of friend memory.
**Output**: Red structural/compatibility tests.
**Acceptance**: Tests fail before structure/policy implementation.

### ⬜ Unit 5b: Memory Data Structures + Compatibility Implementation (Green)
**What**: Implement data schemas/stores and explicit compatibility behavior with `save_friend_note`.
**Output**: Memory structure implementation.
**Acceptance**: Data files and compatibility policy validated by tests.

### ⬜ Unit 5c: Data Structure Coverage + Refactor
**What**: Close structure edge-case coverage and refactor persistence helpers.
**Output**: Coverage evidence for data store code.
**Acceptance**: New store/schema code 100% covered.

### ⬜ Unit 6a: Aspiration Bootstrap Loading Tests (Red)
**What**: Add failing tests for loading `psyche/ASPIRATIONS.md` during bootstrap.
**Output**: Red bootstrap tests.
**Acceptance**: Tests fail before aspiration integration.

### ⬜ Unit 6b: Aspiration Bootstrap Loading Implementation (Green)
**What**: Implement aspiration loading and include in startup context.
**Output**: Bootstrap integration code.
**Acceptance**: Aspirations present in bootstrap context and persisted paths.

### ⬜ Unit 6c: Aspiration Coverage + Refactor
**What**: Cover missing-file/default/error paths and refactor loader.
**Output**: Coverage evidence for aspiration loader.
**Acceptance**: New aspiration code 100% covered.

### ⬜ Unit 7a: Inner Dialog Session + Instincts Tests (Red)
**What**: Add failing tests for autonomous inner-dialog entrypoint, session path, instinct-config loading, and user-role instinct messages.
**Output**: Red tests for inner dialog/instinct runtime behavior.
**Acceptance**: Tests fail before new session/instinct implementation.

### ⬜ Unit 7b: Inner Dialog Session + Instincts Implementation (Green)
**What**: Implement inner-dialog runtime entrypoint and configurable instincts pipeline.
**Output**: Inner dialog session code + instinct engine.
**Acceptance**: Autonomous session runs with CLI-safe tools and instinct-driven user-role turns.

### ⬜ Unit 7c: Inner Dialog Coverage + Refactor
**What**: Cover rest/continue, missing-instinct-config, and persistence/restart edges.
**Output**: Coverage evidence for inner-dialog + instincts code.
**Acceptance**: New runtime code 100% covered.

### ⬜ Unit 8a: Supervisor + Heartbeat + Crash Recovery Tests (Red)
**What**: Add failing integration-style tests using real child processes for spawn/restart/backoff/heartbeat.
**Output**: Red process-lifecycle tests.
**Acceptance**: Tests fail before supervisor implementation.

### ⬜ Unit 8b: Supervisor + Heartbeat + Crash Recovery Implementation (Green)
**What**: Implement Node supervisor that starts inner dialog, heartbeat nudges, and crash-restarts with backoff.
**Output**: Supervisor runtime code + scripts/entry wiring.
**Acceptance**: Real-process tests pass; restart + heartbeat behavior verified.

### ⬜ Unit 8c: Supervisor Coverage + Gate Verification
**What**: Run full verification (`npm test`, `npm run test:coverage:vitest`, `npx tsc`) and sync Gate 3b checklists in planning/doing docs.
**Output**: Verification logs + checklist sync.
**Acceptance**: Gate 3b criteria satisfied with green verification evidence.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./self-perpetuating-working-dir/2026-03-05-1808-doing-gate-3b-memory-aspirations-inner-dialog-supervisor/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-05 18:08 Created from planning doc
- 2026-03-05 18:08 Granularity pass: split Gate 3b into 8 TDD streams (memory write/hook/tool/recall/store, aspirations, inner dialog/instincts, supervisor/heartbeat)
- 2026-03-05 18:08 Validation pass: aligned units to all Gate 3b completion criteria and real-process supervisor test guidance
- 2026-03-05 18:08 Quality pass: verified strict TDD sequencing, coverage gates, and execution readiness
- 2026-03-05 18:09 Unit 0 complete: captured baseline inventory for memory scaffolds and identified missing Gate 3b runtime/tooling capabilities
