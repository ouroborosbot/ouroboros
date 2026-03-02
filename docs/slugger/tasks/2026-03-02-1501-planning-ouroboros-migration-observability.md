# Planning: Ouroboros Migration — Observability (Phase 2)

**Status**: NEEDS_REVIEW
**Created**: 2026-03-02 15:01

## Goal
Introduce a structured observability foundation (logger + trace IDs) so turn execution, tool behavior, and key engine/channel events are diagnosable without relying on ad-hoc `console` output.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Add shared observability module under `src/observability/` (logger, trace helpers, factory exports).
- Define structured event shape and log levels for operational events.
- Add trace ID propagation through turn entrypoints and engine execution path.
- Replace selected ad-hoc operational `console.log/error` calls with structured logger events.
- Add tests for logger behavior, trace helpers, and key instrumentation points.
- Ensure test/build/coverage remain green with 100% coverage on new code.

### Out of Scope
- Full daemon log aggregation/retention pipeline and `ouro logs` CLI.
- External telemetry sinks (Datadog, PostHog, etc.).
- Broad instrumentation of modules not touched by this phase (for example, future memory-system events beyond current migration scope).

## Completion Criteria
- [ ] `src/observability/` module exists with reusable logger + trace ID primitives.
- [ ] Engine/channel flow emits structured events for turn lifecycle and error paths.
- [ ] Trace IDs are generated at turn entry and propagated through core execution.
- [ ] Existing ad-hoc operational logging in scoped files is replaced or wrapped by structured logging.
- [ ] Tests cover new observability code and instrumentation behavior.
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
- [ ] Should this phase include file-based logging configuration in `config.ts`, or keep sink/output configuration minimal (stderr only) until daemon work?
- [ ] What is the minimum required instrumentation surface for approval in this phase: channels + core only, or also tools/context/session modules?

## Decisions Made
- This planning doc targets migration sequence item #2: Observability.
- The completed testing-strategy planning/doing task is treated as predecessor and baseline.
- Logging/output contract for this phase is channel-agnostic: user-facing content stays in channel-native output paths (CLI stdout, Teams APIs, etc.), while structured operational diagnostics flow through the observability path (stderr sink in this phase).

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/implementation-order.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/observability.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/channels/cli.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/channels/teams.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/engine/core.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md`

## Notes
Current codebase still uses ad-hoc `console` logging in channel and entrypoint code; this phase should establish a consistent structured baseline without overreaching into daemon-level ops plumbing.

## Progress Log
- [2026-03-02 15:01] Created
- [PENDING_Q1_TS] Resolved Open Question #1 with cross-channel output vs observability contract
