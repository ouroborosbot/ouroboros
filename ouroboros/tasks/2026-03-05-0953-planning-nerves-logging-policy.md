# Planning: Nerves Logging Policy Enforcement

**Status**: NEEDS_REVIEW
**Created**: 2026-03-05 09:54

## Goal
Achieve 100% automatic nerves observability enforcement: replace the manual `REQUIRED_EVENTS` manifest with 5 automatic audit rules, enforce `no-console` via ESLint, add `emitNervesEvent` calls to every observable code path in production, and document the logging policy.

## Scope

### In Scope

**Phase A: ESLint and console enforcement**
- Install ESLint and `typescript-eslint` as devDependencies
- Create `eslint.config.js` (flat config) with `no-console: "error"` scoped to `src/**/*.ts`
- Exclude `src/__tests__/**` from the no-console rule (test files may mock/spy on console)
- Add `lint` script to package.json (`eslint src/`)
- Annotate 8 legitimate console.* call sites with `// eslint-disable-next-line no-console -- <category>: <reason>`:
  - Pre-boot guard (2 sites): `src/cli-entry.ts:9`, `src/teams-entry.ts:9`
  - Terminal UX (4 sites): `src/senses/cli.ts:377`, `src/senses/cli.ts:420`, `src/senses/cli.ts:424`, `src/senses/cli.ts:474`
  - Meta-tooling (2 sites): `src/nerves/coverage/cli.ts:34`, `src/nerves/coverage/cli.ts:49`
- Integrate `npm run lint` into `scripts/run-coverage-gate.cjs` as a step before vitest

**Phase B: Replace REQUIRED_EVENTS with 5 automatic audit rules**
- Remove `REQUIRED_EVENTS`, `getRequiredEventKeys()`, `getDeclaredLogpoints()` from `src/nerves/coverage/contract.ts`
- Keep `REQUIRED_ENVELOPE_FIELDS`, `SENSITIVE_PATTERNS`, `eventKey()` in contract.ts (still needed)
- Rewrite `src/nerves/coverage/audit.ts` to implement 5 automatic rules:
  1. **Every test emits at least one nerves event** -- catches dead zones where tests exercise production code but no events are emitted. Requires per-test event tracking.
  2. **Start/end pairing** -- every event ending in `_start` must have a corresponding event with the same prefix ending in `_end` or `_error` within the same test. Naming convention: `component.action_start` / `component.action_end` / `component.action_error` (e.g., `engine.turn_start` / `engine.turn_end` / `engine.error`). The audit matches on `_start` suffix and looks for `_end` or `_error` with the same prefix. Catches fire-and-forget gaps.
  3. **Error events include context** -- every error-level event must have non-empty `meta`. No "something failed" without the what and why.
  4. **Source coverage** -- every `emitNervesEvent` call site in production source code was exercised during the test run. Static regex scan of `src/**/*.ts` (excluding tests and nerves infra) extracts `component:event` keys, cross-referenced against events captured during tests. No manual list needed. **Requires static string literals** -- all `emitNervesEvent` calls must use string literals (not template literals, not variables) for `event` and `component` fields so the scanner can extract them.
  5. **File completeness** -- every production `.ts` file in `src/` (excluding `src/__tests__/` and pure type-only files) must contain at least one `emitNervesEvent` call. The static scanner discovers which files have calls; the audit flags any production file with zero calls. Prevents new production files from being added without nerves events. Exemption: files containing only `type`/`interface`/`enum` declarations with zero executable code (function/class/const) are exempt -- the scanner detects this automatically.
- Keep existing checks: schema envelope validation, SENSITIVE_PATTERNS redaction check
- Update `src/__tests__/nerves/global-capture.ts` to support per-test event tracking:
  - Currently captures events globally via `registerGlobalLogSink`
  - Add `beforeEach`/`afterEach` hooks: reset captured events between tests so each test's events are isolated
  - Track test name -> event keys mapping
  - Per-test data written to a file (e.g., `vitest-events-per-test.json`) for the audit to consume
  - `maxWorkers: 1` means no interleaving risk
- Update or rewrite `src/__tests__/nerves/coverage-audit.test.ts` -- tests the new 5-rule audit
- Update or rewrite `src/__tests__/nerves/coverage-contract.test.ts` -- tests updated contract (no more REQUIRED_EVENTS)
- Remove `src/__tests__/nerves/emit-new-events.test.ts` -- exists solely to emit REQUIRED_EVENTS for the old audit; no longer needed
- Update `scripts/run-coverage-gate.cjs` if audit interface changes

