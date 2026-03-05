# Planning: Nerves Logging Policy Enforcement

**Status**: NEEDS_REVIEW
**Created**: 2026-03-05 09:54

## Goal
Achieve 100% nerves observability coverage across all production source files: enforce the `no-console` ESLint rule, add `emitNervesEvent` calls to every observable code path, tighten the nerves audit to bidirectionally verify the source-code-to-contract relationship, and document the logging policy.

## Scope

### In Scope

**Phase A: ESLint and console enforcement (original scope)**
- Install ESLint and `typescript-eslint` as devDependencies
- Create `eslint.config.js` (flat config) with `no-console: "error"` scoped to `src/**/*.ts`
- Exclude `src/__tests__/**` from the no-console rule (test files may mock/spy on console)
- Add `lint` script to package.json (`eslint src/`)
- Annotate 8 legitimate console.* call sites with `// eslint-disable-next-line no-console -- <category>: <reason>`:
  - Pre-boot guard (2 sites): `src/cli-entry.ts:9`, `src/teams-entry.ts:9`
  - Terminal UX (4 sites): `src/senses/cli.ts:377`, `src/senses/cli.ts:420`, `src/senses/cli.ts:424`, `src/senses/cli.ts:474`
  - Meta-tooling (2 sites): `src/nerves/coverage/cli.ts:34`, `src/nerves/coverage/cli.ts:49`
- Integrate `npm run lint` into `scripts/run-coverage-gate.cjs` as a step before vitest

**Phase B: Bidirectional audit enforcement**
- Enhance `src/nerves/coverage/audit.ts` to scan production source files for all `emitNervesEvent` calls, extract their `component:event` keys, and verify every key appears in `REQUIRED_EVENTS`
- The audit already checks that every `REQUIRED_EVENTS` entry is observed during tests -- keep that
- New check direction: source code emitNervesEvent calls --> must be registered in contract
- If someone adds an emitNervesEvent call without registering it in REQUIRED_EVENTS, the audit fails

**Phase C: Full nerves coverage of existing production code**
- Audit all 21 production files that currently lack `emitNervesEvent` calls
- Add nerves events for observable code paths: error catches, state transitions, I/O operations, API calls, startup/shutdown, connection events
- Register all new events in `REQUIRED_EVENTS` in `contract.ts`
- Add test coverage so every new event is observed during test runs
- Files needing nerves events (21 files, ~4000 lines):
  - `src/heart/providers/anthropic.ts` (378 lines -- API calls, error handling, streaming)
  - `src/heart/providers/azure.ts` (56 lines -- provider init)
  - `src/heart/providers/minimax.ts` (41 lines -- provider init)
  - `src/heart/providers/openai-codex.ts` (163 lines -- API calls, error handling)
  - `src/heart/streaming.ts` (457 lines -- stream processing, errors)
  - `src/heart/turn-coordinator.ts` (68 lines -- turn coordination)
  - `src/heart/api-error.ts` (36 lines -- error classification)
  - `src/mind/first-impressions.ts` (38 lines -- first impressions logic)
  - `src/mind/friends/channel.ts` (36 lines -- channel resolution)
  - `src/mind/friends/store-file.ts` (178 lines -- file I/O, error handling)
  - `src/mind/friends/store.ts` (13 lines -- store interface/factory)
  - `src/mind/friends/tokens.ts` (24 lines -- token processing)
  - `src/mind/friends/types.ts` (66 lines -- type definitions, likely no events needed)
  - `src/repertoire/ado-context.ts` (88 lines -- ADO context building)
  - `src/repertoire/ado-semantic.ts` (950 lines -- ADO semantic operations, API calls, errors)
  - `src/repertoire/ado-templates.ts` (193 lines -- template operations)
  - `src/repertoire/tools-base.ts` (375 lines -- tool execution, errors)
  - `src/repertoire/tools-github.ts` (43 lines -- GitHub tool definitions)
  - `src/repertoire/tools-teams.ts` (306 lines -- Teams tool operations)
  - `src/senses/cli-logging.ts` (11 lines -- logging setup)
  - `src/senses/cli.ts` (476 lines -- CLI REPL, commands, session management)

**Phase D: Documentation**
- Add "Logging Policy" section to AGENTS.md covering:
  - All runtime logging uses `emitNervesEvent()`, never raw `console.*`
  - Three categories of legitimate console exceptions (pre-boot guard, terminal UX, meta-tooling)
  - Each exception requires `// eslint-disable-next-line no-console -- <category>: <reason>`
  - New events must be registered in `src/nerves/coverage/contract.ts` REQUIRED_EVENTS
  - Bidirectional audit: source calls must match contract, contract must match test observations
