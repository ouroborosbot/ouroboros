# Doing: Gate 8 Bundle Independence

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-05 21:47
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-2147-doing-gate-8-bundle-independence/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Move `ouroboros.ouro` and `slugger.ouro` out of the harness repo into `~/AgentBundles/`, keep GitHub bundle backups verifiably current, and update harness path resolution/bootstrap behavior so both agents run from `~/AgentBundles/<agent>.ouro/` with zero regressions.

## Completion Criteria
- [x] GitHub repos up-to-date with latest bundle content (repos created in Gate 2)
- [x] Backup integrity verified (clone + diff)
- [x] Bundles moved to `~/AgentBundles/`
- [ ] Harness code updated to reference new bundle location
- [ ] Agents bootstrap correctly from `~/AgentBundles/`
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

### ✅ Unit 0: Baseline + migration preflight
**What**: Capture current bundle locations, nested git remotes, path-resolution behavior, and running-process state before relocation.
**Output**: `unit-0-baseline.md`.
**Acceptance**: Artifact records verified current state and identified Gate 8 touchpoints.
Validated target touchpoints:
- `src/identity.ts` (`getAgentRoot`)
- `src/__tests__/identity.test.ts`
- `src/__tests__/nerves/bundle-skeleton.contract.test.ts`
- `package.json` (`manifest:package` script)
- `.gitignore`

### ✅ Unit 1: Bundle backup integrity verification
**What**: Ensure both bundle repos are current on GitHub, then clone each remote to a temp location and diff against local bundles.
**Output**: `unit-1-bundle-remote-sync.log` + `unit-1-backup-integrity.md`.
**Acceptance**: Evidence shows remotes contain latest commits and clone-vs-local diffs are clean (or explained and resolved).

### ✅ Unit 2a: Agent-bundle path migration tests (Red)
**What**: Add failing tests for identity/path/bootstrap behavior that require bundle resolution from `~/AgentBundles/<agent>.ouro/`.
**Output**: Red tests + `unit-2a-red.log`.
**Acceptance**: New tests fail against current repo-root bundle assumptions.

### ✅ Unit 2b: Agent-bundle path migration implementation (Green)
**What**: Implement `~/AgentBundles` bundle-root resolution and update affected harness references/contracts.
**Output**: Updated implementation + `unit-2b-green.log` + `unit-2b-tsc.log`.
**Acceptance**: Unit 2a tests pass, build/typecheck clean, and harness path expectations no longer depend on in-repo bundles.

### ✅ Unit 2c: Coverage hardening for path migration
**What**: Close coverage gaps and refactor path-resolution changes for maintainability.
**Output**: `unit-2c-coverage.log`.
**Acceptance**: 100% coverage for newly added/changed logic and test suite remains green.

### ✅ Unit 3a: Bundle relocation execution
**What**: Stop active agent processes, create `~/AgentBundles`, and move both bundles out of the repo while preserving nested bundle git history/remotes.
**Output**: `unit-3a-relocation.log` + `unit-3a-post-move-layout.md`.
**Acceptance**: Bundles exist at `~/AgentBundles/<agent>.ouro` with intact nested git metadata and no data loss.

### ⬜ Unit 3b: Filesystem hygiene + harness workspace cleanup
**What**: Update harness workspace assumptions after relocation (including `.gitignore` implications and any path-sensitive scripts/contracts).
**Output**: `unit-3b-hygiene.log`.
**Acceptance**: Harness workspace no longer assumes in-repo bundles and path-sensitive checks/scripts are consistent with Gate 8 layout.

### ⬜ Unit 4: Bootstrap/runtime verification from `~/AgentBundles`
**What**: Validate Ouroboros + Slugger bootstrap and core runtime commands after relocation.
**Output**: `unit-4-bootstrap.log` + `unit-4-supervisor.log`.
**Acceptance**: Both agents bootstrap from `~/AgentBundles` without regressions.

### ⬜ Unit 5: Final verification + Gate 8 checklist sync
**What**: Run final verification suite and sync Gate 8 completion checklists in planning/doing docs.
**Output**: `unit-5-verification.md` + `unit-5-npm-test.log` + `unit-5-tsc.log` + `unit-5-coverage.log`.
**Acceptance**: Completion criteria evidenced, `npm test` green, compile clean, and coverage requirements satisfied.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking implementation units done
- **All artifacts**: Save outputs/logs under `./self-perpetuating-working-dir/2026-03-05-2147-doing-gate-8-bundle-independence/`
- **Fixes/blockers**: Spawn sub-agent for simple fix loops; only stop for real requirement blockers
- **Decision updates**: Record migration decisions and path assumptions in docs immediately

## Progress Log
- 2026-03-05 21:47 Created from Gate 8 section of approved planning doc
- 2026-03-05 21:48 Granularity pass: split relocation/hygiene into Units 3a and 3b for clearer execution boundaries
- 2026-03-05 21:49 Validation pass: confirmed Gate 8 touchpoints for path resolution, bundle contracts, and packaging script assumptions
- 2026-03-05 21:49 Quality pass: confirmed unit acceptance criteria, emoji headers, and execution readiness
- 2026-03-05 21:51 Unit 0 complete: captured pre-move bundle, remote, and process baseline for Gate 8 migration
- 2026-03-05 21:53 Unit 1 complete: synced both bundle repos to GitHub and verified clone-vs-local integrity
- 2026-03-05 21:54 Unit 2a complete: added failing identity path tests requiring `~/AgentBundles/<agent>.ouro`
- 2026-03-05 21:55 Unit 2b complete: switched identity path resolution to `~/AgentBundles` with green tests and clean compile
- 2026-03-05 21:56 Unit 2c complete: verified 100% coverage for `identity.ts` under the Gate 8 path migration
- 2026-03-05 21:57 Unit 3a complete: moved both bundles to `~/AgentBundles` and preserved nested git remotes/state