**Phase B nuance -- Rule 1 has no exceptions:**
- ALL tests must emit at least one nerves event. No exemptions, no carve-outs.
- Every production module needs nerves events, including pure utility functions. If code runs, it emits.
- This means Phase C must add nerves events to ALL production files with executable code, not just files with I/O or error handling.
- Only `src/mind/friends/types.ts` is exempt (pure TypeScript type definitions, zero executable code).

**Phase C: Full nerves coverage of existing production code**
- Audit production files that currently lack `emitNervesEvent` calls
- Add nerves events for observable code paths: error catches, state transitions, I/O operations, API calls, startup/shutdown, connection events
- Events are now self-registering via the source coverage scan (Rule 4) -- no manual REQUIRED_EVENTS updates needed
- Add test coverage so every new event is observed during test runs
- Files needing nerves events (20 files, ~3920 lines):
  - Heart domain:
    - `src/heart/providers/anthropic.ts` (378 lines -- API calls, error handling, streaming)
    - `src/heart/providers/azure.ts` (56 lines -- provider init)
    - `src/heart/providers/minimax.ts` (41 lines -- provider init)
    - `src/heart/providers/openai-codex.ts` (163 lines -- API calls, error handling)
    - `src/heart/streaming.ts` (457 lines -- stream processing, errors)
    - `src/heart/turn-coordinator.ts` (68 lines -- turn coordination)
    - `src/heart/api-error.ts` (36 lines -- error classification)
  - Mind domain:
    - `src/mind/first-impressions.ts` (38 lines -- first impressions logic)
    - `src/mind/friends/channel.ts` (36 lines -- channel resolution)
    - `src/mind/friends/store.ts` (13 lines -- store factory)
    - `src/mind/friends/store-file.ts` (178 lines -- file I/O, error handling)
    - `src/mind/friends/tokens.ts` (24 lines -- token processing)
  - Repertoire domain:
    - `src/repertoire/ado-context.ts` (88 lines -- ADO context building)
    - `src/repertoire/ado-semantic.ts` (950 lines -- ADO semantic operations, API calls, errors)
    - `src/repertoire/ado-templates.ts` (193 lines -- template operations)
    - `src/repertoire/tools-base.ts` (375 lines -- tool execution, errors)
    - `src/repertoire/tools-github.ts` (43 lines -- GitHub tool definitions)
    - `src/repertoire/tools-teams.ts` (306 lines -- Teams tool operations)
  - Senses domain:
    - `src/senses/cli.ts` (476 lines -- CLI REPL, commands, session management)
    - `src/senses/cli-logging.ts` (11 lines -- logger setup)
- Skipped (zero executable code):
  - `src/mind/friends/types.ts` -- pure TypeScript type definitions only

**Phase D: Documentation and work-merger integration**
- Add "Logging Policy" section to AGENTS.md covering:
  - All runtime logging uses `emitNervesEvent()`, never raw `console.*`
  - Three categories of legitimate console exceptions (pre-boot guard, terminal UX, meta-tooling)
  - Each exception requires `// eslint-disable-next-line no-console -- <category>: <reason>`
  - Automatic enforcement via 5 audit rules (no manual manifest)
  - Start/end pairing naming convention: `component.action_start` / `component.action_end` / `component.action_error`
  - Error events must include context in meta
  - Static string literals only: `event` and `component` fields in `emitNervesEvent` must be string literals (no template literals, no variables) so the static scanner can extract them
  - File completeness: every production `.ts` file must have at least one `emitNervesEvent` call (pure type-only files exempt)
  - Two-layer enforcement model: 5 deterministic audit rules (CI), plus work-merger judgment review (PR)
- Add brief logging policy mention in CONTRIBUTING.md under the Code section
- Update `subagents/work-merger.md` to add a nerves review step to its PR/CI workflow:
  - When reviewing code changes on the branch, check for new code paths (functions, catch blocks, state transitions, I/O operations) that lack corresponding `emitNervesEvent` calls
  - This is a judgment call that deterministic rules cannot automate -- "should this code path emit an event?"
  - Add as a checklist item in the CI Failure Self-Repair or PR Workflow section
  - The 5 audit rules catch what is automatable; work-merger catches what requires judgment

### Out of Scope
- Converting any remaining console.* calls (already done on this branch)
- Refactoring the nerves runtime API (`emitNervesEvent` signature stays the same)
- Adding ESLint rules beyond no-console (keep config minimal)
- Creating a cross-agent-docs file for logging (keep it simple in AGENTS.md for now)
- CI pipeline changes beyond the coverage gate integration
- `src/mind/friends/types.ts` -- pure TypeScript type definitions, zero executable code

