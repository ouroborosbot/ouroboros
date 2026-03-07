# Doing: Fix Round Gate 6 First Run

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-07 02:55
**Planning**: ./2026-03-07-0255-planning-fix-round-gate-6-first-run.md
**Artifacts**: ./2026-03-07-0255-doing-fix-round-gate-6-first-run/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Deliver the full Gate 6 first-run contract: Adoption Specialist integration, `ouro hatch` onboarding/auth flow, smart bare `ouro` behavior, and `npx ouro.bot` wrapper execution.

## Completion Criteria
- [x] Adoption Specialist bundle in repo includes copied pre-authored identity files and random identity selection behavior
- [x] `ouro hatch` performs provider auth/verification flow and creates canonical hatchling bundle with required defaults
- [x] Bare `ouro` routes correctly based on discovered-agent count
- [ ] `npx ouro.bot` first-run wrapper delegates correctly to CLI flow
- [ ] Gate 6 tests cover first-run contracts and pass
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

### ✅ Unit 0: Baseline Gate 6 Surface Scan
**What**: Inventory current first-run CLI paths, hatch commands, bundle skeleton expectations, and specialist bundle sources before edits.
**Output**: Baseline notes/logs under artifacts directory.
**Acceptance**: Baseline artifacts clearly map existing flow and target Gate 6 deltas.

### ✅ Unit 1: Adoption Specialist Bundle + Identity Source Wiring (TDD)
**What**: Add tests for specialist identity-copy/loading behavior, then implement copying pre-authored identities and random runtime selection contract.
**Output**: Updated specialist bundle + loader logic + tests.
**Acceptance**: Tests prove pre-authored identities are loaded/copied as-is; no generated identity content path exists.

### ✅ Unit 2: Smart Bare `ouro` Routing (TDD)
**What**: Add failing tests for zero/one/multi-agent routing, then implement routing logic in daemon CLI entry path.
**Output**: Updated CLI routing behavior with coverage.
**Acceptance**: Zero agents triggers hatch, one triggers chat, many trigger selector behavior.

### ✅ Unit 3: `ouro hatch` Auth + Bundle Creation Contract (TDD)
**What**: Add failing tests for provider auth verification and hatchling bundle creation defaults, then implement required flow and artifacts.
**Output**: `ouro hatch` flow updates and validated bundle creation output.
**Acceptance**: Tests verify secrets flow, canonical bundle structure, `enabled: true`, family imprint, heartbeat task creation.

### ⬜ Unit 4: `npx ouro.bot` Wrapper + First-Run Delegation (TDD)
**What**: Add failing tests for wrapper behavior and implement thin handoff from `ouro.bot` to `@ouro.bot/cli` first-run flow.
**Output**: Wrapper wiring plus tests.
**Acceptance**: `npx ouro.bot` path invokes first-run entry contract without bypassing smart routing/auth flow.

### ⬜ Unit 5: `.ouro` UTI Registration (macOS, Non-Blocking) (TDD)
**What**: Add failing tests for macOS registration behavior (including non-blocking icon-source-missing path), then implement registration hooks.
**Output**: UTI registration logic + tests + safe fallback behavior.
**Acceptance**: Registration is attempted on setup; missing icon source does not block onboarding.

### ⬜ Unit 6: Full Verification + Artifacts
**What**: Run full validation (`npm run lint`, `npm run build`, `npm test --silent`, `npm run test:coverage -- --runInBand`) and store gate evidence.
**Output**: Verification artifacts/logs in gate artifacts directory.
**Acceptance**: Full suite green, no warnings, coverage gate passes.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each logical unit completion
- Push after each unit completion
- Run full relevant tests before marking a unit done
- **All artifacts**: Save outputs/logs to `./2026-03-07-0255-doing-fix-round-gate-6-first-run/`
- Keep behavior aligned with master planning doc subsystem audit decisions and Gate 6 scope only

## Progress Log
- 2026-03-07 02:55 Created from planning doc.
- 2026-03-07 02:55 Granularity pass complete (no changes needed).
- 2026-03-07 02:56 Validation pass complete (no changes needed).
- 2026-03-07 02:56 Quality pass complete (no changes needed).
- 2026-03-07 02:58 Unit 0 complete: captured daemon CLI/daemon hatch baseline and first-run surface scan artifacts.
- 2026-03-07 03:03 Unit 1 complete: added specialist identity sync/pick module, repo-shipped AdoptionSpecialist bundle scaffold, and specialist contract tests.
- 2026-03-07 03:04 Unit 2 complete: implemented bare `ouro` auto-routing by discovered agent count with coverage in daemon CLI tests.
- 2026-03-07 03:14 Unit 3 complete: implemented hatch auth/credential verification, canonical bundle creation, specialist identity selection, and daemon-cli hatch wiring with green tests.
