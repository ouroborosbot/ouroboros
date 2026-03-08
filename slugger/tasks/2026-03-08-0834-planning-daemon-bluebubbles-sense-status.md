# Planning: Daemon-Managed Senses And BlueBubbles Status

**Status**: NEEDS_REVIEW
**Created**: 2026-03-08 08:35

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
- [ ] What is Slugger's current temporary bundle location for the implementation-time `agent.json` edit?

## Decisions Made
- This work is owned on a `slugger/...` branch.
- BlueBubbles credentials should stay in `~/.agentsecrets/slugger/secrets.json`.
- Existing BlueBubbles values may be copied from `~/.openclaw`, but `~/.openclaw` should not become a runtime dependency.
- `ouro up` / `ouro status` are the daemon UX surfaces this task must improve.
- `agent.json` should gain a `senses` block for daemon-managed sense enablement.
- V1 should use `enabled` only; if a sense is enabled, `ouro up` should bring it up. No separate `autoStart` flag in scope.
- `ouro status` should show the full available-senses list, including disabled senses, so the surface supports discovery and configuration visibility.
- The temporary Slugger bundle move is an implementation-time editing concern, not a reason to add bundle-path configurability to the daemon/runtime.

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
- 2026-03-08 08:35 Created
- 2026-03-08 08:35 Decided to use `agent.json` `senses` enablement without a separate `autoStart` flag
- 2026-03-08 08:35 Decided status should show all available senses, including disabled ones, and kept temporary bundle relocation out of runtime scope