## Completion Criteria
- [ ] ESLint installed and configured with `no-console: "error"` for `src/**/*.ts` (excluding tests)
- [ ] All 8 console exception sites annotated with correct category and reason
- [ ] `npm run lint` passes cleanly (zero violations)
- [ ] `npm run lint` integrated into `scripts/run-coverage-gate.cjs`
- [ ] `REQUIRED_EVENTS` removed from contract.ts (manual manifest eliminated)
- [ ] Nerves audit implements 5 automatic rules: every-test-emits, start/end-pairing, error-context, source-coverage, file-completeness
- [ ] All `emitNervesEvent` calls use static string literals for `event` and `component` (no template literals, no variables)
- [ ] Per-test event tracking implemented in global-capture.ts
- [ ] Schema envelope validation and SENSITIVE_PATTERNS redaction check preserved
- [ ] All 20 production files have nerves events (every file with executable code; only types.ts skipped)
- [ ] All nerves events observed during test runs (Rule 4: source coverage passes)
- [ ] `emit-new-events.test.ts` removed (no longer needed)
- [ ] Logging Policy section added to AGENTS.md
- [ ] Logging policy mention added to CONTRIBUTING.md
- [ ] `subagents/work-merger.md` updated with nerves review checklist item
- [ ] `npm test` still passes
- [ ] No warnings
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] `npm run test:coverage` gate passes (lint + vitest 100% + nerves audit 5 rules all green)

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [x] Pure type/interface files (`types.ts`): Skip -- no runtime behavior, no observable paths.
- [x] Tiny files: `store.ts` is pure interface -- skip. `cli-logging.ts` is nerves infrastructure itself -- skip.
- [x] Phase C grouping: By domain (heart, mind, repertoire, senses) for coherent event naming.
- [x] **Rule 1 scope**: ALL tests must emit at least one nerves event. No exemptions, no carve-outs. Every production module needs nerves events, including pure utility functions. If code runs, it emits. This means Phase C must also add nerves events to currently-skipped pure-logic files (types.ts excluded since it has zero runtime, but anything with executable code needs events).
- [x] **Per-test event tracking**: beforeEach/afterEach hooks in global-capture.ts. Reset captured events between tests so each test's events are isolated. `maxWorkers: 1` means no interleaving.
- [x] **Rule 2 (start/end pairing)**: Scoped within a single test.

## Decisions Made
- Use ESLint flat config (`eslint.config.js`) since the project has no existing ESLint setup
- Keep ESLint config minimal (only no-console rule) to avoid scope creep
- Exclude test files from no-console -- some tests mock/spy on console
- Three console exception categories: pre-boot guard, terminal UX, meta-tooling
- Integrate lint into `scripts/run-coverage-gate.cjs` so CI catches violations automatically
- Only skip `types.ts` (zero executable code). All other production files need nerves events, including pure utilities.
- Phase C work grouped by domain (heart, mind, repertoire, senses) for coherent event naming
- REQUIRED_EVENTS manual manifest replaced by 5 automatic audit rules
- Static regex scan used for Rule 4 (source coverage) -- automatic discovery, no manual registration
- Primary enforcement is runtime observation -- tests emit events, audit verifies all call sites exercised
- SENSITIVE_PATTERNS and schema envelope validation preserved
- `emit-new-events.test.ts` to be deleted (artifact of old manual-manifest model)
- Rule 1: ALL tests must emit at least one nerves event. No exemptions. If code runs, it emits.
- Per-test event tracking via beforeEach/afterEach hooks with reset between tests
- Rule 2 (start/end pairing): scoped within a single test. Naming convention: `_start` / `_end` / `_error` suffixes with shared prefix.
- Rule 5 (file completeness): every production .ts file must have at least one emitNervesEvent call. Pure type-only files exempt (detected by absence of function/class/const declarations).
- Static string literals only for `event` and `component` in emitNervesEvent calls -- no template literals, no variables. Enables reliable regex extraction.
- Two-layer enforcement: 5 deterministic audit rules in CI (automatable), plus work-merger judgment review on PRs (catches new code paths missing events that rules cannot detect).