- Add brief logging policy mention in CONTRIBUTING.md under the Code section

### Out of Scope
- Converting any remaining console.* calls (already done on this branch)
- Refactoring the nerves runtime API itself
- Adding ESLint rules beyond no-console (keep config minimal)
- Creating a cross-agent-docs file for logging (keep it simple in AGENTS.md for now)
- CI pipeline changes beyond the coverage gate integration
- Pure type-definition files that have no runtime behavior (may be skipped with justification)

## Completion Criteria
- [ ] ESLint installed and configured with `no-console: "error"` for `src/**/*.ts` (excluding tests)
- [ ] All 8 console exception sites annotated with correct category and reason
- [ ] `npm run lint` passes cleanly (zero violations)
- [ ] `npm run lint` integrated into `scripts/run-coverage-gate.cjs`
- [ ] Nerves audit performs bidirectional contract verification (source calls <--> REQUIRED_EVENTS)
- [ ] All 21 production files audited for nerves coverage gaps
- [ ] Every observable code path in production has an `emitNervesEvent` call
- [ ] All new events registered in `REQUIRED_EVENTS` in `contract.ts`
- [ ] All new events observed during test runs (nerves audit passes)
- [ ] Logging Policy section added to AGENTS.md
- [ ] Logging policy mention added to CONTRIBUTING.md
- [ ] `npm test` still passes
- [ ] No warnings
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] `npm run test:coverage` gate passes (lint + vitest + nerves audit all green)

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [ ] For pure type/interface files like `src/mind/friends/types.ts` (66 lines of type definitions), should we skip nerves events since there is no runtime behavior? Proposed: yes, skip with documented justification.
- [ ] For very small files with no I/O or error handling (e.g., `src/senses/cli-logging.ts` at 11 lines, `src/mind/friends/store.ts` at 13 lines), same question -- skip if no observable behavior?
- [ ] Should the bidirectional audit scan use static regex extraction of emitNervesEvent calls, or AST parsing? Proposed: regex extraction (simpler, sufficient for the `emitNervesEvent({...component: "x", event: "y"...})` pattern).
- [ ] For Phase C, should we tackle files grouped by domain (heart, mind, repertoire, senses) or by size/complexity? Proposed: group by domain for coherent event naming.

## Decisions Made
- Use ESLint flat config (`eslint.config.js`) since the project has no existing ESLint setup
- Keep ESLint config minimal (only no-console rule) to avoid scope creep
- Exclude test files from no-console -- some tests mock/spy on console
- Three console exception categories: pre-boot guard, terminal UX, meta-tooling
- Integrate lint into `scripts/run-coverage-gate.cjs` so CI catches violations automatically
- Scope expanded from "enforce no-console" to "100% nerves observability" -- bidirectional audit + full coverage of all production files

## Context / References
- Prior planning doc: `ouroboros/tasks/2026-03-04-2354-planning-nerves-console-migration.md` (completed)
- Branch: `ouroboros/nerves-console-migration`
- `src/nerves/runtime.ts` -- `emitNervesEvent()` API: `{ level?, event, trace_id?, component, message, meta? }`
- `src/nerves/coverage/contract.ts` -- `REQUIRED_EVENTS` array (currently 31 entries), `SENSITIVE_PATTERNS`, `eventKey()`, `getRequiredEventKeys()`
- `src/nerves/coverage/audit.ts` -- current audit: checks REQUIRED_EVENTS observed in test run, validates schema/redaction, checks logpoints. Does NOT scan source files.
- `scripts/run-coverage-gate.cjs` -- coverage gate script to integrate lint into
- 8 console exception sites confirmed at current line numbers
- 21 production files without emitNervesEvent calls identified via grep
- Existing naming convention: `{component}:{component_prefix}.{action}` (e.g., `engine:engine.turn_start`, `channels:channel.message_sent`)

## Notes
- This is a large scope expansion. Phase C alone covers 21 files with ~4000 lines of production code. Each file needs: audit for observable paths, add emitNervesEvent calls, register events, write tests for new events.
- The bidirectional audit (Phase B) should be done before Phase C so it can catch registration gaps as we add events.
- Files like `types.ts` that are pure type definitions with no runtime behavior can be skipped -- no observable code paths means no events to emit.
- The `api-error.ts` file (36 lines) is a utility for error classification -- it may warrant a nerves event for error classification results, or it may be pure logic with no I/O. Needs inspection.

## Progress Log
- 2026-03-05 09:54 Created
- 2026-03-05 09:54 Resolved open questions, updated decisions, approved
- 2026-03-05 10:05 Scope expanded: bidirectional audit + full nerves coverage of all production files
