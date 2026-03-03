# Planning: Ouroboros Migration — Single-Replica Runtime Hardening

**Status**: NEEDS_REVIEW
**Created**: 2026-03-03 14:30

## Goal
Define and lock runtime hardening requirements for single-replica preview so request-path behavior remains non-blocking and resilient under concurrent real-world usage.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Re-baseline this topic against the current repository state before execution (topic text predates recent runtime/naming changes).
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
- [ ] Remote channels cannot execute local CLI/file/git/gh tools, and denial UX explains multi-user safety rationale with a clear alternative path.
- [ ] Concurrency guardrails (limits/timeouts/backpressure behavior) are implemented and covered by tests.
- [ ] System-prompt rebuild path has explicit safety behavior (freshness + consistency) covered by tests.
- [ ] Load-validation artifacts exist and demonstrate agreed preview thresholds: 10 concurrent remote conversations, p95 first-feedback <= 2s, p95 final <= 9s for simple no-tool turns, p95 final <= 30s for tool/external turns, and error rate < 1%.
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
- [x] Peak preview concurrency target is locked to 10 simultaneous remote conversations per replica.
- [x] Preview tool policy is locked: remote channels run remote-safe tools only; local CLI/file/git/gh tools are blocked remotely and require explanatory denial messaging.
- [x] Preview SLO contract is locked: p95 first-feedback <= 2s for all turns; p95 final <= 9s for simple no-tool turns; p95 final <= 30s for tool/external turns; error rate < 1%.

## Decisions Made
- This planning doc targets the current top backlog priority from the migration dashboard: #18 Single-Replica Runtime Hardening.
- Planning must stay focused on runtime resilience and avoid scope creep into full production orchestration.
- Configuration changes for this task must follow repo policy: no environment variables; use explicit in-repo defaults/CLI args/contracts.
- Topic assumptions must be validated against the current codebase before implementation details are finalized.
- Remote-channel safety policy is explicit for this phase: no local shell/file/git/gh tool execution from multi-user channels; denial responses must explain why and guide users toward safe alternatives.
- Peak preview concurrency target for hardening validation is 10 simultaneous remote conversations per replica.
- Preview SLO targets are split by turn type to stay strict on UX while remaining realistic for tool/network turns: first-feedback p95 <= 2s (all turns), final p95 <= 9s (simple no-tool), final p95 <= 30s (tool/external), error rate < 1%.

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/single-replica-runtime-hardening.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/implementation-order.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/mind/prompt.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/senses/cli.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/senses/teams.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/repertoire/tools.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/repertoire/tools-base.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/heart/core.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/mind/context/channel.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/nerves/index.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/.github/workflows/coverage.yml`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md`

## Notes
Current-state baseline check (2026-03-03): base tools currently include local shell/file/git/gh and are available across channels unless constrained; request path still includes synchronous file/log operations in prompt/config/log sinks. This task should treat those as hardening targets, not assumptions already solved.

## Progress Log
- [2026-03-03 14:30] Created
- [2026-03-03 14:36] Rebased planning assumptions on current repo state, locked remote tool-safety policy, and clarified unresolved SLO/capacity questions.
- [2026-03-03 14:39] Locked concurrency and SLO contract (10 concurrent conversations with split p95 response targets and <1% error rate).
