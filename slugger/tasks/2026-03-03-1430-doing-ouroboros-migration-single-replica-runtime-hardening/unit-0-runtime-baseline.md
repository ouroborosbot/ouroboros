# Unit 0 Runtime Baseline Matrix (2026-03-03)

## Scope
Baseline for single-replica runtime hardening against current code state before implementation.

## Contract Matrix

| Area | Current Behavior | Target Behavior | Primary Code Touchpoints | Planned Test Touchpoints |
|---|---|---|---|---|
| Remote tool posture | `getToolsForChannel()` always includes base tools, including `shell`, `read_file`, `write_file`, `git_commit`, and `gh_cli`, for both CLI and Teams channels. | Remote channels must not expose local CLI/file/git/gh tools. Remote requests attempting local operations must get explicit multi-user safety denial guidance + alternative path. | `src/repertoire/tools.ts`, `src/repertoire/tools-base.ts`, `src/mind/context/channel.ts`, `src/heart/core.ts`, `src/senses/teams.ts` | `src/__tests__/repertoire/tools.test.ts`, `src/__tests__/heart/core.test.ts`, `src/__tests__/senses/teams.test.ts` |
| Denial UX contract | Current failures are generic (`unknown tool`, generic tool errors) and do not consistently explain remote multi-user safety rationale. | Consistent denial text for blocked remote local-tool operations with explanation and safe next actions. | `src/repertoire/tools.ts`, `src/heart/core.ts`, `src/wardrobe/format.ts` | `src/__tests__/repertoire/tools.test.ts`, `src/__tests__/heart/core.test.ts`, `src/__tests__/wardrobe/format.test.ts` |
| Logging sink request-path behavior | Nerves file sink uses `appendFileSync`; prompt/config/session paths also use sync file I/O. Sink failures are partially tolerated but hot-path writes are synchronous. | Request path remains responsive under sink pressure/failure; logging persistence path is non-blocking with safe fallback and no turn-fatal sink exceptions. | `src/nerves/index.ts`, `src/nerves/runtime.ts`, `src/config.ts`, `src/mind/prompt.ts`, `src/mind/context.ts` | `src/__tests__/nerves/logger.test.ts`, `src/__tests__/nerves/sinks.test.ts`, `src/__tests__/mind/prompt.test.ts`, `src/__tests__/config.test.ts` |
| Prompt rebuild safety | `runAgent()` refreshes system prompt each turn via `buildSystem(...)`; freshness is high but no explicit contract checks for degraded I/O behavior and prompt/tool consistency constraints. | Explicitly validated prompt-path contract: freshness preserved, degraded I/O handled safely, prompt/tool consistency checks enforced. | `src/heart/core.ts`, `src/mind/prompt.ts`, `src/repertoire/tools.ts` | `src/__tests__/heart/core.test.ts`, `src/__tests__/mind/prompt.test.ts` |
| Concurrency guardrails | Teams has per-conversation serialization (`withConversationLock`) but no explicit global in-flight cap/backpressure policy for single-replica preview. | Enforced global guardrails with deterministic overflow behavior (backpressure/denial), validated by tests. | `src/senses/teams.ts`, `src/heart/core.ts` | `src/__tests__/senses/teams.test.ts`, `src/__tests__/heart/core.test.ts` |
| SLO/load validation contract | No explicit runtime hardening artifact for 10-conversation SLO gates. | Machine-readable load-validation output + CI gate that fails when SLO/hardening contract regresses. | `scripts/`, `.github/workflows/coverage.yml`, `src/nerves/coverage/*` (or adjacent hardening gate script location) | `src/__tests__/nerves/coverage-*.test.ts` + script contract tests |

## Locked Inputs for This Task
- Concurrency target: 10 simultaneous remote conversations per replica.
- SLO contract:
  - p95 first-feedback <= 2s (all turns)
  - p95 final <= 9s (simple no-tool turns)
  - p95 final <= 30s (tool/external turns)
  - error rate < 1%
- Remote safety policy: local CLI/file/git/gh tools blocked in remote channels, with explanatory denial + alternatives.

## Notes
- Topic text predates recent repo shifts (`observability` -> `nerves`, `channels` -> `senses`, `engine` -> `heart`), and this matrix resolves those drifts before execution.
- This baseline intentionally separates runtime hardening from provider/daemon feature expansion.
