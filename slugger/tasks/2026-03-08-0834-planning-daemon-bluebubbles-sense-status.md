# Planning: Daemon-Managed Senses And BlueBubbles Status

**Status**: drafting
**Created**: pending

## Goal
Make the daemon own Slugger's external senses, including BlueBubbles, so `ouro up` brings them up and `ouro status` reports a channel-first sense grid instead of only background worker processes.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Add daemon-managed sense lifecycle for Slugger's externally hosted senses, including BlueBubbles.
- Extend daemon/status reporting so `ouro status` shows per-sense state in a grid similar in spirit to `openclaw status`.
- Add the Slugger config needed to enable BlueBubbles under the daemon, with credentials living in `~/.agentsecrets/slugger/secrets.json`.
- Treat `~/.openclaw` as a one-time migration source for existing BlueBubbles values, not as a live runtime dependency.
- Preserve truthful status semantics by distinguishing the inner-dialog worker from externally reachable senses.

### Out of Scope
- Reworking the already-merged BlueBubbles sense behavior itself.
- Adding new BlueBubbles product features beyond daemon bring-up, config wiring, and status visibility.
- General daemon redesign unrelated to sense lifecycle and status reporting.
- Changing where provider credentials live.

## Completion Criteria
- [ ] `ouro up` starts Slugger's configured senses, including BlueBubbles, through the daemon path.
- [ ] `ouro status` includes a per-sense status grid with enough detail to show enabled state, runtime state, and relevant endpoint/detail for each sense.
- [ ] Slugger's config supports daemon-managed sense enablement without reading live runtime values from `~/.openclaw`.
- [ ] Existing daemon-managed worker status remains visible and is not mislabeled as an external sense.
- [ ] BlueBubbles secrets remain sourced from `~/.agentsecrets/slugger/secrets.json`.
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
- [ ] What exact agent config shape should declare daemon-managed senses for Slugger: a new `senses` block in agent config, reuse of existing top-level fields, or daemon-local discovery only?
- [ ] Should `ouro status` show only daemon-managed senses, or also include configured-but-disabled senses for visibility?
- [ ] What temporary agent-bundle location is active during your parallel first-run testing, and does this task need any runtime path accommodation beyond keeping secrets in `~/.agentsecrets`?

## Decisions Made
- This work is owned on a `slugger/...` branch.
- BlueBubbles credentials should stay in `~/.agentsecrets/slugger/secrets.json`.
- Existing BlueBubbles values may be copied from `~/.openclaw`, but `~/.openclaw` should not become a runtime dependency.
- `ouro up` / `ouro status` are the daemon UX surfaces this task must improve.

## Context / References
- Current daemon CLI parsing and `ouro up` / `ouro status`: `/Users/arimendelow/Projects/ouroboros-agent-harness-daemon-status/src/heart/daemon/daemon-cli.ts`
- Current daemon status payload and summary formatting: `/Users/arimendelow/Projects/ouroboros-agent-harness-daemon-status/src/heart/daemon/daemon.ts`
- Current managed-process model: `/Users/arimendelow/Projects/ouroboros-agent-harness-daemon-status/src/heart/daemon/process-manager.ts`
- Current daemon bootstrap list: `/Users/arimendelow/Projects/ouroboros-agent-harness-daemon-status/src/heart/daemon/daemon-entry.ts`
- Managed background worker entrypoint: `/Users/arimendelow/Projects/ouroboros-agent-harness-daemon-status/src/heart/agent-entry.ts`
- BlueBubbles runtime config getters/defaults: `/Users/arimendelow/Projects/ouroboros-agent-harness-daemon-status/src/heart/config.ts`
- Agent bundle + secrets path resolution: `/Users/arimendelow/Projects/ouroboros-agent-harness-daemon-status/src/heart/identity.ts`
- Reference UX target: local `openclaw status` output observed on March 8, 2026, especially its Channels table

## Notes
Current daemon status is process-first, not sense-first. It reports `name/channel/status/pid/restarts`, but the `channel` field currently reflects the inner-dialog worker label rather than a true external sense. Planning and implementation should avoid presenting misleading sense state.

## Progress Log
- pending Created
