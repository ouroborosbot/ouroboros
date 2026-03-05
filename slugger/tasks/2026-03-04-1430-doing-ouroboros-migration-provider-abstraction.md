# Doing: Ouroboros Migration - Provider Abstraction

**Status**: in-progress
**Execution Mode**: pending
**Created**: 2026-03-04 15:26
**Planning**: ./2026-03-04-1430-planning-ouroboros-migration-provider-abstraction.md
**Artifacts**: ./2026-03-04-1430-doing-ouroboros-migration-provider-abstraction/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Replace the global provider singleton with a per-agent provider abstraction while preserving current Azure/MiniMax behavior, then add Anthropic setup-token auth support and OpenAI Codex OAuth subscription support as final integration steps, with explicit auth-failure hard-stop behavior and a clean secrets/state path boundary.

## Completion Criteria
- [ ] Provider abstraction is in place and engine no longer branches on hardcoded provider names in the request path.
- [ ] Azure and MiniMax behavior is preserved with passing regression tests.
- [ ] Anthropic provider is integrated behind the same provider interface with setup-token auth profile support.
- [ ] OpenAI Codex provider is integrated behind the same provider interface with OAuth auth profile support.
- [ ] Anthropic setup-token flow is manually validated end-to-end (real profile, not mocks) with evidence captured in task artifacts.
- [ ] OpenAI Codex OAuth flow is manually validated end-to-end (real profile, not mocks) with evidence captured in task artifacts.
- [ ] Provider selection is per-agent and config-driven (no global singleton lock-in).
- [ ] Provider-specific implementation logic is extracted from `src/heart/core.ts` into `src/heart/providers/*` modules before Unit 5 work, with behavior parity confirmed by tests.
- [ ] CLI channel output keeps user-visible plain text separate from nerves logs (no raw NDJSON log events interleaved in stdout model responses).
- [ ] Nerves logs remain machine-readable and persistent (append-only NDJSON) for multi-agent auditing and runtime validation.
- [ ] Anthropic streamed tool calls assemble valid JSON arguments and execute reliably (no malformed concatenated argument payloads), backed by regression tests.
- [x] Secrets/state boundary is enforced (`~/.agentsecrets` for secrets only; runtime/session/log/PII/test artifacts moved to `~/.agentstate`).
- [x] `secrets.json` retains `providers` + `teams`; `context` is loaded from `agent.json`.
- [x] `agent.json.configPath` resolves to `~/.agentsecrets/<agent>/secrets.json`.
- [ ] Missing/expired provider credentials fail fast with explicit re-auth guidance; no silent fallback.
- [x] A migration runbook exists in-repo for cross-machine post-pull reorganization of legacy `~/.agentconfigs` data.
- [x] Legacy `~/.agentconfigs` migration is fully documented as a one-time manual operation for other machines (no runtime back-compat branches in normal execution code), with no data loss and clear operator guidance.
- [x] Storage/config refactor executes before provider abstraction refactor work so implementation targets final storage/config contracts.
- [x] Actual cross-machine data migration is out-of-band from this task's code execution and handled via the migration runbook instructions.
- [x] Migration runbook is docs-only (no script) and includes explicit move/verify instructions for the other machine.
- [ ] Provider IDs are explicitly locked and implemented as `azure`, `minimax`, `anthropic`, `openai-codex`.
- [ ] Model fields are explicitly supported for each in-scope provider via `secrets.json` without introducing additional model-selection features.
- [ ] All relevant docs are updated for the new provider/config/storage contracts (including `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, and `cross-agent-docs/agent-storage-migration-playbook.md`).
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

### ✅ Unit 0: Baseline and file map
**What**: Capture current branch baseline for provider/config/loading code paths and current tests before edits.
**Output**: Baseline notes file in artifacts directory with command outputs and touched-file map for `src/config.ts`, `src/identity.ts`, `src/heart/core.ts`, `src/heart/streaming.ts`, `src/mind/prompt.ts`, `src/senses/{cli,teams}.ts`, and related `src/__tests__/**`.
**Acceptance**: Baseline artifact exists and identifies all files to change for migration, provider abstraction, and provider integrations.

### ✅ Unit 1a: Storage/config refactor contracts + migration runbook docs — Tests
**What**: Add/adjust tests in `src/__tests__/identity.test.ts`, `src/__tests__/config.test.ts`, and path-dependent suites to define required contracts (`agent.json`, `secrets.json`, `.agentstate`) including fail-fast cases for missing/invalid contracts.
**Output**: Failing contract tests for `agent.json.configPath -> ~/.agentsecrets/<agent>/secrets.json`, context loading from `agent.json`, and runtime/session/log/test-run paths under `~/.agentstate`.
**Acceptance**: New/updated tests exist and fail red against current behavior.

### ✅ Unit 1b: Storage/config refactor contracts + migration runbook docs — Implementation
**What**: Implement path contract changes in `src/config.ts`, `src/identity.ts`, `src/senses/{cli,teams}.ts`, and nerves test-run path modules; add `cross-agent-docs/agent-storage-migration-playbook.md` with explicit one-time migration instructions.
**Output**: Runtime/config loader updates, state-path updates, and migration runbook markdown.
**Acceptance**: Contract tests pass green; no runtime fallback to legacy `.agentconfigs` paths.

### ✅ Unit 1c: Storage/config refactor contracts + migration runbook docs — Coverage & Refactor
**What**: Refactor for clarity and verify branch/error-path coverage on migration/config contract code.
**Output**: Refactored config-loading code and coverage report artifact for migration/config paths.
**Acceptance**: 100% coverage on new migration/config code and tests remain green.

### ✅ Unit 2a: Provider abstraction registry — Tests
**What**: Add failing tests in `src/__tests__/heart/core.test.ts` and `src/__tests__/mind/prompt.test.ts` defining provider interface/registry behavior and per-agent provider resolution without singleton coupling.
**Output**: Failing abstraction/registry tests for per-agent provider lookup and engine integration contracts.
**Acceptance**: Tests fail red and prove engine no longer depends on hardcoded provider branching.

### ✅ Unit 2b: Provider abstraction registry — Implementation
**What**: Implement provider abstraction + registry, rewire `src/heart/core.ts` request path to use provider interface selection, and update prompt provider reporting in `src/mind/prompt.ts` to consume abstraction output.
**Output**: Provider interface, registry wiring, engine integration changes.
**Acceptance**: Provider abstraction tests pass green and Azure/MiniMax regression tests remain passing.

### ✅ Unit 2c: Provider abstraction registry — Coverage & Refactor
**What**: Refactor registry/selection code and cover all decision/error branches.
**Output**: Refactored registry code and coverage artifact for provider selection and error branches.
**Acceptance**: 100% coverage on new abstraction code with full related tests green.

### ✅ Unit 3a: Provider-owned streaming/input behavior — Tests
**What**: Add failing tests around `src/heart/core.ts`/`src/heart/streaming.ts` to lock provider-owned streaming/input behavior instead of engine-level provider branches.
**Output**: Failing tests proving provider-owned streaming/input behavior contracts.
**Acceptance**: Tests fail red against old flow.

### ✅ Unit 3b: Provider-owned streaming/input behavior — Implementation
**What**: Move provider-specific streaming/input state handling (including current Azure-specific input accumulation) into provider implementations behind the registry abstraction.
**Output**: Provider implementation updates and simplified engine flow.
**Acceptance**: Streaming behavior tests pass green and parity holds for Azure/MiniMax.

### ✅ Unit 3c: Provider-owned streaming/input behavior — Coverage & Refactor
**What**: Refactor provider-side streaming code and ensure all branches/error paths are covered.
**Output**: Refactored provider streaming/input code and branch coverage artifact.
**Acceptance**: 100% coverage on new provider-side streaming code and tests green.

### ✅ Unit 4a: Anthropic setup-token integration — Tests
**What**: Add failing tests for Anthropic provider behavior, setup-token profile loading contract, and explicit auth-failure messaging in the same heart/config test suites used by provider selection.
**Output**: Failing Anthropic provider/auth tests for success and fail-fast error paths.
**Acceptance**: Anthropic tests fail red before implementation.

### ✅ Unit 4b: Anthropic setup-token integration — Implementation
**What**: Implement Anthropic provider behind the abstraction using setup-token auth profile flow and explicit fail-fast auth errors.
**Output**: Anthropic provider and auth profile integration.
**Acceptance**: Anthropic tests pass green with explicit re-auth guidance on auth failure.

### ✅ Unit 4c: Anthropic setup-token integration — Coverage & Refactor
**What**: Refactor Anthropic provider code and cover all auth and response branches.
**Output**: Refactored Anthropic provider code and coverage artifact for auth/stream branches.
**Acceptance**: 100% coverage on new Anthropic integration code and tests green.

### ⬜ Unit 4d: Provider module extraction pre-Unit-5 pass — Tests
**What**: Add failing tests in `src/__tests__/heart/core.test.ts` and `src/__tests__/heart/streaming.test.ts` that lock provider module boundaries so provider-specific runtime logic is owned in `src/heart/providers/{anthropic,azure,minimax}.ts` and no longer embedded in `src/heart/core.ts`.
**Output**: Failing boundary tests plus artifact logs `unit-4d-red-run.txt` and `unit-4d-red-jest.json`.
**Acceptance**: Tests fail red, logs are saved under the task artifacts directory, and failures identify provider-specific runtime logic still anchored in `src/heart/core.ts`.

### ⬜ Unit 4e: Provider module extraction pre-Unit-5 pass — Implementation
**What**: Create `src/heart/providers/` and extract provider-specific runtime logic from `src/heart/core.ts` into `src/heart/providers/{anthropic,azure,minimax}.ts` with no behavior change.
**Output**: Provider-module refactor plus artifact logs `unit-4e-green-run.txt` and `unit-4e-jest.json`.
**Acceptance**: Boundary tests pass green, targeted regression suites stay green, and artifacts are saved under the task artifacts directory.

### ⬜ Unit 4f: Provider module extraction pre-Unit-5 pass — Coverage & Refactor
**What**: Refactor extracted provider module code for clarity and verify full branch/error-path coverage.
**Output**: Coverage artifacts `unit-4f-coverage.txt` and `unit-4f-coverage-summary.json`.
**Acceptance**: New provider-module code is at 100% coverage, related tests remain green, and coverage artifacts are saved.

### ⬜ Unit 4g: CLI user-output vs nerves-log separation pre-Unit-5 pass — Tests
**What**: Add failing channel-separation tests in `src/__tests__/senses/cli.test.ts`, `src/__tests__/senses/cli-ux.test.ts`, and `src/__tests__/nerves/sinks.test.ts`: user-facing model text on stdout only; structured nerves logs routed to operator sinks (stderr and append-only NDJSON files) and never interleaved into user transcript text.
**Output**: Failing channel-separation tests plus artifact logs `unit-4g-red-run.txt` and `unit-4g-jest.json`.
**Acceptance**: Tests fail red against current interleaving behavior and logs are saved under the task artifacts directory.

### ⬜ Unit 4h: CLI user-output vs nerves-log separation pre-Unit-5 pass — Implementation
**What**: Implement sink separation in `src/senses/cli.ts`, `src/nerves/index.ts`, and any required logger wiring so CLI output stays user-facing while nerves logs are emitted to operator-native sinks, including append-only NDJSON persistence under `~/.agentstate/<agent>/logs`.
**Output**: CLI/logging sink updates plus artifact logs `unit-4h-green-run.txt` and `unit-4h-jest.json`.
**Acceptance**: Channel-separation tests pass green, CLI user text no longer contains structured log lines, and artifacts are saved under the task artifacts directory.

### ⬜ Unit 4i: CLI user-output vs nerves-log separation pre-Unit-5 pass — Coverage & Refactor
**What**: Refactor sink separation code and cover stdout/stderr/file routing branches and error paths.
**Output**: Coverage artifacts `unit-4i-coverage.txt` and `unit-4i-coverage-summary.json`.
**Acceptance**: New sink-separation code is at 100% coverage, related tests remain green, and coverage artifacts are saved.

### ⬜ Unit 4j: Anthropic streamed tool-argument hardening pre-Unit-5 pass — Tests
**What**: Add failing regression tests in `src/__tests__/heart/core.test.ts` for Anthropic streamed tool calls to reproduce malformed argument assembly (including `content_block_start` + `input_json_delta` concatenation cases) and require valid JSON arguments to tools.
**Output**: Failing Anthropic tool-call assembly tests plus artifacts `unit-4j-red-run.txt` and `unit-4j-jest.json`.
**Acceptance**: Tests fail red on current malformed-argument behavior and artifacts are saved under the task artifacts directory.

### ⬜ Unit 4k: Anthropic streamed tool-argument hardening pre-Unit-5 pass — Implementation
**What**: Fix Anthropic stream tool-argument assembly in `src/heart/core.ts` (or extracted Anthropic provider module from Unit 4e) so each tool call receives correctly reconstructed JSON arguments and tool execution proceeds reliably.
**Output**: Anthropic stream assembly fix plus artifact logs `unit-4k-green-run.txt` and `unit-4k-jest.json`.
**Acceptance**: Anthropic tool-assembly tests pass green, no malformed argument payloads are emitted, and artifacts are saved under the task artifacts directory.

### ⬜ Unit 4l: Anthropic streamed tool-argument hardening pre-Unit-5 pass — Coverage & Refactor
**What**: Refactor Anthropic argument assembly handling and cover all edge/error paths for streamed tool-argument reconstruction.
**Output**: Coverage artifacts `unit-4l-coverage.txt` and `unit-4l-coverage-summary.json`.
**Acceptance**: New Anthropic hardening code is at 100% coverage, related tests remain green, and coverage artifacts are saved.

### ⬜ Unit 4m: Anthropic setup-token integration — Manual validation gate
**What**: Execute a real end-to-end Anthropic turn using the setup-token profile path (no mocks), including a tool-calling prompt, and capture sanitized evidence.
**Output**: Manual validation artifacts `unit-4m-manual-validation.txt`, `unit-4m-manual-validation.json`, and `unit-4m-manual-validation.stderr.txt`.
**Acceptance**: Live Anthropic run succeeds via setup-token auth, tool calls execute with valid arguments, failure mode includes explicit re-auth guidance, and all manual artifacts are present.

### ⬜ Unit 5a: OpenAI Codex OAuth integration — Tests
**What**: Add failing tests for `openai-codex` provider behavior, OAuth profile loading contract, and explicit auth-failure messaging in provider/config test suites.
**Output**: Failing OpenAI Codex provider/auth tests for success and fail-fast error paths.
**Acceptance**: OpenAI Codex tests fail red before implementation.

### ⬜ Unit 5b: OpenAI Codex OAuth integration — Implementation
**What**: Implement `openai-codex` provider behind the abstraction with OAuth auth profile flow and explicit fail-fast auth errors.
**Output**: OpenAI Codex provider and auth profile integration.
**Acceptance**: OpenAI Codex tests pass green with explicit re-auth guidance on auth failure.

### ⬜ Unit 5c: OpenAI Codex OAuth integration — Coverage & Refactor
**What**: Refactor OpenAI Codex provider code and cover all auth and response branches.
**Output**: Refactored OpenAI Codex provider code and coverage artifact for auth/response branches.
**Acceptance**: 100% coverage on new OpenAI Codex integration code and tests green.

### ⬜ Unit 5d: OpenAI Codex OAuth integration — Manual validation gate
**What**: Execute a real end-to-end OpenAI Codex turn using OAuth profile auth (no mocks) and capture sanitized evidence.
**Output**: Artifact log with timestamp, provider id, model, command/entrypoint used, and outcome.
**Acceptance**: Live OpenAI Codex run succeeds via OAuth auth; failure mode includes explicit re-auth guidance; evidence artifact is present.

### ⬜ Unit 6a: Migration runbook and storage-contract docs
**What**: Finalize `cross-agent-docs/agent-storage-migration-playbook.md` with explicit `~/.agentconfigs` -> `~/.agentsecrets`/`~/.agentstate` moves, validation steps, and post-migration cleanup notes for the other machine.
**Output**: Migration runbook updates and supporting docs aligned to new storage boundaries.
**Acceptance**: Runbook has explicit move/verify/cleanup steps and matches implemented storage paths.

### ⬜ Unit 6b: Provider/config contract docs
**What**: Update `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `slugger/agent.json`, and related provider/config docs to reflect provider IDs, auth profile flows, and fail-fast behavior.
**Output**: Documentation updates aligned to implemented provider/config behavior.
**Acceptance**: Documentation reflects final runtime provider behavior and config contracts without contradictions.

### ⬜ Unit 7a: Full-suite and coverage verification
**What**: Run full test suite, coverage checks, and static checks; assemble execution evidence in artifacts.
**Output**: Full verification log and coverage artifacts in task artifacts directory.
**Acceptance**: All tests pass, no warnings, new-code coverage is 100%, manual Anthropic/OpenAI auth validation artifacts are present, and completion criteria are all satisfied.

### ⬜ Unit 7b: Completion checklist and closeout
**What**: Validate completion criteria checkboxes against evidence and prepare merge-ready summary.
**Output**: Updated doing checklist and closeout summary artifact referencing evidence locations.
**Acceptance**: Every completion checkbox has direct evidence and task is ready for work-doer execution/closure flow.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./[task-name]/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-04 15:26 Created from planning doc
- 2026-03-04 15:30 Granularity pass: added missing unit outputs and split docs/final verification into atomic units
- 2026-03-04 15:32 Clarified scope wording: this task does storage/config refactor first; legacy data migration itself is manual out-of-band via runbook
- 2026-03-04 15:35 Validation pass: aligned units to actual repository files and current legacy path usage (`.agentconfigs`) to be migrated
- 2026-03-04 15:35 Added manual validation gates for live Anthropic setup-token and OpenAI Codex OAuth verification with required artifacts
- 2026-03-04 15:38 Quality pass: confirmed unit headers/acceptance completeness and set status to READY_FOR_EXECUTION
- 2026-03-04 16:07 Completed Unit 2a red tests for provider registry contract with artifact captured at `unit-2a-red-run.txt`
- 2026-03-04 16:04 Completed Unit 2b provider registry implementation and green targeted regression run (`unit-2b-test-run.txt`)
- 2026-03-04 16:05 Completed Unit 2c refactor/coverage pass; targeted coverage reports `core.ts` and `prompt.ts` at 100% (`unit-2c-coverage-run.txt`)
- 2026-03-04 16:06 Completed Unit 3a red tests for provider-owned streaming/input hooks with artifact captured at `unit-3a-red-run.txt`
- 2026-03-04 16:08 Completed Unit 3b provider-owned streaming/input implementation with green targeted regression run (`unit-3b-test-run.txt`)
- 2026-03-04 16:10 Completed Unit 3c refactor/coverage pass; targeted coverage reports `core.ts` and `prompt.ts` at 100% (`unit-3c-coverage-run.txt`)
- 2026-03-04 16:23 Completed Unit 4a Anthropic setup-token red tests for provider selection, setup-token profile loading, and re-auth guidance (`unit-4a-red-run.txt`)
- 2026-03-04 16:27 Completed Unit 4b Anthropic setup-token implementation and green targeted Anthropic regression run (`unit-4b-test-run.txt`)
- 2026-03-04 16:38 Completed Unit 4c Anthropic coverage/refactor pass; targeted coverage reports `core.ts` and `prompt.ts` at 100% (`unit-4c-test-run.txt`, `unit-4c-coverage-run.txt`)
- 2026-03-04 15:44 Unit 0 complete: captured branch baseline, scripts, and touched-file map in `unit-0-baseline.md`
- 2026-03-04 15:47 Unit 1a complete: added failing contract tests for `.agentsecrets`/`.agentstate` paths and `agent.json` context sourcing (`unit-1a-red-run.txt`)
- 2026-03-04 15:53 Unit 1b complete: implemented secrets/state path contracts, moved context sourcing to `agent.json`, and added migration runbook (`unit-1b-*.txt`)
- 2026-03-04 15:56 Unit 1c complete: achieved green coverage gate + nerves audit after branch-coverage hardening (`unit-1c-*.txt`)
- 2026-03-04 18:34 Added pre-Unit-5 Unit 4d-4m scope for provider module extraction, CLI/log channel separation, and Anthropic streamed tool-argument hardening
- 2026-03-04 18:39 Pass 1 (First Draft) rerun on Units 4d-4m: structure/order unchanged and aligned with planning scope
- 2026-03-04 18:39 Pass 2 (Granularity) refined Units 4d-4m outputs/acceptance with explicit per-unit artifact files
- 2026-03-04 18:40 Pass 3 (Validation) aligned Units 4d-4m to actual repository test/runtime files and explicit provider-module creation path
