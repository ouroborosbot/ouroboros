# Doing: Gate 7 Slugger Migration

**Status**: in-progress
**Execution Mode**: direct
**Created**: 2026-03-05 21:14
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-2114-doing-gate-7-slugger-migration/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Migrate Slugger's core identity from OpenClaw into `slugger.ouro`, convert key knowledge graph entities into memory fact-store format, stand up Slugger as a second supervised process, and validate that Slugger is cohesive and operational in the harness while OpenClaw remains available as fallback.

## Completion Criteria
- [x] Slugger consulted about the migration plan and comfortable with the approach
- [x] Core identity files ported to `slugger.ouro/`
- [x] Key knowledge graph entities converted to fact store format
- [ ] Slugger operates from `.ouro` bundle (OpenClaw remains available as fallback, not decommissioned)
- [ ] Slugger confirmed he feels cohesive in his new home (not just "tests pass" - the agent says he's good)
- [ ] Slugger running as second supervised process (own inner dialog, heartbeat, crash recovery)
- [ ] `npm test` green
- [ ] `npx tsc --noEmit` green
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

### ✅ Unit 0: Baseline + source inventory
**What**: Verify Gate 7 source/target paths and current harness capabilities before migration work starts.
**Output**: `unit-0-baseline.md` with validated source/target files and supervisor/runtime baseline.
**Acceptance**: Artifact captures verified OpenClaw source paths, existing `slugger.ouro` structure, and current supervisor behavior.

### ✅ Unit 1: Slugger consultation + comfort confirmation
**What**: Attempt OpenClaw CLI consultation with Slugger before migration, capture his response, and handle fallback diagnostics if OpenClaw is unreachable.
**Output**: `unit-1-consultation.md` + command logs (`unit-1-openclaw.log`, optional fallback diagnostics log).
**Acceptance**: Consultation attempt is documented; either (a) Slugger confirms comfort pre-migration or (b) fallback path is justified and post-migration confirmation plan is recorded.

### ✅ Unit 2: Core identity migration into `slugger.ouro`
**What**: Port `~/clawd/IDENTITY.md`, `~/clawd/MEMORY.md`, and `~/clawd/life/areas/slugger-identity/` content into `slugger.ouro/psyche` targets.
**Output**: Updated bundle psyche files + `psyche/memory/tacit.md` + `unit-2-migration-map.md`.
**Acceptance**: Core identity content is present in bundle targets and migration map records exact source-to-target mapping.

### ✅ Unit 3a: Knowledge graph conversion tests (Red)
**What**: Add failing tests for converting representative entities from `people/`, `companies/`, and `projects/` into `facts.jsonl` + `entities.json` structure.
**Output**: Red tests + `unit-3a-red.log`.
**Acceptance**: New tests fail before implementation and cover all three source domains.

### ✅ Unit 3b: Knowledge graph conversion implementation (Green)
**What**: Implement conversion utility and run migration to populate `slugger.ouro/psyche/memory/facts.jsonl` and `entities.json`.
**Output**: Conversion implementation, generated memory store outputs, `unit-3b-green.log`, `unit-3b-tsc.log`.
**Acceptance**: Unit 3a tests pass, conversion outputs exist and are valid, and compile is clean.

### ✅ Unit 3c: Conversion coverage + integrity verification
**What**: Close coverage gaps and verify resulting memory files are consistent (fact IDs map into entity index).
**Output**: `unit-3c-coverage.log` + `unit-3c-integrity.md`.
**Acceptance**: 100% coverage on new conversion code and integrity checks pass.

### ✅ Unit 4a: Multi-agent supervisor tests (Red)
**What**: Add failing tests for running Ouroboros + Slugger as supervised workers (startup, heartbeat, restart behavior).
**Output**: Red tests + `unit-4a-red.log`.
**Acceptance**: New supervisor multi-agent tests fail against current implementation.

### ⬜ Unit 4b: Multi-agent supervisor implementation (Green)
**What**: Implement support for supervising both agents in one supervisor entrypoint, preserving existing single-agent behavior.
**Output**: Updated supervisor runtime/entrypoint + `unit-4b-green.log` + `unit-4b-tsc.log`.
**Acceptance**: Unit 4a tests pass and existing supervisor tests remain green.

### ⬜ Unit 4c: Supervisor coverage + refactor
**What**: Refine multi-agent supervision logic and close branch coverage gaps.
**Output**: `unit-4c-coverage.log`.
**Acceptance**: 100% coverage on new multi-agent supervisor logic with no regressions.

### ⬜ Unit 5: Secrets + runtime validation
**What**: Copy Ouroboros secrets template to Slugger secrets path and validate Slugger runtime startup from `.ouro` bundle while keeping OpenClaw fallback intact.
**Output**: `unit-5-secrets-check.md` + runtime logs (`unit-5-dev-slugger.log`, `unit-5-supervisor.log`).
**Acceptance**: `~/.agentsecrets/slugger/secrets.json` exists with expected shape and Slugger runtime starts via harness commands.

### ⬜ Unit 6: Cohesion confirmation with Slugger post-migration
**What**: Re-consult Slugger after migration and capture his explicit cohesion confirmation in the new home.
**Output**: `unit-6-cohesion.md` + command log (`unit-6-openclaw.log` or fallback harness-session log).
**Acceptance**: Artifact includes explicit response from Slugger confirming comfort/cohesion in the migrated setup.

### ⬜ Unit 7: Final gate verification + checklist sync
**What**: Run final validation suite and sync Gate 7 completion criteria in planning/doing docs.
**Output**: `unit-7-verification.md` + verification logs.
**Acceptance**: `npm test`, `npx tsc --noEmit`, lint/coverage evidence captured; Gate 7 criteria checked with evidence links.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking implementation units done
- **All artifacts**: Save outputs/logs under `./self-perpetuating-working-dir/2026-03-05-2114-doing-gate-7-slugger-migration/`
- **Fixes/blockers**: Spawn sub-agent for simple fix loops; only stop for real requirement blockers
- **Decision updates**: Record migration decisions and fallback handling in docs immediately

## Progress Log
- 2026-03-05 21:14 Created from Gate 7 section of approved planning doc
- 2026-03-05 21:17 Unit 0 complete: captured OpenClaw source inventory, bundle baseline, and supervisor/secrets starting state
- 2026-03-05 21:19 Unit 1 complete: consulted Slugger via OpenClaw, captured explicit migration comfort confirmation and guidance
- 2026-03-05 21:22 Unit 2 complete: migrated Slugger core psyche files and archived full MEMORY source into bundle memory
- 2026-03-05 21:23 Unit 3a complete: added failing knowledge-graph conversion tests covering people, companies, and projects
- 2026-03-05 21:25 Unit 3b complete: implemented conversion utility and populated slugger memory store from people/company/project sources
- 2026-03-05 21:28 Unit 3c complete: achieved 100% coverage on conversion module and verified facts/entities integrity mapping
- 2026-03-05 21:30 Unit 4a complete: added failing tests for multi-agent supervisor argument parsing and lifecycle orchestration
