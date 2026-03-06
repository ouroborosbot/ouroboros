# Doing: Gate 1 Architectural Scaffolding

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-05 16:44
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-1644-doing-gate-1-architectural-scaffolding/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Produce Gate 1 architectural scaffolding artifacts (bundle skeleton, interfaces, governance loader stub, migration checklist, and protocol/backup conventions) that Gate 2 and Gate 3 can build on directly.

## Completion Criteria
- [x] Overnight proposals reviewed -- high-merit ideas incorporated into scaffolding decisions
- [x] `.ouro` bundle skeleton directory committed (structure only, Gate 2 populates)
- [ ] TypeScript interfaces for harness primitives committed (compilable, importable)
- [ ] Shared governance loader stub committed
- [ ] Kill list / migration checklist committed in-repo
- [ ] Subagent protocol loading convention defined and documented
- [ ] Bundle backup + `~/AgentBundles/` migration path documented
- [ ] `npx tsc` compiles clean with the new interfaces
- [ ] `npm test` green
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

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ✅ Unit 0: Prior-Art Review Snapshot
**What**: Review overnight proposal inventory from archive branch files under `ouroboros/tasks/` and capture which high-merit items are explicitly reflected in Gate 1 scaffolding outputs.
**Output**: `self-perpetuating-working-dir/2026-03-05-1644-doing-gate-1-architectural-scaffolding/prior-art-review.md` with proposal-to-scaffold mapping.
**Acceptance**: Artifact references archive-branch files and maps HIGH-priority themes to concrete Gate 1 deliverables.

### ✅ Unit 1a: Bundle Skeleton Contract Test (Red)
**What**: Add a failing test that asserts required `.ouro` skeleton paths for both `ouroboros.ouro/` and `slugger.ouro/` exist.
**Output**: New failing test file under `src/__tests__/`.
**Acceptance**: Test fails because skeleton paths do not exist yet.

### ✅ Unit 1b: `.ouro` Bundle Skeleton Implementation (Green)
**What**: Create structure-only `.ouro` directories/files for both agents (`ouroboros.ouro/`, `slugger.ouro/`) at repo root, including `teams-app/`, `psyche/`, `skills/`, `tasks/`, and `psyche/memory/` substructure.
**Output**: Committed skeleton tree with placeholder files only.
**Acceptance**: Bundle contract test passes and layout matches planning-doc target tree.

### ✅ Unit 1c: Bundle Skeleton Refactor/Coverage
**What**: Normalize placeholder conventions and confirm new test coverage remains complete.
**Output**: Clean skeleton structure and passing targeted/full tests.
**Acceptance**: No extra population work leaked from Gate 2 and tests remain green.

### ⬜ Unit 2a: Harness Interface Contract Test (Red)
**What**: Add failing TypeScript contract tests (or compile assertions) for expected harness primitive interface exports.
**Output**: New failing test file referencing planned interface symbols.
**Acceptance**: Test/compile step fails before interfaces exist.

### ⬜ Unit 2b: Harness Primitive Interfaces (Green)
**What**: Add TypeScript scaffolding interfaces for model tool surface, bootstrap sequencing, and governance checks in a new `src/harness/` module.
**Output**: Importable interface module(s) with stable exports at `src/harness/`.
**Acceptance**: Contract tests pass and interfaces remain scaffolding-level (no over-specification).

### ⬜ Unit 2c: Interfaces Refactor/Compile Validation
**What**: Refine naming/organization and run `npx tsc` to verify clean integration.
**Output**: Finalized interface layout and compile evidence in artifacts.
**Acceptance**: `npx tsc` is green with new interface modules imported successfully.

### ⬜ Unit 3a: Governance Loader Tests (Red)
**What**: Add failing tests for governance loader stub behavior (happy path + missing-file path).
**Output**: New failing tests for loader API expectations (targeting `src/governance/loader.ts`).
**Acceptance**: Tests fail before loader implementation exists.

### ⬜ Unit 3b: Governance Loader Stub (Green)
**What**: Implement shared governance loader stub at the agreed target location with deterministic return/error behavior.
**Output**: `src/governance/loader.ts` plus minimal fixture data if needed.
**Acceptance**: Loader tests pass and API shape is ready for Gate 2/3 expansion.

### ⬜ Unit 3c: Governance Loader Refactor/Coverage
**What**: Tighten loader implementation and verify 100% coverage on new runtime code.
**Output**: Coverage evidence and any small cleanup commits.
**Acceptance**: Loader path has full coverage and no warnings.

### ⬜ Unit 4a: Kill List / Migration Checklist
**What**: Commit in-repo checklist documenting kill/refactor targets, including currently removed reflection pipeline files and surviving/refactor paths that Gate 2/3 still touch.
**Output**: `docs/gate-1-kill-list.md`.
**Acceptance**: Checklist is specific, path-accurate against current `src/` tree, and actionable for Gates 2-3.

### ⬜ Unit 4b: Subagent Protocol Loading Convention
**What**: Document how agents load planner/doer/merger protocols from bundle context while shared source-of-truth stays in repo-root `subagents/`.
**Output**: `docs/gate-1-subagent-protocol-loading.md`.
**Acceptance**: Convention includes path mapping, sync expectations, and fallback behavior.

### ⬜ Unit 4c: Bundle Backup + `~/AgentBundles/` Migration Path
**What**: Document bundle backup flow (git init + private repo push) and staged migration path to `~/AgentBundles/`.
**Output**: `docs/gate-1-bundle-backup-migration.md`.
**Acceptance**: Strategy is concrete, ordered, and references real repo/runtime paths.

### ⬜ Unit 5: Gate Verification
**What**: Run `npm test` and `npx tsc`, then update this doing doc checklist based on verified evidence.
**Output**: `npm-test.log` and `tsc.log` in artifacts directory plus updated completion checklist state.
**Acceptance**: Both commands pass and all Gate 1 completion criteria are satisfiable.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./self-perpetuating-working-dir/2026-03-05-1644-doing-gate-1-architectural-scaffolding/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-05 16:44 Created from planning doc
- 2026-03-05 16:45 Granularity pass: split major deliverables into atomic test/implement/refactor units
- 2026-03-05 16:46 Validation pass: aligned units with current repo paths (`src/reflection` absent, docs dir empty, target module locations explicit)
- 2026-03-05 16:46 Quality pass: verified emoji-prefixed units, acceptance coverage, and checklist hygiene; marked READY_FOR_EXECUTION
- 2026-03-05 16:47 Unit 0 complete: archived prior-art themes mapped to Gate 1 scaffolding deliverables
- 2026-03-05 16:49 Unit 1a complete: added failing contract test for required `*.ouro` skeleton paths
- 2026-03-05 16:50 Unit 1b complete: created structure-only `ouroboros.ouro/` and `slugger.ouro/` bundle trees
- 2026-03-05 16:50 Unit 1c complete: verified 100% coverage and clean TypeScript compile with skeleton contract in place
