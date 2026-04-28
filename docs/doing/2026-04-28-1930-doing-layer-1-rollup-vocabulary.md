# Doing: Layer 1 — Rollup Vocabulary Fix (`healthy/partial/degraded/safe-mode/down`)

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct (strict-TDD)
**Created**: 2026-04-28 19:30 UTC
**Planning**: ../planning/2026-04-28-1900-planning-harness-hardening-and-repairguide.md
**Artifacts**: ./2026-04-28-1930-doing-layer-1-rollup-vocabulary/

**PR shape**: Standalone PR. First in the four-PR sequence (1 → 4 → 2 → 3). No prior dependencies.
**Downstream consumers**: Layers 4, 2, and 3 all inherit this vocabulary. Once merged, layer 4 begins; that branch must be cut from main *after* this PR lands.

## Execution Mode

- **direct** with strict TDD enforced. Single-session execution. Sequential units. Commit per phase (1a/1b/1c). Push when unit complete.

## Objective

Replace today's binary `"degraded" | "ok"` daemon-wide rollup — written at `daemon-entry.ts:164` (`status: degraded.length > 0 ? "degraded" : "ok"`) — with the locked five-state vocabulary: `healthy` / `partial` / `degraded` / `safe-mode` / `down`.

The current rollup merges two sources into one `degraded[]` array:
1. `degradedComponents[]` — written by `recordRecoverableBootstrapFailure` (`daemon-entry.ts:183-217`) for bootstrap-time failures.
2. `agentDegradedComponents[]` — derived from `processManager.listAgentSnapshots()` for agents whose `status !== "running"`.

Today the rollup is "any entry in either source promotes daemon to `degraded`." This is the slugger-symptom: one sick agent tips the whole harness to `degraded`. The fix is to compute a richer rollup that distinguishes "zero agents serving" (genuinely `degraded`) from "some agents unhealthy, others serving" (`partial`).

The per-agent live-check loop in `cli-exec.ts:287` is already try/catch-isolated. **Do NOT redesign that loop.** This PR changes how the output of `processManager.listAgentSnapshots()` + `degradedComponents[]` roll up into the daemon-wide `status` field at `daemon-entry.ts:163-180`'s `buildDaemonHealthState`.

After this PR: `degraded` means "zero enabled agents serving" (genuinely no working agents), not "any one agent is unhealthy."

## Completion Criteria

- [ ] `DaemonHealthState.status` (`src/heart/daemon/daemon-health.ts:30-40`) accepts the five-state vocabulary as a union literal type. The current `string` typing is replaced with `"healthy" | "partial" | "degraded" | "safe-mode" | "down"`.
- [ ] Rollup decision function exists (`computeDaemonRollup` or similar — name decided during implementation): given the per-agent status array + bootstrap-degradedComponents array + safe-mode flag, returns the correct rollup state per the table below.
- [ ] All call sites that read or write `DaemonHealthState.status` use the new vocabulary. No string literals like `"running"` / `"degraded"` floating around without source-of-truth in the new type.
- [ ] `inner-status.ts` and `startup-tui.ts` consumers render the new vocabulary correctly (text labels, color/emoji conventions match the existing degraded affordances).
- [ ] Existing safe-mode crash-loop semantics from `safe-mode.ts` still work; the rollup just surfaces them through the new `safe-mode` state name.
- [ ] No regression: `serpentguide-bootstrap.test.ts` and similar daemon-bootstrap tests still pass.
- [ ] 100% test coverage on all new code (rollup function, type predicates, render-path branches).
- [ ] All tests pass.
- [ ] No warnings.
- [ ] PR description (`./2026-04-28-1930-doing-layer-1-rollup-vocabulary/pr-description.md`) drafted before merger.

### Rollup state table (the contract this PR must encode)

