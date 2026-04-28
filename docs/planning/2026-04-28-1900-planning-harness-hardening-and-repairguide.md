# Planning: Four-Layer Hardening of the Daemon Agent-Loading Path + RepairGuide Library Bundle

**Status**: drafting
**Created**: 2026-04-28 19:14 UTC
**Ideation**: ./2026-04-28-1830-ideation-harness-hardening-and-repair-agent.md

## Goal

Make the ouroboros daemon's `ouro up` path resilient to a single bad agent bundle. Today, one sick agent (slugger-shaped: bootstrap drift + expired creds + 404 remote + dirty tree) tips the entire harness into a degraded rollup, even though the per-agent live-check loop already isolates the failure. Replace that overloaded rollup with explicit per-agent semantics, add sync probing and intent/state drift detection so the daemon emits richer per-agent diagnostics, and ship a `RepairGuide.ouro/` library bundle whose `psyche/` + `skills/` content drives the existing agentic-repair pipeline toward structured action proposals — without RepairGuide ever appearing as a peer agent.

## Scope

### In Scope

**Layer 1 — rollup semantics (not loop redesign)**
- Replace today's overloaded "degraded" daemon-wide signal with the five-state rollup defined in locked decision #7 (`healthy`, `partial`, `degraded`, `safe-mode`, `down`).
- Fix the rollup logic that today promotes any non-empty `degradedComponents[]` (set in `daemon-entry.ts:183-217`'s `recordRecoverableBootstrapFailure`) into a daemon-scope "degraded" status.
- Per-agent live-check loop in `cli-exec.ts:287` is already try/catch-isolated — leave it alone. The change is in how its output is rolled up.
- Update `DaemonHealthState.status` (`daemon-health.ts:30-40`) and the consumers that read it (`inner-status.ts`, `startup-tui.ts`) to use the new vocabulary.

**Layer 2 — pre-up sync probe**
- Wire the existing `preTurnPull` from `src/heart/sync.ts` into `ouro up`'s per-agent loop, gated on each bundle's `sync.enabled: true` (read from `agent-discovery.ts`'s `listBundleSyncRows`).
- Run the sync probe BEFORE per-agent live-checks, so live-check reads the post-pull `agent.json` if a pull succeeded.
- Surface (do not crash) on: 404 remote, no network, dirty working tree, non-fast-forward, merge conflict, auth failure (distinguished from genuine 404).
- Hard timeout on every `git fetch`/`git pull` invocation (concrete value is open question O1).
- Never touch `state/` (gitignored, per-machine).

**Layer 3 — `RepairGuide.ouro/` library bundle (NOT a real agent)**
- Sibling directory to `SerpentGuide.ouro/` at the repo root. Same shape: ships with the repo, has `agent.json` with `enabled: false`, contains markdown content under `psyche/` and `skills/`.
- Loaded as a *content source* by the existing `src/heart/daemon/agentic-repair.ts` pipeline. The pipeline already does one-shot LLM diagnostics during `ouro up` and already solves the chicken-and-egg via `discoverWorkingProvider()` — RepairGuide content rides in on top of that pipeline.
- RepairGuide must NOT be picked up by `agent-discovery.ts` as a regular agent. Concretely: confirmed absent from `listEnabledBundleAgents`, `ouro status`, daemon process spawn, and the `degraded[]` rollup. Mechanism is open question O3 (filter by `enabled: false` like SerpentGuide does today, or stronger "library bundle never instantiated" signal).
- RepairGuide's outputs flow through the existing typed `RepairAction` catalog in `readiness-repair.ts` (`vault-unlock`, `provider-auth`, `provider-use`, etc.). v1 introduces NO new action kinds.
- v1 has zero tool surface for the LLM. The persona produces structured proposals; the harness validates each against the typed catalog; unknown kinds drop with a warning. Fallback path on unparseable output: today's text-blob behavior in `agentic-repair.ts`.

**Layer 3a — remove `~/AgentBundles/` override fallback for library bundles**
- Modify `getSpecialistIdentitySourceDir()` in `src/heart/hatch/hatch-specialist.ts` to remove the `~/AgentBundles/SerpentGuide.ouro/` override path. In-repo is the only source.
- Apply the same constraint for RepairGuide: there is no override path; RepairGuide is read from in-repo only.
- Operator confirms no local override exists today, so removal is a clean drop, not a migration.

**Layer 4 — provider-binding drift detection**
- Use the half-built `EffectiveProviderReadiness.reason: "provider-model-changed"` signal in `src/heart/provider-binding-resolver.ts`.
- On every boot, compare each agent's `agent.json` intended provider/model (legacy `humanFacing`/`agentFacing`, mapped to `outward`/`inner` via `normalizeProviderLane`) against per-machine `state/providers.json` actual binding.
- On mismatch, surface a warning + offer a one-line repair proposal using the existing `ouro use --agent X --lane Y --provider Z --model M` surface.
- Read side tolerates legacy `humanFacing`/`agentFacing` keys; write side emits `outward`/`inner`.

**Cross-cutting**
- Hard timeout/time-bound semantics on every external operation in `ouro up` (`git fetch`, `git pull`, provider live-checks). Concrete values resolved via open question O1.
- Test fixture reproducing slugger-shaped compound failure (bootstrap drift + expired cred + 404 remote + dirty tree). Pattern follows `src/__tests__/heart/daemon/serpentguide-bootstrap.test.ts`.

### Out of Scope

- Promoting RepairGuide to a real agent bundle with vault, sync, providers, or `ouro status` presence. (Ideator's "v2 path" is a future conversation, not this task.)
- Auto-applying any repair. v1 is propose-then-confirm only. `--auto-repair` is explicitly deferred.
- Inventing new `RepairAction` kinds beyond what `readiness-repair.ts` already declares.
- Healing 404 remotes by guessing a new URL. RepairGuide proposes either "disable sync" or "ask the operator for the correct URL."
- Healing `state/` from `agent.json` automatically. RepairGuide proposes the `ouro use` command; the existing typed-action runners apply it after operator confirmation.
- A new TUI surface for repair. Re-use `interactive-repair.ts` / `terminal-ui.ts`.
- Cross-machine sync of RepairGuide content (it ships with the repo; no per-machine drift surface on it).
- Memory-of-declined-repairs across boots (ideator open question 7). Defer; revisit if the post-fix UX is noisy.
- Replacing `safe-mode.ts` or its crash-loop semantics. The new `safe-mode` rollup state is the existing concept, surfaced through the new vocabulary.
- Writes to `state/` from harness code outside the per-bundle rules already in place (notably: layer 2 must NOT write `state/providers.json` even if drift detection proposes a fix).

## Completion Criteria

- [ ] Slugger-shaped fixture (bootstrap drift + expired cred + 404 remote + dirty tree) processed by `ouro up`:
  - daemon rolls up to `partial` (other agents healthy), NOT `degraded`
  - slugger marked with structured per-agent diagnostics covering all four findings
  - RepairGuide-driven proposals emitted via existing `RepairAction` catalog
  - dirty tree surfaced as advisory, not blocker
- [ ] A second healthy agent in the same fixture comes up `healthy` with no per-agent degraded marker.
- [ ] `ouro up --no-repair` skips the RepairGuide-driven proposal step, surfaces structured per-agent diagnostics, exits 0.
- [ ] Existing `agentic-repair` text-blob fallback still works when the model returns unparseable output.
- [ ] RepairGuide does NOT appear in `ouro status`, `listEnabledBundleAgents`, or `degraded[]` regardless of its own internal state.
- [ ] `~/AgentBundles/SerpentGuide.ouro/` override path removed; `getSpecialistIdentitySourceDir()` returns only the in-repo path.
- [ ] Layer 4 drift detection surfaces a `provider-model-changed`-flavored proposal for the slugger fixture's `agent.json` vs `state/providers.json` mismatch, with a copy-pasteable `ouro use` command.
- [ ] Hard timeouts on every external `ouro up` operation (git ops, live-checks); no observed boot hang in the fixture even with simulated slow remote.
- [ ] Five-state rollup vocabulary (`healthy` / `partial` / `degraded` / `safe-mode` / `down`) appears in `DaemonHealthState`, `inner-status.ts`, and `startup-tui.ts`. No remaining call sites use the old single-bit "degraded" semantic for the daemon-wide status.
- [ ] 100% test coverage on all new code.
- [ ] All tests pass.
- [ ] No warnings.

## Code Coverage Requirements

**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code.
- All branches covered (sync classification taxonomy, rollup state transitions, drift comparison branches, RepairGuide-vs-agent-discovery filter).
- All error paths tested (timeout, 404 vs auth-failed, unparseable LLM output, missing `state/providers.json`, missing `RepairGuide.ouro/`).
- Edge cases: zero enabled agents (rollup → `degraded`?), one enabled agent that's healthy (rollup → `healthy`), some healthy + some failing (rollup → `partial`), legacy `humanFacing`/`agentFacing` field names on read, empty `psyche/` or `skills/` directories in RepairGuide, `state/providers.json` absent.

## Open Questions

- [ ] **O1: Concrete timeout values.** What are the time bounds on `git fetch`, `git pull`, and provider live-checks during `ouro up`? Need numbers (seconds), not vibes. Slugger's 404 remote case must time out cleanly; healthy remotes on slow connections must not false-positive. Suggest decision: `git fetch`/`git pull` 8s soft / 15s hard; live-check 10s. Operator to confirm or override.
- [ ] **O2: RepairGuide skill enumeration.** What lives in `RepairGuide.ouro/psyche/` (identity / orientation content) vs `RepairGuide.ouro/skills/` (named recipes)? Ideator suggested skills like `diagnose-bootstrap-drift.md`, `diagnose-broken-remote.md`, `diagnose-vault-expired.md`, `diagnose-stacked-typed-issues.md`. Operator to confirm initial skill list and naming convention.
- [ ] **O3: How is RepairGuide excluded from agent discovery?** Two options: (a) reuse SerpentGuide's `enabled: false` filter — works today but is implicit ("library bundles happen to be disabled"); (b) stronger explicit signal in `agent.json` like `"kind": "library"` or a sibling marker file. (b) is more honest about intent; (a) is zero-net-new-mechanism. Operator to choose.
- [ ] **O4: Activation contract — when does layers 1/2/4 hand off to layer 3?** Sync-only? Live-check failures? Drift only? All three? Ideator recommended: layer 3 activates when `untypedDegraded.length > 0` OR any agent has ≥2 typed issues stacked. Operator to confirm or override the trigger condition.
- [ ] **O5: v1 vs v2 scope split — what stays in v1 of the bundle?** The bundle decision (locked #4) supersedes the ideator's recommendation of an in-repo `repair-persona.ts` + `.md` prompt file. Confirm: v1 ships `RepairGuide.ouro/{agent.json, psyche/, skills/}` + a loader in `agentic-repair.ts` that reads them. No `repair-persona.ts` standalone module unless needed for parsing/validation. Operator to confirm.
- [ ] **O6: Test strategy — fixture realism.** `serpentguide-bootstrap.test.ts` is the precedent. The slugger fixture needs: (a) bundle on disk with bootstrap drift, (b) mocked vault state with expired credential revision, (c) mocked git remote returning 404, (d) dirty working tree. Operator to confirm: build a single integration test fixture, or one fixture per condition + one compound? Recommend compound as primary acceptance signal + per-condition unit tests for classification logic.
- [ ] **O7: Single PR or multiple PRs?** The four layers are coupled (rollup vocabulary touches everything; layer 3 consumes layers 1/2/4 outputs) but could ship sequentially: layer 1 (rollup) → layer 2 (sync probe) → layer 4 (drift) → layer 3 (RepairGuide). Sequential ships value earlier and reduces review surface; single PR avoids intermediate states where the rollup vocabulary is half-migrated. Operator to choose. Recommend sequential with hard ordering: 1 → 4 → 2 → 3 (rollup first; drift before sync because drift is read-only and sync mutates working tree; RepairGuide last because it consumes the others).
- [ ] **O8: Layer 3a removal — any test fixture that exercises the `~/AgentBundles/` override path?** Need to verify before removal. If a test asserts the override is honored, that test changes too. Operator to confirm grep is clean.

## Decisions Made

(Operator + ouroboros joint sign-off; carried forward as locked. Listed for traceability — do not re-open.)

- **All four layers in scope** (no slicing of layers).
- **Layer 1 is a rollup fix, not a loop redesign.** The per-agent live-check loop in `cli-exec.ts:287` is already try/catch-isolated. The bug is in how its output rolls up.
- **Layer 2 wires `preTurnPull` from `src/heart/sync.ts` into `ouro up`** for bundles with `sync.enabled: true`. Surface-don't-crash on 404 / no-network / dirty / non-FF / conflict. Never touch `state/`.
- **Layer 3 ships `RepairGuide.ouro/` as a library bundle.** Sibling to `SerpentGuide.ouro/`. Loaded as content into `agentic-repair.ts`. NOT a real agent — no senses, vault, providers, sync, or `ouro status` presence.
- **Layer 3a removes the `~/AgentBundles/` override path** in `getSpecialistIdentitySourceDir()`. In-repo is the only source. Applies symmetrically to RepairGuide.
- **Layer 4 uses `EffectiveProviderReadiness.reason: "provider-model-changed"`** for drift detection, comparing `agent.json` intent vs `state/providers.json` observed.
- **Five-state rollup**: `healthy` / `partial` / `degraded` / `safe-mode` / `down`. `degraded` now means *zero enabled agents serving* (not "any agent is unhealthy").
- **Source-of-truth model**: `agent.json` = intent (committed, portable). `state/providers.json` = observed/cache (gitignored, per-machine).
- **Hard timeouts on every external op in `ouro up`** are non-negotiable (concrete values are O1).

## Context / References

**Existing repair scaffolding**
- `src/heart/daemon/agentic-repair.ts` — one-shot LLM diagnostic call during `ouro up`. Already gated on `discoverWorkingProvider()` and operator opt-in. Output is currently a text blob between `--- AI Diagnosis ---` markers. RepairGuide content rides INTO this pipeline.
- `src/heart/daemon/readiness-repair.ts` — typed `AgentReadinessIssue` / `RepairAction` catalog. Action kinds: `vault-create`, `vault-unlock`, `vault-replace`, `vault-recover`, `provider-auth`, `provider-retry`, `provider-use`. Layer 3 emits through this; no new kinds in v1.
- `src/heart/daemon/interactive-repair.ts` — propose-then-confirm UI surface for repair flows.
- `src/heart/daemon/safe-mode.ts` — crash-loop detection (3 in 5 minutes). Bypass via `ouro up --force`. Becomes the `safe-mode` rollup state.
- `src/heart/daemon/agent-config-check.ts` — `checkAgentConfigWithProviderHealth`: reads `agent.json`, validates provider/model strings, runs live ping. Drift detection (layer 4) hooks in here.

**Per-agent loop and rollup**
- `src/heart/daemon/cli-exec.ts:287` — per-agent live-check loop, already try/catch isolated. NOT the bug site.
- `src/heart/daemon/daemon-entry.ts:183-217` — `recordRecoverableBootstrapFailure` writes into `degradedComponents[]`. The current overloaded rollup reads this and promotes to daemon-wide degraded.
- `src/heart/daemon/daemon-health.ts:30-40` — `DaemonHealthState` already has separated `status`, `degraded[]`, `agents[]` fields. Structure for the new five-state rollup is already there; rename + repopulate.
- `src/heart/daemon/inner-status.ts`, `startup-tui.ts` — consumers of the daemon status string. Update to render new vocabulary.
- `src/heart/daemon/agent-discovery.ts` — `listEnabledBundleAgents`, `listBundleSyncRows`. RepairGuide must not appear in the former.

**Sync surfaces**
- `src/heart/sync.ts` — `preTurnPull` already exists, currently called only from per-turn agent path. Layer 2 wires it into `ouro up`. `PendingSyncRecord` schema (lines 20-25) has `classification: "push_rejected" | "pull_rebase_conflict" | "unknown"` — layer 2 may need to extend this taxonomy (auth-failed, not-found-404, network-down, dirty-working-tree, non-fast-forward, merge-conflict).
- `src/heart/sync.ts:44-63` — `collectRebaseConflictFiles` is a working primitive for conflict-file enumeration.

**Drift signal**
- `src/heart/provider-binding-resolver.ts` — `EffectiveProviderReadiness.reason` enum already includes `provider-model-changed` and `credential-revision-changed`. Layer 4 reads, doesn't invent.
- `normalizeProviderLane` — accepts both legacy `humanFacing`/`agentFacing` and new `outward`/`inner`. Read side must tolerate both; write side emits new names.

**Library bundle precedent (SerpentGuide)**
- `SerpentGuide.ouro/agent.json` — `"enabled": false`, includes `humanFacing`/`agentFacing` provider config (legacy keys), `phrases` and `identityPhrases` blocks. This IS a library bundle today; the operator has confirmed it's the model for RepairGuide.
- `SerpentGuide.ouro/psyche/{SOUL.md, identities/}` — current shape. RepairGuide adds `skills/` (which SerpentGuide doesn't have).
- `src/heart/hatch/hatch-specialist.ts:21-31` — `getSpecialistIdentitySourceDir()` and `getRepoSpecialistIdentitiesDir()`. Layer 3a removes the `userSource` (homedir) branch from `getSpecialistIdentitySourceDir`.
- `src/__tests__/heart/daemon/serpentguide-bootstrap.test.ts` — precedent for bundle-bootstrap tests; pattern for the slugger fixture.

**Existing flags and escape hatches**
- `--no-repair` — skips repair. RepairGuide must honor this.
- `--force` — bypasses safe-mode crash-loop check. RepairGuide ignores; `--force` is about crash-loop, not repair.

**Architecture rules**
- `state/` is gitignored, per-machine runtime cache. Never touched by sync. `agent.json` is committed intent.
- Repo-root `skills/` is shared across all agents (per `ARCHITECTURE.md:337-338`). Bundle-local `skills/` is agent-specific. RepairGuide's `skills/` is bundle-local.

## Notes

**Per-machine adoption boundary.** Layer 4 drift detection is the only place we read `state/providers.json` cross-bundle during `ouro up`. The proposed repair (`ouro use --agent X --lane Y --provider Z --model M`) intentionally writes through the existing CLI surface — no direct write to `state/` from new code. This preserves the source-of-truth model.

**Why RepairGuide content load is into `agentic-repair.ts`, not parallel.** The chicken-and-egg is already solved there: when provider config IS the failure, `discoverWorkingProvider()` finds a working provider for the diagnostic call. Loading RepairGuide content into a fresh pipeline would re-invent that solution, badly. The minimal change is "agentic-repair.ts reads RepairGuide.ouro/{psyche,skills}/*.md as system-prompt-shaped content before its existing LLM call."

**Why not v2 (real agent bundle) now.** A real agent bundle gets vault, providers, sync, identity, daemon presence, drift risk, and a slot in `degraded[]` — all things the operator does NOT want for repair-time content. The library-bundle shape is the right shape because it lets us ship `psyche/` + `skills/` content WITH the repo (visible in PR diffs, version-controlled) without paying the agent-runtime tax.

**Recursion base case (RepairGuide self-failure).** Because RepairGuide is a library bundle (not an agent), it can't fail in the agent-runtime sense. It can only fail in two ways: (a) markdown content malformed/missing (graceful: agentic-repair.ts uses today's text-blob fallback); (b) the LLM call itself fails (graceful: `discoverWorkingProvider` already handles this and the typed-action repair fires anyway). No new recursion handling needed.

**Lane rename in flight.** `humanFacing`/`agentFacing` → `outward`/`inner`. Layer 4 read side must tolerate both. Write side (the `ouro use` command we propose, not new write code) already emits new names.

**Slugger fixture as the canonical regression guard.** The compound case is the test that proves the four layers compose correctly. Per-condition unit tests are useful but the integration fixture is the operative acceptance signal.

**Slugger as the artifact we're protecting against.** The bundle has all three drift surfaces simultaneously (intent, observed binding, vault revision). Layer 4 detects the intent-vs-observed gap. Vault revision drift is already detected (`credential-revision-changed`). Sync can't fix `state/` drift — that's by design.

## Progress Log

- 2026-04-28 19:14 UTC Created from ideation handoff (locked decisions + 8 open questions surfaced)
