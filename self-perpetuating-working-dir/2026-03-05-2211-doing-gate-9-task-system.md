# Doing: Gate 9 Task System

**Status**: drafting
**Execution Mode**: direct
**Created**: 2026-03-05 22:11
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-2211-doing-gate-9-task-system/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Implement a model-usable task system under bundle-backed task storage so agents can create, validate, transition, visualize, and archive work autonomously using first-class task tools.

## Completion Criteria
- [ ] Task module implemented with all components from the spec
- [ ] Task tools exposed and callable by the model
- [ ] Write-time enforcement gates working (template, transitions, spawn)
- [ ] Task board injected into system prompt
- [ ] Model can autonomously create, track, and complete tasks through the full lifecycle
- [ ] Completed tasks archive correctly
- [ ] 
> ouroboros-agent-harness@1.0.0 test
> vitest run


 RUN  v4.0.18 /Users/arimendelow/Projects/ouroboros-agent-harness

 ✓ src/__tests__/senses/teams.test.ts (171 tests) 1122ms
     ✓ exports createTeamsCallbacks  509ms
 ✓ src/__tests__/heart/core.test.ts (207 tests | 18 skipped) 518ms
 ✓ src/__tests__/senses/cli.test.ts (58 tests) 313ms
 ✓ src/__tests__/scripts/auth-scripts.test.ts (4 tests) 251ms
 ✓ src/__tests__/supervisor/supervisor.test.ts (2 tests) 226ms
 ✓ src/__tests__/repertoire/tools.test.ts (189 tests) 188ms
 ✓ src/__tests__/mind/prompt.test.ts (72 tests) 163ms
 ✓ src/__tests__/senses/cli-main.test.ts (35 tests) 118ms
 ✓ src/__tests__/senses/cli-ux.test.ts (16 tests) 114ms
 ✓ src/__tests__/heart/streaming.test.ts (91 tests) 67ms
 ✓ src/__tests__/heart/turn-coordinator.test.ts (7 tests) 42ms
 ✓ src/__tests__/mind/friends/store-file.test.ts (27 tests) 44ms
 ✓ src/__tests__/mind/context.test.ts (37 tests) 31ms
 ✓ src/__tests__/nerves/bundle-skeleton.contract.test.ts (4 tests) 8ms
 ✓ src/__tests__/config.test.ts (48 tests) 28ms
 ✓ src/__tests__/identity.test.ts (28 tests) 20ms
 ✓ src/__tests__/repertoire/commands.test.ts (28 tests) 19ms
 ✓ src/__tests__/repertoire/skills.test.ts (21 tests) 18ms
 ✓ src/__tests__/nerves/coverage-cli.test.ts (3 tests) 18ms
 ✓ src/__tests__/mind/knowledge-graph-import.test.ts (4 tests) 17ms
 ✓ src/__tests__/repertoire/ado-semantic.test.ts (82 tests) 17ms
 ✓ src/__tests__/heart/kicks.test.ts (107 tests) 15ms
 ✓ src/__tests__/wardrobe/phrases.test.ts (10 tests) 12ms
 ✓ src/__tests__/senses/inner-dialog.test.ts (17 tests) 13ms
 ✓ src/__tests__/repertoire/github-client.test.ts (13 tests) 13ms
 ✓ src/__tests__/repertoire/ado-client.test.ts (35 tests) 12ms
 ✓ src/__tests__/mind/memory.test.ts (10 tests) 11ms
 ✓ src/__tests__/supervisor/supervisor-branches.test.ts (12 tests) 13ms
 ✓ src/__tests__/repertoire/graph-client.test.ts (22 tests) 12ms
 ✓ src/__tests__/mind/associative-recall.test.ts (16 tests) 10ms
 ✓ src/__tests__/nerves/audit-integration.test.ts (9 tests) 10ms
 ✓ src/__tests__/mind/friends/resolver.test.ts (20 tests) 8ms
 ✓ src/__tests__/repertoire/ado-templates.test.ts (21 tests) 8ms
 ✓ src/__tests__/heart/governance-loader.test.ts (6 tests) 8ms
 ✓ src/__tests__/nerves/sinks.test.ts (1 test) 8ms
 ✓ src/__tests__/wardrobe/format.test.ts (9 tests) 7ms
 ✓ src/__tests__/harness/teardown-contract.test.ts (4 tests) 7ms
 ✓ src/__tests__/senses/cli-logging.test.ts (1 test) 7ms
 ✓ src/__tests__/repertoire/ado-context.test.ts (11 tests) 7ms
 ✓ src/__tests__/nerves/coverage-cli-main.test.ts (1 test) 6ms
 ✓ src/__tests__/repertoire/tools-github.test.ts (15 tests) 6ms
 ✓ src/__tests__/mind/friends/tokens.test.ts (6 tests) 6ms
 ✓ src/__tests__/nerves/coverage-run-artifacts.test.ts (4 tests) 6ms
 ✓ src/__tests__/mind/friends/types.test.ts (18 tests) 6ms
 ✓ src/__tests__/nerves/coverage-audit.test.ts (8 tests) 6ms
 ✓ src/__tests__/mind/memory-capture.test.ts (4 tests) 5ms
 ✓ src/__tests__/nerves/logger.test.ts (8 tests) 5ms
 ✓ src/__tests__/supervisor/supervisor-entry-core.test.ts (8 tests) 5ms
 ✓ src/__tests__/mind/friends/channel.test.ts (7 tests) 5ms
 ✓ src/__tests__/mind/friends/store.test.ts (7 tests) 5ms
 ✓ src/__tests__/senses/inner-dialog-worker.test.ts (6 tests) 5ms
 ✓ src/__tests__/mind/first-impressions.test.ts (11 tests) 5ms
 ✓ src/__tests__/nerves/runtime.test.ts (2 tests) 4ms
 ✓ src/__tests__/nerves/non-blocking-sinks.test.ts (2 tests) 5ms
 ✓ src/__tests__/governance/convention.test.ts (5 tests) 5ms
 ✓ src/__tests__/mind/token-estimate.test.ts (13 tests) 4ms
 ✓ src/__tests__/repertoire/tools-remote-safety.test.ts (3 tests) 4ms
 ✓ src/__tests__/heart/api-error.test.ts (9 tests) 4ms
 ✓ src/__tests__/nerves/audit-rules.test.ts (16 tests) 4ms
 ✓ src/__tests__/nerves/per-test-capture.test.ts (4 tests) 4ms
 ✓ src/__tests__/nerves/source-scanner.test.ts (9 tests) 3ms
 ✓ src/__tests__/nerves/file-completeness.test.ts (9 tests) 3ms
 ✓ src/__tests__/repertoire/tools-registry.contract.test.ts (4 tests) 3ms
 ✓ src/__tests__/nerves/naming-consistency.test.ts (1 test) 3ms
 ✓ src/__tests__/nerves/coverage-contract.test.ts (6 tests) 3ms
 ✓ src/__tests__/heart/harness-primitives.contract.test.ts (3 tests) 2ms
 ✓ src/__tests__/nerves/rename-contract.test.ts (3 tests) 2ms
 ✓ src/__tests__/nerves/trace.test.ts (2 tests) 2ms
 ✓ src/__tests__/setup.test.ts (1 test) 1ms

 Test Files  69 passed (69)
      Tests  1635 passed | 18 skipped (1653)
   Start at  22:11:27
   Duration  12.71s (transform 977ms, setup 663ms, import 1.10s, tests 3.65s, environment 4ms) green
