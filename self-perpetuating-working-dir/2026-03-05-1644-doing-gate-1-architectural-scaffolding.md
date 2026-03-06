# Doing: Gate 1 Architectural Scaffolding

**Status**: drafting
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
- [ ] Overnight proposals reviewed -- high-merit ideas incorporated into scaffolding decisions
- [ ] `.ouro` bundle skeleton directory committed (structure only, Gate 2 populates)
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

### ⬜ Unit 0: Prior-Art Review Snapshot
**What**: Review overnight proposal inventory from the archive branch and capture which high-merit items are explicitly reflected in Gate 1 scaffolding outputs.
**Output**: `prior-art-review.md` artifact with proposal-to-scaffold mapping.
**Acceptance**: Artifact references archive-branch files and maps at least the HIGH-priority themes to concrete Gate 1 deliverables.

### ⬜ Unit 1: `.ouro` Bundle Skeleton
**What**: Commit skeleton directories/files for `.ouro` bundle layout (structure-only placeholders), including `teams-app/`, `psyche/`, `skills/`, `tasks/`, and `psyche/memory/` substructure.
**Output**: Committed skeleton directories/files for both agents.
**Acceptance**: Layout matches planning-doc target tree and remains structure-only (no Gate 2 population work).

### ⬜ Unit 2: Harness Primitive Interfaces
**What**: Add TypeScript scaffolding interfaces for model tool surface, bootstrap sequencing, and governance checks.
**Output**: New importable TypeScript interface module(s) with barrel exports as needed.
**Acceptance**: Interfaces compile, are importable from runtime code, and remain scaffolding-level (no over-specification).

### ⬜ Unit 3: Governance Loader Stub
**What**: Add a shared governance loader stub at the target location used by future gates.
**Output**: Loader module with minimal API plus tests covering success and missing-file behavior.
**Acceptance**: Tests are red before implementation and green after implementation; loader behavior is deterministic.

### ⬜ Unit 4: Migration/Protocol/Backup Documentation
**What**: Commit in-repo docs for kill/refactor list, subagent protocol loading convention, and bundle backup + `~/AgentBundles/` migration path.
**Output**: Three committed markdown artifacts in a stable docs location.
**Acceptance**: Each artifact is specific, references real repo paths, and is ready for Gate 2/3 implementation follow-through.

### ⬜ Unit 5: Gate Verification
**What**: Run `npm test` and `npx tsc`, then update this doing doc checklist based on verified evidence.
**Output**: Test/build logs in artifacts directory and updated completion checklist state.
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
