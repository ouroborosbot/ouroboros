# Planning: Runtime Version Awareness + Changelog Injection

**Status**: drafting
**Created**: 2026-03-08 14:32

## Goal
When the ouro runtime (`@ouro.bot/cli`) auto-updates via the `@latest` wrapper, agents should know what changed. Today they wake up with new capabilities and have no idea. This feature adds per-agent version tracking, change detection on startup, and changelog injection into the system prompt so agents naturally discover what's new.

## Scope

### In Scope
- Holistic versioning strategy across all existing version fields (AgentConfig.version, FriendRecord.schemaVersion, session envelope version, bundle manifest)
- `bundle-meta.json` in bundle root: unified metadata tracking runtime version + bundle schema version + last updated timestamp
- Change detection on agent startup (compare current vs stored runtime version)
- Structured JSON changelog shipped with the npm package
- Changelog injection into the agent's system prompt on version change (AX-first design)
- Update stored version after agent has booted with the update info
- First-boot handling (no previous version stored)
- Add `bundle-meta.json` to `CANONICAL_BUNDLE_MANIFEST`
- Daemon auto-update mechanism: periodic npm registry check, download/install new version, self-restart
- Bundle migration framework (for when runtime updates change bundle structure)

### Out of Scope
- Migrating existing `AgentConfig.version`, `FriendRecord.schemaVersion`, or session `version` fields away (they stay as-is, but the holistic strategy documents how they relate to `bundle-meta.json`)
- Automatic rollback if a new version is broken
- User-facing changelog (web, CLI display) -- agents are the primary consumer

## Completion Criteria
- [ ] `bundle-meta.json` is persisted per-agent in the bundle root with `runtimeVersion`, `bundleSchemaVersion`, `lastUpdated`
- [ ] On startup, version mismatch between current runtime and stored `runtimeVersion` is detected
- [ ] Relevant changelog entries are injected into the system prompt when version changes
- [ ] After boot, `bundle-meta.json` is updated to current runtime version
- [ ] First boot (no `bundle-meta.json`) is handled gracefully
- [ ] Structured JSON changelog is shipped with the npm package
- [ ] Daemon periodically checks npm registry for new `@ouro.bot/cli` versions
- [ ] Daemon auto-installs new version and restarts itself
- [ ] `bundle-meta.json` is added to `CANONICAL_BUNDLE_MANIFEST`
- [ ] Holistic versioning strategy is documented (how bundle-meta.json relates to existing version fields)
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [x] Where should version tracking live? **Decided**: `bundle-meta.json` in bundle root, unified with bundle schema versioning.
- [x] What format for the changelog? **Decided**: Structured JSON.
- [x] Should the daemon be version-aware? **Decided**: Yes -- daemon auto-checks npm registry, installs updates, restarts itself.
- [x] What does the injection look like from the agent's perspective? **Decided**: Hybrid. Runtime version is always a one-liner in the runtime info section. Changelog is a transient section, injected only on first boot after an update, disappears once bundle-meta.json is updated.
- [ ] How do we handle the very first boot (no previous version stored)? Silently store version, or tell the agent its initial version?
- [ ] Daemon auto-update: how does a running Node.js daemon restart itself with a new npm package? What's the mechanism?
- [ ] Changelog granularity: per-feature bullet points? Categorized by type (feature/fix/internal)? What does the agent actually need?
- [ ] Where in the prompt does the transient changelog section go relative to other sections?
- [ ] When exactly is bundle-meta.json updated? After first LLM response? At end of session? Immediately after prompt assembly?

## Decisions Made
- Use `bundle-meta.json` in bundle root instead of `runtime-version.json`. This file tracks both runtime version awareness AND bundle structural version, unifying two concerns: "what runtime last ran this agent" and "is my bundle structure current." Format: `{ runtimeVersion, bundleSchemaVersion, lastUpdated }`. Rationale: existing versioning is fragmented (AgentConfig.version, FriendRecord.schemaVersion, session envelope version, bundle-manifest with no version) and a unified metadata file at the bundle root positions us for future bundle migrations.
- Changelog format: structured JSON shipped with the npm package. Primary consumer is code (prompt assembler extracts version range and formats for agent), not humans.
- Daemon auto-update: daemon periodically checks npm registry for new @ouro.bot/cli versions, installs, and restarts. Human shouldn't need to do anything.
- AX is the top priority: when designing changelog injection, optimize for how the agent experiences "waking up" with a new runtime.
- Hybrid prompt injection: runtime version always visible as one-liner in runtime info section (like knowing your age). Changelog is transient -- only injected on first boot after update, disappears once bundle-meta.json is updated to current version.

## Context / References
- Agent bundles: `~/AgentBundles/{Name}.ouro/`
- System prompt assembly: `src/mind/prompt.ts` (`buildSystem()` function)
- Identity/config: `src/heart/identity.ts` (has `getAgentRoot()`, `getAgentName()`)
- Config: `src/heart/config.ts`
- Daemon CLI: `src/heart/daemon/daemon-cli.ts`
- Current package version: `0.1.0-alpha.12` in `package.json`
- No existing version tracking or `getPackageVersion()` utility in the codebase
- System prompt text must be first-person (agent's own voice)
- No environment variables allowed (hard rule)
- `buildSystem()` assembles sections via array of string-returning functions, filtered and joined
- Bundle manifest: `src/mind/bundle-manifest.ts` -- defines `CANONICAL_BUNDLE_MANIFEST` (file/dir list), has NO version field currently
- Existing versioning: `AgentConfig.version` (agent.json schema), `FriendRecord.schemaVersion` (friend profiles), session envelope `version` (context.ts) -- all at v1, no migrations yet
- `migrationPath` in hatch-flow input exists but is completely unused
- Daemon architecture: `OuroDaemon` class in `src/heart/daemon/daemon.ts` has `start()`, `stop()`, command handler. Uses `DaemonProcessManagerLike` for agent workers, `DaemonSchedulerLike` for cron, `DaemonHealthMonitorLike` for health checks. No existing periodic update mechanism.
- Daemon process manager: `src/heart/daemon/process-manager.ts` -- manages agent worker processes with spawn, backoff, restart. Injects `setTimeoutFn` for testability.
- Health monitor: `src/heart/daemon/health-monitor.ts` -- existing health check infrastructure

## Notes
Minimal scratchpad. Implementation details go in doing doc.

## Progress Log
- 2026-03-08 14:32 Created
- 2026-03-08 14:35 Decided: bundle-meta.json in bundle root (unified runtime + schema versioning)
- 2026-03-08 14:42 Expanded scope: holistic versioning strategy, daemon auto-update, AX-first changelog design, JSON format confirmed
- 2026-03-08 14:44 Decided: hybrid prompt injection -- version always in runtime info, changelog transient on update only
