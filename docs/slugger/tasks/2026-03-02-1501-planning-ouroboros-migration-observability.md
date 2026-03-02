# Planning: Ouroboros Migration — Observability (Phase 2)

**Status**: approved
**Created**: 2026-03-02 15:01

## Goal
Introduce a structured observability foundation (logger + trace IDs) so turn execution, tool behavior, and key engine/channel events are diagnosable without relying on ad-hoc `console` output.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Add shared observability module under `src/observability/` (logger, trace helpers, factory exports).
- Define machine-first NDJSON event schema and configurable `logging.level`.
- Lock required log envelope fields for all structured events: `ts`, `level`, `event`, `trace_id`, `component`, `message`, `meta`.
- Add trace ID propagation through turn entrypoints and engine execution path.
- Instrument runtime paths across `src/` with event-level logging (including channels, engine, mind, clients, config/identity, repertoire, and entrypoints).
- Lock minimum event catalog coverage per component (entrypoints, channels, engine, mind, tools, config/identity, clients, repertoire) for this phase.
- Keep user-facing output in channel-native paths while routing operational diagnostics through logger sinks.
- Add tests for logger behavior, trace helpers, and instrumentation points.
- Ensure test/build/coverage remain green with 100% coverage on new code.

### Out of Scope
- Full daemon log aggregation/retention pipeline and `ouro logs` CLI.
- External telemetry sinks (Datadog, PostHog, etc.).
- Chunk-level content logging and streaming-chunk spam logs.
- Logging sensitive payloads (full user messages, raw tool args/secrets).

## Completion Criteria
- [ ] `src/observability/` module exists with reusable logger + trace ID primitives.
- [ ] NDJSON (`json`) is the canonical log format with configurable `logging.level` and stderr sink for this phase.
- [ ] All structured events use required envelope fields: `ts`, `level`, `event`, `trace_id`, `component`, `message`, `meta`.
- [ ] Runtime paths across `src/` emit event-level structured logs with no chunk-level or sensitive-payload dumps.
- [ ] Minimum component event catalog is implemented and exercised in tests (entrypoints/channels/engine/mind/tools/config/identity/clients/repertoire).
- [ ] Trace IDs are generated at turn entry and propagated through core execution.
- [ ] Existing ad-hoc operational logging in scoped runtime files is replaced or wrapped by structured logging.
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
- [ ] None at this time.

## Decisions Made
- This planning doc targets migration sequence item #2: Observability.
- The completed testing-strategy planning/doing task is treated as predecessor and baseline.
- Logging/output contract for this phase is channel-agnostic: user-facing content stays in channel-native output paths (CLI stdout, Teams APIs, etc.), while structured operational diagnostics flow through the observability path (stderr sink in this phase).
- Logging configuration for this phase is machine-first: NDJSON (`json`) is the canonical output format, `logging.level` is configurable, and sink stays `stderr` only; file-based sinks/rotation are deferred.
- Required instrumentation surface for this phase is full runtime coverage across `src/` with event-level logs (not chunk-level content), while excluding sensitive payload dumps.
- Required structured log envelope for this phase is locked to: `ts`, `level`, `event`, `trace_id`, `component`, `message`, `meta`.
- Minimum required event catalog for this phase is locked by component:
  - entrypoints: `turn.start`, `turn.end`, `turn.error`
  - channels: `channel.message_sent`, `channel.error`
  - engine: `engine.turn_start`, `engine.turn_end`, `engine.error`
  - mind: `mind.step_start`, `mind.step_end`, `mind.error`
  - tools: `tool.start`, `tool.end`, `tool.error`
  - config/identity: `config.load`, `identity.resolve`, `config_identity.error`
  - clients: `client.request_start`, `client.request_end`, `client.error`
  - repertoire: `repertoire.load_start`, `repertoire.load_end`, `repertoire.error`

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/implementation-order.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/observability.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/channels/cli.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/channels/teams.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/engine/core.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md`

## Notes
Current codebase still uses ad-hoc `console` logging in channel and entrypoint code; this phase should establish a consistent structured baseline without overreaching into daemon-level ops plumbing.
Model consumption is primary: logs should be stable, structured, and parseable for behavior analysis and automated verification loops.

## Progress Log
- [2026-03-02 15:01] Created
- [2026-03-02 15:24] Resolved Open Question #1 with cross-channel output vs observability contract
- [2026-03-02 15:32] Resolved Open Question #2 with machine-first json logging config (level configurable, stderr sink only)
- [2026-03-02 15:35] Resolved Open Question #3 with full runtime event-level instrumentation scope
- [2026-03-02 15:37] Consistency pass: aligned Scope/Out of Scope/Completion Criteria with finalized Q1-Q3 decisions
- [2026-03-02 15:48] Locked required log envelope fields and minimum component event catalog to remove interpretation gaps
- [2026-03-02 15:50] Planning approved for conversion to doing doc
