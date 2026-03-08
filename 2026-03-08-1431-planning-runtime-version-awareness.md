# Planning: Runtime Version Awareness + Changelog Injection

**Status**: drafting
**Created**: TBD

## Goal
When the ouro runtime (`@ouro.bot/cli`) auto-updates via the `@latest` wrapper, agents should know what changed. Today they wake up with new capabilities and have no idea. This feature adds per-agent version tracking, change detection on startup, and changelog injection into the system prompt so agents naturally discover what's new.

## Scope

### In Scope
- Per-agent runtime version tracking (store last-known version in the agent bundle)
- Change detection on agent startup (compare current vs stored version)
- Structured changelog shipped with the npm package
- Changelog injection into the agent's system prompt on version change
- Update stored version after agent has booted with the update info
- First-boot handling (no previous version stored)

### Out of Scope
- TBD (pending design questions)

## Completion Criteria
- [ ] Runtime version is persisted per-agent in the bundle
- [ ] On startup, version mismatch is detected
- [ ] Relevant changelog entries are injected into the system prompt
- [ ] After boot, the stored version is updated to current
- [ ] First boot (no stored version) is handled gracefully
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
- [ ] Where should `runtime-version.json` live? Bundle root (`~/AgentBundles/MyAgent.ouro/runtime-version.json`)?
- [ ] What format for the changelog? Structured JSON vs markdown?
- [ ] How does the changelog get into the system prompt? New section in `buildSystem()` in `src/mind/prompt.ts`?
- [ ] What does the injection look like from the agent's perspective? First-person voice, part of the runtime section?
- [ ] Should the daemon also be version-aware (detect newer CLI, restart workers)?
- [ ] How do we handle the very first boot (no previous version stored)? Silently store version, or tell the agent its initial version?

## Decisions Made
- (none yet)

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

## Notes
Minimal scratchpad. Implementation details go in doing doc.

## Progress Log
- TBD Created