| Daemon-wide state | When it fires |
| --- | --- |
| `healthy` | All enabled agents healthy. No bootstrap-degraded components. No safe-mode. |
| `partial` | At least one enabled agent healthy AND at least one enabled agent unhealthy. (Today's incorrect "degraded".) |
| `degraded` | Zero enabled agents serving (every enabled agent failed live-check). |
| `safe-mode` | Crash-loop tripped (3 in 5min) per `safe-mode.ts`. Overrides everything else. |
| `down` | Daemon process itself can't start / can't read agent inventory / fatal pre-rollup error. |

Bootstrap-degraded components (`degradedComponents[]` from `recordRecoverableBootstrapFailure`) influence the rollup but never escalate it past `partial` on their own — they downgrade `healthy` to `partial`, never below.

## Code Coverage Requirements

**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code.
- All branches of the rollup function (each entry in the table above is its own branch).
- All error paths tested (empty agents array, all agents unhealthy, mixed, safe-mode trumps everything).
- Edge cases:
  - Zero enabled agents on a fresh install → `degraded` (no agents to serve).
  - One enabled agent, healthy → `healthy`.
  - One enabled agent, unhealthy → `degraded` (zero serving).
  - Two enabled agents, both healthy → `healthy`.
  - Two enabled agents, one healthy + one unhealthy → `partial`.
  - Two enabled agents, both unhealthy → `degraded`.
  - Any of the above + bootstrap-degraded components → still respects healthy→partial downgrade rule but never escalates past `partial`.
  - Safe-mode flag → `safe-mode` regardless of agent state.

## TDD Requirements

**Strict TDD — no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation.
2. **Verify failure**: Run tests, confirm they FAIL (red).
3. **Minimal implementation**: Write just enough code to pass.
4. **Verify pass**: Run tests, confirm they PASS (green).
5. **Refactor**: Clean up, keep tests green.
6. **No skipping**: Never write implementation without failing test first.

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

### ⬜ Unit 0: Mapping survey
**What**: Read all current consumers of `DaemonHealthState.status` and the `degradedComponents[]` rollup. Build a map (in `./2026-04-28-1930-doing-layer-1-rollup-vocabulary/status-callsites.md`) of every read/write of these values.
**Files to grep**: `src/heart/daemon/daemon-entry.ts`, `daemon-health.ts`, `inner-status.ts`, `startup-tui.ts`, `cli-exec.ts`, `cli-render.ts`, `daemon-cli.ts`, plus any test under `src/__tests__/heart/daemon/`.
**Output**: `status-callsites.md` listing each file:line, what it reads or writes, and the proposed new-vocabulary value at that site.
**Acceptance**: Map is complete; every site is accounted for. No "unknown — TBD" items.

### ⬜ Unit 1a: Type definition — Tests
**What**: Write failing tests for the new `DaemonStatus` union type and a type guard `isDaemonStatus(value: unknown): value is DaemonStatus`. Tests in `src/__tests__/heart/daemon/daemon-health-status.test.ts` (new file).
**Acceptance**: Tests exist and FAIL (red). Test cases include: each of the five literals validates, junk strings fail, undefined/null fail.

### ⬜ Unit 1b: Type definition — Implementation
**What**: Add `export type DaemonStatus = "healthy" | "partial" | "degraded" | "safe-mode" | "down"` to `src/heart/daemon/daemon-health.ts`. Add `isDaemonStatus` guard. Update `DaemonHealthState.status` to type `DaemonStatus`.
**Acceptance**: Tests PASS (green). `tsc --noEmit` clean.

### ⬜ Unit 1c: Type definition — Coverage & refactor
**What**: Verify coverage is 100% for the new type/guard. Refactor if needed.
**Acceptance**: Coverage report shows 100% for new lines. Tests still green.

### ⬜ Unit 2a: Rollup function — Tests
**What**: Write failing tests for `computeDaemonRollup(input: { agents: AgentLiveCheckResult[]; bootstrapDegraded: DegradedComponent[]; safeMode: boolean }): DaemonStatus`. Tests in `src/__tests__/heart/daemon/daemon-rollup.test.ts` (new file). Cover every row of the rollup state table above + every edge case from "Code Coverage Requirements".
**Acceptance**: Tests exist and FAIL (red). All eight+ canonical scenarios from the edge-case list are present.

### ⬜ Unit 2b: Rollup function — Implementation
**What**: Implement `computeDaemonRollup` in `src/heart/daemon/daemon-rollup.ts` (new file). Place it next to `daemon-health.ts`. Pure function — no I/O, no side effects, deterministic on inputs.
**Acceptance**: Tests PASS (green). Function is < ~50 lines (rollup is genuinely a small decision tree).

### ⬜ Unit 2c: Rollup function — Coverage & refactor
**What**: Verify 100% branch coverage on the rollup function. Refactor for readability if needed.
**Acceptance**: Coverage 100%. Tests green. No mutation observed (function is pure).

### ⬜ Unit 3a: Wire rollup into `daemon-entry.ts` — Tests
**What**: Write failing integration tests that boot the daemon (test-level, not subprocess) with seeded agent inventory and assert the rolled-up status reflects the new vocabulary. Place in `src/__tests__/heart/daemon/daemon-entry-rollup.test.ts` (new file). Use `serpentguide-bootstrap.test.ts` as structural precedent.
**Coverage targets**:
- Boot with two healthy agents → status `"healthy"`.
- Boot with one healthy + one whose live-check fails → status `"partial"`.
- Boot with all live-checks failing → status `"degraded"`.
- Boot with bootstrap-degraded component (e.g., recordable failure) but agents healthy → status `"partial"` (downgrade rule).
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 3b: Wire rollup into `daemon-entry.ts` — Implementation
**What**:
- In `buildDaemonHealthState()` at `daemon-entry.ts:143-181`, replace the literal `status: degraded.length > 0 ? "degraded" : "ok"` at line 164 with a call to `computeDaemonRollup({ snapshots, bootstrapDegraded: degradedComponents, safeMode: ... })`.
- Keep `recordRecoverableBootstrapFailure` (line 183-217) as-is — it still records into `degradedComponents[]`; only the rollup interpretation changes.
- Keep `agentDegradedComponents` derivation as-is — `computeDaemonRollup` reads `snapshots` directly and applies its own logic.
- Note: today's rollup includes both bootstrap-degraded and agent-snapshot-derived entries in the unified `degraded[]` field of `DaemonHealthState`. Preserve that field for backwards-compatible inspection (consumers may still read it). The `status` field is what changes meaning.
**Acceptance**: Tests from 3a now PASS (green). Existing daemon-bootstrap tests (`serpentguide-bootstrap.test.ts` and similar) still pass.

### ⬜ Unit 3c: Wire rollup into `daemon-entry.ts` — Coverage & refactor
**What**: Verify coverage on the changed rollup code path. Run full test suite.
**Acceptance**: 100% coverage on changed lines. All tests green.

### ⬜ Unit 4a: Update consumers (`inner-status.ts`, `startup-tui.ts`) — Tests
**What**: Write failing tests that render each of the five rollup states via `inner-status.ts` and `startup-tui.ts` and assert the visible label / emoji / color is appropriate. Place tests in `src/__tests__/heart/daemon/inner-status-vocabulary.test.ts` and `src/__tests__/heart/daemon/startup-tui-vocabulary.test.ts` (new files).
**Acceptance**: Tests exist and FAIL (red). All five states are exercised in each consumer.

### ⬜ Unit 4b: Update consumers — Implementation
**What**: Update render switch / mapping logic in `inner-status.ts` and `startup-tui.ts`. New affordances:
- `healthy` — green / OK label (existing healthy convention).
- `partial` — yellow / warning label (NEW; replace today's incorrect "degraded" rendering for this case).
- `degraded` — red / failure label (kept; semantics narrowed to "zero serving").
- `safe-mode` — distinct red+lock affordance (existing).
- `down` — red+stop affordance (existing or close to it).
**Acceptance**: Tests from 4a PASS (green).

### ⬜ Unit 4c: Update consumers — Coverage & refactor
**What**: Verify 100% coverage on touched render paths.
**Acceptance**: Coverage 100%. Tests green.

### ⬜ Unit 5: Sweep remaining call sites
**What**: Walk the `status-callsites.md` map from Unit 0. For every call site not yet updated, update it to the new vocabulary. Most are reads (display only) — confirm each renders correctly. Any string-literal writes outside `daemon-entry.ts` / `computeDaemonRollup` are rule violations — file a follow-up issue and fix in this PR if trivial.
**Acceptance**: Every entry in `status-callsites.md` is checked off. `grep -rn '"running"\|"degraded"\|"healthy"' src/heart/daemon/ src/heart/cli/` produces only references through the type system or in tests.

### ⬜ Unit 6: Full-suite green + PR description
**What**:
- Run full test suite (`npm test` or repo-equivalent). All green.
- Run typecheck (`tsc --noEmit`). Clean.
- Run linter. No new warnings.
- Draft `./2026-04-28-1930-doing-layer-1-rollup-vocabulary/pr-description.md` per worker's `pr-surface-hygiene` conventions: summary of the vocabulary change, the rollup state table, the no-loop-redesign disclaimer, and a "next: layer 4 builds on this" pointer.
**Acceptance**: Suite green. Typecheck clean. Lint clean. PR description drafted in artifacts directory.

## Execution
- TDD strictly enforced — tests → red → implement → green → refactor.
- Commit after each phase (1a, 1b, 1c, 2a, 2b, 2c, ...).
- Push after each unit completes.
- Run full test suite before marking unit done.
- All artifacts (status-callsites map, PR description) saved to `./2026-04-28-1930-doing-layer-1-rollup-vocabulary/`.
- Fixes / blockers: spawn sub-agent immediately — don't ask, just do it.
- Decisions made: update this doc immediately, commit right away.

## Reference: load-bearing source paths

- `src/heart/daemon/daemon-health.ts` (lines 30-40 for `DaemonHealthState`)
- `src/heart/daemon/daemon-entry.ts:143-181` (`buildDaemonHealthState` — the rollup writer; line 164 is the literal `status: degraded.length > 0 ? "degraded" : "ok"` that this PR replaces)
- `src/heart/daemon/daemon-entry.ts:141` (`degradedComponents[]` declaration)
- `src/heart/daemon/daemon-entry.ts:183-217` (`recordRecoverableBootstrapFailure` — DO NOT MODIFY, only the rollup interpretation of its output changes)
- `src/heart/daemon/cli-exec.ts:287` (per-agent live-check loop — DO NOT MODIFY in this PR)
- `src/heart/daemon/inner-status.ts` (consumer)
- `src/heart/daemon/startup-tui.ts` (consumer)
- `src/heart/daemon/safe-mode.ts` (existing crash-loop semantics; surfaces as new `safe-mode` rollup state)
- `src/heart/daemon/agent-discovery.ts` (`listEnabledBundleAgents` — read-only here; relevant because rollup needs the enabled-agent count)
- `src/__tests__/heart/daemon/serpentguide-bootstrap.test.ts` (precedent for daemon-bootstrap test shape)

## Progress Log
- 2026-04-28 19:30 UTC Created from planning doc as PR 1 of 4 in the sequential rollout (1 → 4 → 2 → 3).
