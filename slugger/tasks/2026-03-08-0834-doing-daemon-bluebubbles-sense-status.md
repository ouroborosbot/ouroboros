# Doing: Daemon-Managed Senses And BlueBubbles Status

**Status**: drafting
**Execution Mode**: direct
**Created**: 2026-03-08 09:32
**Planning**: ./2026-03-08-0834-planning-daemon-bluebubbles-sense-status.md
**Artifacts**: ./2026-03-08-0834-doing-daemon-bluebubbles-sense-status/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Make the daemon own Slugger's external senses, including BlueBubbles, so `ouro up` brings them up and `ouro status` reports a channel-first sense grid instead of only background worker processes.

## Completion Criteria
- [ ] `ouro up` starts Slugger's configured senses, including BlueBubbles, through the daemon path.
- [ ] `ouro status` includes an `Overview` section plus a `Senses` grid and separate `Workers` section.
- [ ] The `Senses` grid shows all available senses for each agent, including disabled ones, with enough detail to show enabled state, runtime state, and relevant endpoint/detail.
- [ ] Slugger's config supports daemon-managed sense enablement without reading live runtime values from `~/.openclaw`.
- [ ] Existing daemon-managed worker status remains visible and is not mislabeled as an external sense.
- [ ] BlueBubbles secrets remain sourced from `~/.agentsecrets/slugger/secrets.json`.
- [ ] System prompt runtime info includes both the current sense and a lightweight available-senses summary without turning into setup documentation.
- [ ] When asked how to enable or set up another sense, the agent can answer truthfully from sense/status/config information instead of guessing.
- [ ] When asked what sense states mean, the agent can explain its own harness terminology truthfully and clearly.
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

### ⬜ Unit 0: Setup/Research
**What**: Capture the current daemon/status baseline, record the current Slugger bundle relocation candidates (`/Users/arimendelow/.Trash/AgentBundles/slugger.ouro` and `/Users/arimendelow/AgentBundles--backup/slugger.ouro` as of validation), and save the `~/.openclaw` BlueBubbles source values that will inform the live Slugger config update.
**Output**: Baseline notes and command output artifacts under `./2026-03-08-0834-doing-daemon-bluebubbles-sense-status/`.
**Acceptance**: Artifact notes identify the current `ouro status` baseline, the discovered temporary Slugger bundle candidates, the rule for choosing the live bundle path during execution, and the BlueBubbles source values from `~/.openclaw`.

### ⬜ Unit 1a: Sense Truth Model And Agent Config — Tests
**What**: Write failing tests for the new `agent.json` `senses` block, available-sense discovery, and stable sense state modeling (`disabled`, `needs_config`, `ready`, `running`, `interactive`, `error`) in the existing identity/config/daemon test surfaces.
**Output**: New red-phase tests covering sense config parsing and shared state semantics.
**Acceptance**: Tests exist in the relevant identity/config/daemon suites and FAIL (red).

### ⬜ Unit 1b: Sense Truth Model And Agent Config — Implementation
**What**: Implement the shared sense-truth/config layer that parses agent-level sense enablement and produces a single source of truth for daemon/status/prompt consumers.
**Output**: Updated agent config parsing plus shared sense inventory/state code.
**Acceptance**: New tests PASS (green), build passes, and no warnings are emitted.

### ⬜ Unit 1c: Sense Truth Model And Agent Config — Coverage & Refactor
**What**: Verify full coverage for the new config/state layer, add any missing edge/error-path tests, and refactor only if needed.
**Output**: Coverage logs and any additional tests required for 100% coverage on new code.
**Acceptance**: 100% coverage on new code, tests remain green, and build still passes.

### ⬜ Unit 2a: Daemon Lifecycle And Status Data — Tests
**What**: Write failing tests for daemon-managed BlueBubbles lifecycle, truthful separation of `Senses` versus `Workers`, and status data that includes disabled senses for discovery in the existing daemon entry/command/CLI test surfaces.
**Output**: New red-phase daemon/status tests covering sense lifecycle and worker separation.
**Acceptance**: Tests exist in daemon entry/command/status suites and FAIL (red).

### ⬜ Unit 2b: Daemon Lifecycle And Status Data — Implementation
**What**: Implement daemon-managed sense lifecycle for enabled senses, preserve the inner-dialog worker as a separate worker concept, and extend daemon status payloads to include the shared sense-truth data.
**Output**: Updated daemon bootstrap/status behavior for senses and workers.
**Acceptance**: New tests PASS (green), build passes, and no warnings are emitted.

### ⬜ Unit 2c: Daemon Lifecycle And Status Data — Coverage & Refactor
**What**: Verify full coverage for new daemon lifecycle/status paths, add missing branch/error-path tests, and refactor if needed.
**Output**: Coverage artifacts and any supplemental tests needed for complete coverage.
**Acceptance**: 100% coverage on new code, tests remain green, and build still passes.

### ⬜ Unit 3a: Status UX And Prompt Sense Awareness — Tests
**What**: Write failing tests for `ouro status` rendering (`Overview / Senses / Workers`), prompt runtime info showing current + available senses, and prompt language that makes sense states explainable in the existing daemon CLI and prompt test suites.
**Output**: New red-phase CLI/prompt tests covering status rendering and sense-awareness language.
**Acceptance**: Tests exist in CLI/prompt suites and FAIL (red).

### ⬜ Unit 3b: Status UX And Prompt Sense Awareness — Implementation
**What**: Implement the status rendering UX and prompt updates so the agent can truthfully explain current sense, available senses, state meanings, and how to enable another sense when asked.
**Output**: Updated CLI status formatting plus prompt/runtime sense-awareness behavior.
**Acceptance**: New tests PASS (green), build passes, and no warnings are emitted.

### ⬜ Unit 3c: Status UX And Prompt Sense Awareness — Coverage & Refactor
**What**: Verify full coverage for the new status/prompt paths, add missing edge/error-path tests, and refactor if needed.
**Output**: Coverage artifacts and any supplemental tests needed for complete coverage.
**Acceptance**: 100% coverage on new code, tests remain green, and build still passes.

### ⬜ Unit 4a: Slugger Live Config And E2E Verification
**What**: Update Slugger's live config in the currently discovered active bundle location, ensure `~/.agentsecrets/slugger/secrets.json` contains the migrated BlueBubbles values, establish any temporary conventional-path bridge needed for live verification without changing runtime design, then run live daemon/status smoke checks and a harness explanation smoke check against the approved requirements.
**Output**: Live verification artifacts, including status output, harness explanation evidence, and notes about any temporary bundle-path bridge used for the smoke run.
**Acceptance**: `ouro up` and `ouro status` demonstrate the expected sense behavior locally, Slugger's live config reflects the new `senses` block, and the captured smoke evidence shows the harness can explain its own sense states/setup truthfully.

### ⬜ Unit 4b: Final Verification And Completion Sync
**What**: Run the full required validation pass for the task, sync completion checklists in doing/planning docs, and prepare the branch for work-merger.
**Output**: Final test/build/coverage artifacts and completed task docs.
**Acceptance**: Full targeted verification is captured, all completion criteria satisfied by evidence are checked, and the branch is cleanly ready for `$work-doer` completion and `$work-merger`.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-08-0834-doing-daemon-bluebubbles-sense-status/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-08 09:32 Created from planning doc