- [ ] 100% coverage on new code

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No  or equivalent on new code
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

### ⬜ Unit 0: Baseline + contract framing
**What**: Map existing task-related code paths, prompt assembly integration points, and bundle task directory expectations after Gate 8 path migration.
**Output**: .
**Acceptance**: Artifact identifies concrete files/functions for module, tooling, prompt board injection, and lifecycle archive flow.

### ⬜ Unit 1a: Task module contracts and status model tests (Red)
**What**: Add failing tests for canonical task schema, parser/scanner behavior, 8-status transition model, and filename/type normalization.
**Output**: Red tests + .
**Acceptance**: New tests fail against current implementation baseline and encode Gate 9 status/transition expectations.

### ⬜ Unit 1b: Task module core implementation (Green)
**What**: Implement core task module primitives (types, parser, scanner, transitions, board view model, lifecycle hooks, middleware seam) backed by .
**Output**: Module implementation +  + .
**Acceptance**: Unit 1a tests pass and task module surfaces compile cleanly.

### ⬜ Unit 1c: Task module coverage + refactor
**What**: Close coverage gaps and simplify core task-module internals without changing behavior.
**Output**: .
**Acceptance**: 100% coverage on task-module code changed in Units 1a/1b with full suite green.

### ⬜ Unit 2a: Task tools + write-time gate tests (Red)
**What**: Add failing tool-layer tests for , , , and write-time enforcement (template validity, transition legality, spawn constraints).
**Output**: Red tests + .
**Acceptance**: Tests fail before implementation and demonstrate required enforcement behavior.

