# Doing: Fix Round Gate 5 src Reorg

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-07 02:35
**Planning**: ./2026-03-07-0235-planning-fix-round-gate-5-reorg.md
**Artifacts**: ./2026-03-07-0235-doing-fix-round-gate-5-reorg/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Reorganize `src/` and mirrored tests to the Gate 5 target structure with zero behavioral regressions, then verify build/lint/test/coverage are fully green.

## Completion Criteria
- [ ] `src/` layout matches the approved Gate 5 target structure
- [ ] All moved production files compile from new paths with no stale imports
- [ ] Test layout mirrors reorg and all moved tests pass from new locations
- [ ] `package.json` scripts and entrypoint references are updated and valid
- [ ] Refactor remains behavior-preserving (no intentional runtime contract changes)
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

### ⬜ Unit 0: Baseline Reorg Scan
**What**: Capture current source/test layout and known path anchors before moving files.
**Output**: Baseline scan artifact(s) under gate artifacts directory.
**Acceptance**: Artifact records pre-move topology and key import/script anchors.

### ⬜ Unit 1: Move `coding/` and `tasks/` into `repertoire/`
**What**: Relocate directories and repair affected imports/exports.
**Output**: Updated source tree with compile-clean import graph for moved modules.
**Acceptance**: Target directories exist in `src/repertoire/` and no stale old-path imports remain.

### ⬜ Unit 2: Move heart/senses infrastructure files
**What**: Move `identity.ts` + `config.ts` to `src/heart/`, move sense entrypoints/commands/logging targets per Gate 5 map.
**Output**: Updated file locations and resolved import paths across runtime entrypoints.
**Acceptance**: Runtime entrypoint imports resolve from new locations.

### ⬜ Unit 3: Fold wardrobe/harness moves and cleanup
**What**: Fold wardrobe files into `mind/`, fold harness primitives into `heart/`, remove obsolete directories once empty.
**Output**: Finalized reorg structure matching Gate 5 map.
**Acceptance**: No references to removed locations remain.

### ⬜ Unit 4: Mirror test tree moves and import rewrites
**What**: Move/retarget `src/__tests__/` files to mirror new source layout and fix imports.
**Output**: Test tree aligned to reorganized `src/` topology.
**Acceptance**: All moved tests run from new paths with clean imports.

### ⬜ Unit 5: Package/script path reconciliation
**What**: Update `package.json` and any repo scripts that reference old paths.
**Output**: Script/entrypoint references aligned with new layout.
**Acceptance**: No stale path references in package/scripts scan.

### ⬜ Unit 6: Full Verification
**What**: Run full validation (`npm run lint`, `npm run build`, `npm test`, `npm run test:coverage -- --runInBand`) and archive outputs.
**Output**: Verification logs and final scans in artifacts directory.
**Acceptance**: Full suite passes with no warnings and coverage gate remains green.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each logical unit completion
- Push after each unit completion
- Run full relevant tests before marking a unit done
- **All artifacts**: Save outputs/logs to `./2026-03-07-0235-doing-fix-round-gate-5-reorg/`
- Resolve move-order/import breakages incrementally; no broad unverified rewrites

## Progress Log
- 2026-03-07 02:35 Created from planning doc.
