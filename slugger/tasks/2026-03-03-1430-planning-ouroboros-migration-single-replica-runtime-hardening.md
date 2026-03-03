# Planning: Ouroboros Migration — Single-Replica Runtime Hardening

**Status**: NEEDS_REVIEW
**Created**: 2026-03-03 14:30

## Goal
Define and lock runtime hardening requirements for single-replica preview so request-path behavior remains non-blocking and resilient under concurrent real-world usage.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Define enforceable non-blocking expectations for request-path I/O in current single-replica runtime.
- Define preview-safe tool-surface posture (remote-first and explicit guardrails for risky local blocking tools).
- Define single-instance concurrency guardrails (in-flight limits, queue/backpressure posture, timeout posture).
- Define load-validation expectations and user-visible success thresholds for preview readiness.
- Define system-prompt rebuild safety constraints for prompt freshness, cache behavior, and prompt/tool consistency.
- Define concrete integration boundaries with later topics (#3 Provider Abstraction, #4 Task System, #11 Daemon/Gateway, #17 Coding Agent Orchestration) without implementing those topics.
- Add CI-verifiable checks/tests for any hardening behaviors introduced in this phase.

### Out of Scope
- Implementing daemon/gateway production lifecycle behavior.
- Designing multi-replica distributed coordination.
- Provider-specific performance optimization work.
- Feature expansion unrelated to runtime resilience for preview.

## Completion Criteria
- [ ] Runtime hardening contract is implemented for single-replica preview and applied to active request-path code.
- [ ] Request-path logging and persistence sinks are non-blocking in practice for expected preview concurrency.
- [ ] Tool-surface runtime posture is enforced according to agreed preview policy.
- [ ] Concurrency guardrails (limits/timeouts/backpressure behavior) are implemented and covered by tests.
- [ ] System-prompt rebuild path has explicit safety behavior (freshness + consistency) covered by tests.
- [ ] Load-validation artifacts exist and demonstrate agreed preview-readiness thresholds are met.
- [ ] CI gate fails when runtime-hardening contract checks regress.
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
- [ ] What exact concurrent-active-user target should single-replica preview commit to?
- [ ] Should preview enforce strict remote-tools-only mode, or permit a narrow local-tool allowlist?
- [ ] What user-visible SLO language should we enforce for preview responsiveness and error-rate posture?

## Decisions Made
- This planning doc targets the current top backlog priority from the migration dashboard: #18 Single-Replica Runtime Hardening.
- Planning must stay focused on runtime resilience and avoid scope creep into full production orchestration.
- Configuration changes for this task must follow repo policy: no environment variables; use explicit in-repo defaults/CLI args/contracts.

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/single-replica-runtime-hardening.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/implementation-order.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/mind/prompt.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/senses/cli.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/senses/teams.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/repertoire/tools.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/nerves/sinks.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/.github/workflows/coverage.yml`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md`

## Notes
Initial draft carries forward the three explicit open questions from the migration topic; execution should not start until they are resolved in this planning doc.

## Progress Log
- [2026-03-03 14:30] Created