### ⬜ Unit 2b: Task tools + enforcement implementation (Green)
**What**: Implement task tools in the tool registry and wire write-time gate validation paths.
**Output**: Tool implementation +  + .
**Acceptance**: Task tools callable by model-facing registry; Unit 2a tests pass with enforced gates.

### ⬜ Unit 2c: Tooling coverage + integration refactor
**What**: Raise coverage to 100% on new tool/enforcement code and refactor for clear error semantics.
**Output**: .
**Acceptance**: Coverage is 100% for touched tooling code and all tests remain green.

### ⬜ Unit 3a: Task board prompt integration tests (Red)
**What**: Add failing tests proving task board context is injected into the system prompt and planning/doing docs map to lifecycle states (, , etc.).
**Output**: Red tests + .
**Acceptance**: Tests fail before integration work and capture expected prompt payload shape.

### ⬜ Unit 3b: Prompt integration + lifecycle/archive implementation (Green)
**What**: Integrate task board into prompt assembly and implement lifecycle archival flow for completed tasks.
**Output**: Implementation +  + .
**Acceptance**: Prompt includes task board snapshot; completed tasks move to archive via deterministic lifecycle behavior.

### ⬜ Unit 3c: Lifecycle/prompt coverage hardening
**What**: Add edge/error-case tests and refactor prompt/lifecycle code for maintainability.
**Output**: .
**Acceptance**: 100% coverage for new lifecycle/prompt code and regression suite remains green.

