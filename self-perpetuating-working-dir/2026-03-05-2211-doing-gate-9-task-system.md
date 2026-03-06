# Doing: Gate 9 Task System

**Status**: READY_FOR_EXECUTION
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
- [ ] `npm test` green
- [ ] 100% coverage on new code

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

### ⬜ Unit 0: Baseline + contract framing
**What**: Map existing task-related code paths, prompt assembly integration points, and bundle task directory expectations after Gate 8 path migration.
**Output**: `unit-0-baseline.md`.
**Acceptance**: Artifact identifies concrete files/functions for module, tooling, prompt board injection, and lifecycle archive flow.
Validated touchpoints:
- `src/identity.ts` (`getAgentRoot()` -> bundle task root)
- `src/mind/prompt.ts` (`buildSystem()` composition for board injection)
- `src/repertoire/tools-base.ts` (tool schemas/handlers)
- `src/repertoire/tools.ts` (tool registry + summaries)
- `src/__tests__/mind/prompt.test.ts` and `src/__tests__/repertoire/tools*.test.ts` for integration expectations

### ⬜ Unit 1a: Task module contracts and status model tests (Red)
**What**: Add failing tests for canonical task schema, parser/scanner behavior, 8-status transition model, and filename/type normalization.
**Output**: Red tests + `unit-1a-red.log`.
**Acceptance**: New tests fail against current implementation baseline and encode Gate 9 status/transition expectations.

### ⬜ Unit 1b: Task module core implementation (Green)
**What**: Implement core task module primitives (types, parser, scanner, transitions, board view model, lifecycle hooks, middleware seam) backed by `getAgentRoot()/tasks` in new `src/tasks/` modules.
**Output**: Module implementation + `unit-1b-green.log` + `unit-1b-tsc.log`.
**Acceptance**: Unit 1a tests pass and task module surfaces compile cleanly.

### ⬜ Unit 1c: Task module coverage + refactor
**What**: Close coverage gaps and simplify core task-module internals without changing behavior.
**Output**: `unit-1c-coverage.log`.
**Acceptance**: 100% coverage on task-module code changed in Units 1a/1b with full suite green.

### ⬜ Unit 2a: Task tools + write-time gate tests (Red)
**What**: Add failing tool-layer tests for `task_board`, `task_create`, `task_update_status`, and write-time enforcement (template validity, transition legality, spawn constraints).
**Output**: Red tests + `unit-2a-red.log`.
**Acceptance**: Tests fail before implementation and demonstrate required enforcement behavior.

### ⬜ Unit 2b: Task tools + enforcement implementation (Green)
**What**: Implement task tools in `src/repertoire/tools-base.ts`/`src/repertoire/tools.ts` and wire write-time gate validation paths into task-module calls.
**Output**: Tool implementation + `unit-2b-green.log` + `unit-2b-tsc.log`.
**Acceptance**: Task tools callable by model-facing registry; Unit 2a tests pass with enforced gates.

### ⬜ Unit 2c: Tooling coverage + integration refactor
**What**: Raise coverage to 100% on new tool/enforcement code and refactor for clear error semantics.
**Output**: `unit-2c-coverage.log`.
**Acceptance**: Coverage is 100% for touched tooling code and all tests remain green.

### ⬜ Unit 3a: Task board prompt integration tests (Red)
**What**: Add failing tests proving task board context is injected into the system prompt and planning/doing docs map to lifecycle states (`drafting`, `processing`, etc.).
**Output**: Red tests + `unit-3a-red.log`.
**Acceptance**: Tests fail before integration work and capture expected prompt payload shape.

### ⬜ Unit 3b: Prompt integration + lifecycle/archive implementation (Green)
**What**: Integrate task board into `src/mind/prompt.ts` system assembly and implement lifecycle archival flow for completed tasks under bundle task paths.
**Output**: Implementation + `unit-3b-green.log` + `unit-3b-tsc.log`.
**Acceptance**: Prompt includes task board snapshot; completed tasks move to archive via deterministic lifecycle behavior.

### ⬜ Unit 3c: Lifecycle/prompt coverage hardening
**What**: Add edge/error-case tests and refactor prompt/lifecycle code for maintainability.
**Output**: `unit-3c-coverage.log`.
**Acceptance**: 100% coverage for new lifecycle/prompt code and regression suite remains green.

### ⬜ Unit 4a: End-to-end autonomous task-flow tests (Red)
**What**: Add failing tests for full flow `create -> board -> transition -> completion -> archive` through model-facing task tools.
**Output**: Red tests + `unit-4a-red.log`.
**Acceptance**: End-to-end lifecycle tests fail before final integration is implemented.

### ⬜ Unit 4b: End-to-end flow implementation + verification (Green)
**What**: Implement any missing integration behavior and verify gate-level outcomes.
**Output**: `unit-4b-green.log` + `unit-4b-npm-test.log` + `unit-4b-tsc.log`.
**Acceptance**: Full lifecycle flow passes end-to-end with `npm test` green and `npx tsc --noEmit` clean.

### ⬜ Unit 4c: Final coverage + checklist sync
**What**: Run coverage gate, capture artifacts, and mark Gate 9 completion checklists in doing/planning docs with evidence.
**Output**: `unit-4c-coverage.log` + doc updates.
**Acceptance**: 100% coverage on new code, completion criteria checked with traceable artifacts.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking implementation units done
- **All artifacts**: Save outputs/logs under `./self-perpetuating-working-dir/2026-03-05-2211-doing-gate-9-task-system/`
- **Fixes/blockers**: Spawn sub-agent for simple fix loops; only stop for real requirement blockers
- **Decision updates**: Record architecture and contract decisions in docs immediately

## Progress Log
- 2026-03-05 22:11 Created from Gate 9 section of approved planning doc
- 2026-03-05 22:12 Granularity pass: split end-to-end work into Units 4a/4b/4c and corrected artifact paths
- 2026-03-05 22:15 Validation pass: confirmed concrete touchpoints in prompt/tool registries and pinned new task-module target paths
- 2026-03-05 22:16 Quality pass: verified emoji headers, acceptance completeness, and execution readiness
