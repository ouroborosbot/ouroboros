# Planning: Hands-On Fix Round And Post-Fix Validation

**Status**: drafting
**Created**: 2026-03-06 15:05

## Goal
Resolve the core UX and runtime-contract gaps found during live hands-on testing, then run a focused validation pass to confirm the deeper subsystems from yesterday are understandable and usable.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Fix inner-dialog continuity contract so interactive chat can reliably answer questions about autonomous work using existing session artifacts.
- Fix inner-dialog scheduling contract so autonomous cycles are intentional/bounded (not perceived as always-on noise).
- Enforce single-daemon runtime behavior and improve operator visibility of runtime mode/call-source.
- Improve operator-facing output clarity for daemon/CLI status and transient provider errors.
- Run a post-fix validation walkthrough that exercises major subsystems from gates 6-11 without repetitive setup churn.

### Out of Scope
- New persistence artifact types (no new work-journal file format).
- Full product redesign of global install/onboarding (`ouro up`, `ouro hatch`, platform bundle registration) in this round.
- Broad feature expansion beyond gaps already observed in hands-on feedback.

## Completion Criteria
- [ ] Interactive chat can accurately recap recent inner-dialog activity from existing session state.
- [ ] Inner-dialog has explicit bounded scheduling behavior with operator-visible state/cadence.
- [ ] Single-daemon lock/invariant prevents duplicate autonomous loops from orphaned/takeover processes.
- [ ] Daemon/CLI output is human-readable by default for core operator commands; transient errors are actionable.
- [ ] Post-fix validation pass completed across inner-dialog, task, daemon, coding, and memory surfaces with feedback captured.
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
- [ ] Inner-dialog scheduling policy default: fixed heartbeat with quiet windows, event-driven triggers, or hybrid policy?
- [ ] Interactive continuity exposure mode: automatic recap context every turn, explicit on-demand recap command/tool, or both?
- [ ] Single-daemon enforcement mechanism: PID lock file, socket ownership handshake, or combined lock + health check?
- [ ] Which operator commands get concise-default output in this round vs deferred?

## Decisions Made
- Use one cohesive fix round before continuing broad validation of yesterday's build.
- No new journal artifact type; existing on-disk sessions remain source of truth.
- Inner-dialog continuity in conversation is a hard requirement (not optional behavior).
- Inner-dialog should not run continuously without explicit bounded scheduling policy.
- Guidance/validation flow should be a single coherent walkthrough, not repeated setup loops.

## Context / References
- /Users/arimendelow/Projects/ouroboros-agent-harness/self-perpetuating-working-dir/2026-03-06-cli-hands-on-feedback-log.md
- /Users/arimendelow/Projects/ouroboros-agent-harness/src/senses/inner-dialog.ts
- /Users/arimendelow/Projects/ouroboros-agent-harness/src/senses/cli.ts
- /Users/arimendelow/Projects/ouroboros-agent-harness/src/daemon/daemon.ts
- /Users/arimendelow/Projects/ouroboros-agent-harness/src/daemon/daemon-cli.ts
- /Users/arimendelow/Projects/ouroboros-agent-harness/src/coding/manager.ts
- /Users/arimendelow/Projects/ouroboros-agent-harness/src/tasks/index.ts

## Notes
The current confusion appears to come from a mismatch between implemented primitives and operator-visible contracts. This round prioritizes contract clarity and deterministic behavior over adding new capabilities.

## Progress Log
- 2026-03-06 15:05 Created