### ⬜ Unit 4: End-to-end autonomous task flow verification
**What**: Validate model-usable flow across create -> board -> transition -> completion -> archive with artifacted proof.
**Output**:  +  +  + .
**Acceptance**: Completion criteria evidence captured, 
> ouroboros-agent-harness@1.0.0 test
> vitest run


 RUN  v4.0.18 /Users/arimendelow/Projects/ouroboros-agent-harness

 ✓ src/__tests__/senses/teams.test.ts (171 tests) 1050ms
     ✓ exports createTeamsCallbacks  430ms
 ✓ src/__tests__/heart/core.test.ts (207 tests | 18 skipped) 526ms
 ✓ src/__tests__/senses/cli.test.ts (58 tests) 312ms
 ✓ src/__tests__/scripts/auth-scripts.test.ts (4 tests) 248ms
 ✓ src/__tests__/supervisor/supervisor.test.ts (2 tests) 229ms
 ✓ src/__tests__/repertoire/tools.test.ts (189 tests) 187ms
 ✓ src/__tests__/mind/prompt.test.ts (72 tests) 160ms
 ✓ src/__tests__/senses/cli-main.test.ts (35 tests) 119ms
 ✓ src/__tests__/senses/cli-ux.test.ts (16 tests) 114ms
 ✓ src/__tests__/heart/streaming.test.ts (91 tests) 72ms
 ✓ src/__tests__/mind/friends/store-file.test.ts (27 tests) 43ms
 ✓ src/__tests__/heart/turn-coordinator.test.ts (7 tests) 43ms
 ✓ src/__tests__/mind/context.test.ts (37 tests) 32ms
 ✓ src/__tests__/config.test.ts (48 tests) 25ms
 ✓ src/__tests__/identity.test.ts (28 tests) 20ms
 ✓ src/__tests__/repertoire/commands.test.ts (28 tests) 20ms
 ✓ src/__tests__/nerves/coverage-cli.test.ts (3 tests) 20ms
 ✓ src/__tests__/repertoire/skills.test.ts (21 tests) 19ms
 ✓ src/__tests__/repertoire/ado-semantic.test.ts (82 tests) 24ms
 ✓ src/__tests__/mind/knowledge-graph-import.test.ts (4 tests) 17ms
 ✓ src/__tests__/heart/kicks.test.ts (107 tests) 14ms
 ✓ src/__tests__/senses/inner-dialog.test.ts (17 tests) 13ms
 ✓ src/__tests__/supervisor/supervisor-branches.test.ts (12 tests) 12ms
 ✓ src/__tests__/repertoire/github-client.test.ts (13 tests) 13ms
 ✓ src/__tests__/repertoire/graph-client.test.ts (22 tests) 12ms
 ✓ src/__tests__/repertoire/ado-client.test.ts (35 tests) 13ms
 ✓ src/__tests__/wardrobe/phrases.test.ts (10 tests) 12ms
 ✓ src/__tests__/mind/memory.test.ts (10 tests) 12ms
 ✓ src/__tests__/mind/associative-recall.test.ts (16 tests) 11ms
 ✓ src/__tests__/nerves/audit-integration.test.ts (9 tests) 10ms
 ✓ src/__tests__/nerves/bundle-skeleton.contract.test.ts (4 tests) 6ms
 ✓ src/__tests__/mind/friends/resolver.test.ts (20 tests) 9ms
 ✓ src/__tests__/heart/governance-loader.test.ts (6 tests) 8ms
 ✓ src/__tests__/repertoire/ado-templates.test.ts (21 tests) 8ms
 ✓ src/__tests__/nerves/sinks.test.ts (1 test) 9ms
 ✓ src/__tests__/wardrobe/format.test.ts (9 tests) 8ms
 ✓ src/__tests__/harness/teardown-contract.test.ts (4 tests) 7ms
 ✓ src/__tests__/senses/cli-logging.test.ts (1 test) 7ms
 ✓ src/__tests__/repertoire/ado-context.test.ts (11 tests) 6ms
 ✓ src/__tests__/repertoire/tools-github.test.ts (15 tests) 6ms
 ✓ src/__tests__/nerves/coverage-cli-main.test.ts (1 test) 6ms
 ✓ src/__tests__/nerves/coverage-audit.test.ts (8 tests) 6ms
 ✓ src/__tests__/mind/friends/types.test.ts (18 tests) 6ms
 ✓ src/__tests__/nerves/coverage-run-artifacts.test.ts (4 tests) 6ms
 ✓ src/__tests__/mind/friends/tokens.test.ts (6 tests) 6ms
 ✓ src/__tests__/nerves/logger.test.ts (8 tests) 5ms
 ✓ src/__tests__/supervisor/supervisor-entry-core.test.ts (8 tests) 5ms
 ✓ src/__tests__/mind/memory-capture.test.ts (4 tests) 5ms
 ✓ src/__tests__/senses/inner-dialog-worker.test.ts (6 tests) 5ms
 ✓ src/__tests__/mind/friends/channel.test.ts (7 tests) 5ms
 ✓ src/__tests__/mind/friends/store.test.ts (7 tests) 5ms
 ✓ src/__tests__/governance/convention.test.ts (5 tests) 4ms
 ✓ src/__tests__/mind/first-impressions.test.ts (11 tests) 4ms
 ✓ src/__tests__/nerves/non-blocking-sinks.test.ts (2 tests) 4ms
 ✓ src/__tests__/nerves/runtime.test.ts (2 tests) 4ms
 ✓ src/__tests__/mind/token-estimate.test.ts (13 tests) 4ms
 ✓ src/__tests__/repertoire/tools-remote-safety.test.ts (3 tests) 4ms
 ✓ src/__tests__/heart/api-error.test.ts (9 tests) 4ms
 ✓ src/__tests__/nerves/audit-rules.test.ts (16 tests) 4ms
 ✓ src/__tests__/nerves/per-test-capture.test.ts (4 tests) 3ms
 ✓ src/__tests__/repertoire/tools-registry.contract.test.ts (4 tests) 3ms
 ✓ src/__tests__/nerves/source-scanner.test.ts (9 tests) 3ms
 ✓ src/__tests__/nerves/file-completeness.test.ts (9 tests) 3ms
 ✓ src/__tests__/nerves/coverage-contract.test.ts (6 tests) 3ms
 ✓ src/__tests__/nerves/naming-consistency.test.ts (1 test) 2ms
 ✓ src/__tests__/heart/harness-primitives.contract.test.ts (3 tests) 2ms
 ✓ src/__tests__/nerves/rename-contract.test.ts (3 tests) 2ms
 ✓ src/__tests__/nerves/trace.test.ts (2 tests) 2ms
 ✓ src/__tests__/setup.test.ts (1 test) 1ms

 Test Files  69 passed (69)
      Tests  1635 passed | 18 skipped (1653)
   Start at  22:11:40
   Duration  12.66s (transform 957ms, setup 658ms, import 1.08s, tests 3.59s, environment 4ms) green,  clean, coverage requirements satisfied.

### ⬜ Unit 5: Gate checklist sync + planning doc completion update
**What**: Mark Gate 9 completion checklists in doing/planning docs using evidence from Units 0-4.
**Output**: Updated docs + progress-log entries.
**Acceptance**: Gate 9 completion criteria are checked with traceable artifacts and docs reflect final state.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking implementation units done
- **All artifacts**: Save outputs/logs under 
- **Fixes/blockers**: Spawn sub-agent for simple fix loops; only stop for real requirement blockers
- **Decision updates**: Record architecture and contract decisions in docs immediately

## Progress Log
- 2026-03-05 22:11 Created from Gate 9 section of approved planning doc
