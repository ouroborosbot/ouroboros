# Unit 4b Load Validation + CI Wiring

## Contract Added
- Load-validation artifact: `runtime-hardening-load-validation.json`
- Runtime-hardening summary: `runtime-hardening-summary.json`
- Coverage-gate summary now includes `runtime_hardening` status and merges typed required actions.

## Typed Required Action Types
- `artifact`
- `capacity`
- `latency`
- `reliability`

## SLO Thresholds Enforced
- `target_concurrency >= 10`
- `first_feedback_p95_ms <= 2000`
- `simple_turn_final_p95_ms <= 9000`
- `tool_turn_final_p95_ms <= 30000`
- `error_rate < 0.01`

## CI Integration
- Added npm script: `audit:runtime-hardening`
- Added npm script: `validate:runtime-hardening:load`
- `scripts/run-coverage-gate.cjs` now:
  1. creates runtime-hardening load-validation artifact
  2. runs nerves audit
  3. runs runtime-hardening audit
  4. fails overall gate if any of: code coverage, nerves coverage, runtime hardening fail

## Validation Evidence (Unit 4b)
- `unit-4b-test-run.txt`: full test suite green
- `unit-4b-build-run.txt`: TypeScript build green
- `unit-4b-gate-run.txt`: coverage gate includes runtime-hardening audit + summary fields

## Example Run Artifacts
- `/Users/arimendelow/.agentconfigs/test-runs/ouroboros-agent-harness/2026-03-03T23-12-32-631Z/runtime-hardening-load-validation.json`
- `/Users/arimendelow/.agentconfigs/test-runs/ouroboros-agent-harness/2026-03-03T23-12-32-631Z/runtime-hardening-summary.json`
- `/Users/arimendelow/.agentconfigs/test-runs/ouroboros-agent-harness/2026-03-03T23-12-32-631Z/coverage-gate-summary.json`