## Context / References
- Prior planning doc: `ouroboros/tasks/2026-03-04-2354-planning-nerves-console-migration.md` (completed)
- Branch: `ouroboros/nerves-console-migration`
- `src/nerves/runtime.ts` -- `emitNervesEvent()` API: `{ level?, event, trace_id?, component, message, meta? }`
- `src/nerves/coverage/contract.ts` -- currently has `REQUIRED_EVENTS` (31 entries), `REQUIRED_ENVELOPE_FIELDS`, `SENSITIVE_PATTERNS`, `eventKey()`. REQUIRED_EVENTS to be removed; others kept.
- `src/nerves/coverage/audit.ts` -- current audit: checks REQUIRED_EVENTS observed, validates schema/redaction, checks logpoints. To be rewritten with 5 automatic rules.
- `src/__tests__/nerves/global-capture.ts` -- current global event capture via `registerGlobalLogSink`. Needs per-test tracking added.
- `src/__tests__/nerves/coverage-audit.test.ts` -- tests for the audit. To be rewritten for new rules.
- `src/__tests__/nerves/coverage-contract.test.ts` -- tests for contract. To be updated (no more REQUIRED_EVENTS).
- `src/__tests__/nerves/emit-new-events.test.ts` -- exists solely to emit REQUIRED_EVENTS for old audit. To be removed.
- `scripts/run-coverage-gate.cjs` -- coverage gate script. May need updates if audit interface changes.
- `vitest.config.ts` -- setupFiles includes `global-capture.ts`, `maxWorkers: 1` (serial execution simplifies per-test tracking)
- 8 console exception sites confirmed at current line numbers
- 20 production files without emitNervesEvent calls (only types.ts skipped -- zero executable code)
- Existing naming convention: `{component}:{component_prefix}.{action}` (e.g., `engine:engine.turn_start`)
- Start/end pairing naming: `component.action_start` / `component.action_end` / `component.action_error` -- audit matches on `_start` suffix, looks for `_end` or `_error` with same prefix
- `subagents/work-merger.md` -- merge agent spec. Currently has no code review checklist. Needs nerves review step added.

**Blast radius of removing REQUIRED_EVENTS (6 files):**
- `src/nerves/coverage/contract.ts` -- definition site
- `src/nerves/coverage/audit.ts` -- consumes it
- `src/__tests__/nerves/global-capture.ts` -- uses `getDeclaredLogpoints()`
- `src/__tests__/nerves/coverage-contract.test.ts` -- tests the contract
- `src/__tests__/nerves/coverage-audit.test.ts` -- uses REQUIRED_EVENTS to build test data
- `src/__tests__/nerves/emit-new-events.test.ts` -- entire file exists only for old audit (delete)

## Notes
- Phase B is the most architecturally significant change. The audit moves from "verify a manual list" to "automatically discover and enforce."
- The `maxWorkers: 1` in vitest.config.ts means tests run serially, which simplifies per-test event tracking (no concurrent test interleaving).
- Rule 4 (source coverage) regex needs to extract `component` and `event` from `emitNervesEvent` calls. The pattern is consistent: `emitNervesEvent({ ... event: "foo", ... component: "bar" ... })`. Multi-line extraction needed since calls often span multiple lines.
- The `emit-new-events.test.ts` file is a workaround for the old model -- under the new model, tests that exercise real production code will naturally emit the events.
- Rule 1 "no exemptions" means even small utility files like `store.ts` (13 lines, factory function) and `cli-logging.ts` (11 lines, logger setup) need nerves events. This drives toward total observability -- every code path that runs is visible in the event stream.
- Static string literals requirement for `event`/`component` enables the regex scanner to reliably extract keys. If a call uses a variable or template literal, the scanner cannot discover it, and Rule 4 (source coverage) will not track it. This is a hard policy -- code review should catch violations.
- Rule 5 (file completeness) closes the gap where someone adds a new production file whose code gets exercised by existing tests that already emit events from other modules. Without Rule 5, Rule 1 (every test emits) would pass because the test emits events from some other module, but the new file itself has zero observability.
- The file completeness exemption for pure type files uses a heuristic: if a file has no `function`, `class`, or `const` declarations (only `type`, `interface`, `enum`), it is exempt. This should be simple to implement with regex.
- Two-layer enforcement model: the 5 deterministic audit rules catch structural violations (missing events, broken pairing, empty error meta, unregistered call sites, empty files). But they cannot judge whether a *new* code path *should* have an event. That requires reading the code and understanding intent. work-merger fills this gap -- when reviewing PR changes, it checks for new functions/catch blocks/I/O operations that lack nerves calls. This is the "last mile" of observability enforcement.

## Progress Log
- 2026-03-05 09:54 Created
- 2026-03-05 09:54 Resolved open questions, updated decisions, approved
- 2026-03-05 10:05 Scope expanded: bidirectional audit + full nerves coverage of all production files
- 2026-03-05 10:09 Resolved all open questions: skip 3 pure-type/infra files, runtime-primary enforcement model, domain grouping
- 2026-03-05 10:29 Major scope change: replace REQUIRED_EVENTS with 4 automatic audit rules
- 2026-03-05 10:34 Resolved: Rule 1 no exemptions (all tests emit), beforeEach/afterEach per-test tracking, Rule 2 within single test. File count now 20 (only types.ts skipped).
- 2026-03-05 10:39 Approved
- 2026-03-05 10:58 Added: Rule 5 (file completeness), start/end naming convention, static string literals policy. Now 5 rules.
- 2026-03-05 11:04 Added: work-merger nerves review step in subagents/work-merger.md, two-layer enforcement model (CI rules + merger judgment).
