# Unit 0 Inventory Lock

## Scope Baseline
Generated from `git diff --name-status main..HEAD` on branch `slugger/single-replica-hardening-cleanup`.

## Disposition Table

| Path | Disposition | Rationale |
|---|---|---|
| `package.json` | remove (partial) | remove synthetic runtime-hardening script entries only; preserve all other scripts |
| `scripts/run-coverage-gate.cjs` | remove (partial) | remove synthetic runtime-hardening wiring only; preserve core coverage + nerves flow |
| `scripts/run-runtime-hardening-load-validation.cjs` | remove | synthetic scaffold with deterministic placeholder values |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening.md` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/final-audit.md` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-0-runtime-baseline.md` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-1a-red-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-1b-build-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-1b-test-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-1c-build-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-1c-coverage-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-2a-red-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-2b-build-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-2b-test-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-2c-build-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-2c-coverage-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-3a-red-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-3b-build-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-3b-test-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-3c-build-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-3c-coverage-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4a-red-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4b-build-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4b-gate-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4b-load-validation.md` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4b-test-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4c-build-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4c-coverage-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4c-hardening-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4c-test-run.txt` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-1430-planning-ouroboros-migration-single-replica-runtime-hardening.md` | keep | task audit trail must be retained |
| `slugger/tasks/2026-03-03-2036-doing-ouroboros-migration-single-replica-hardening-cleanup.md` | keep | current execution source-of-truth |
| `slugger/tasks/2026-03-03-2036-planning-ouroboros-migration-single-replica-hardening-cleanup.md` | keep | current planning source-of-truth |
| `src/__tests__/heart/core.test.ts` | keep | validates retained prompt-refresh runtime hardening behavior |
| `src/__tests__/nerves/non-blocking-sinks.test.ts` | keep | validates retained non-blocking sink runtime behavior |
| `src/__tests__/nerves/runtime-hardening-ci-contract.test.ts` | remove | synthetic gate contract test; no longer desired |
| `src/__tests__/nerves/runtime-hardening-cli-main.test.ts` | remove | synthetic gate CLI test; no longer desired |
| `src/__tests__/nerves/runtime-hardening-cli.test.ts` | remove | synthetic gate CLI test; no longer desired |
| `src/__tests__/nerves/runtime-hardening-gate.test.ts` | remove | synthetic gate evaluator test; no longer desired |
| `src/__tests__/nerves/sinks.test.ts` | keep | validates retained sink behavior |
| `src/__tests__/repertoire/tools-remote-safety.test.ts` | keep | validates retained remote local-tool blocking behavior |
| `src/__tests__/repertoire/tools.test.ts` | keep | validates retained tool behavior changes |
| `src/__tests__/senses/teams.test.ts` | keep | validates retained concurrency-cap behavior |
| `src/config.ts` | keep | runtime config for retained concurrency cap |
| `src/heart/core.ts` | keep | retained runtime prompt-refresh hardening |
| `src/nerves/index.ts` | keep | retained runtime non-blocking sink hardening |
| `src/nerves/runtime-hardening/cli-main.ts` | remove | synthetic runtime-hardening gate stack |
| `src/nerves/runtime-hardening/cli.ts` | remove | synthetic runtime-hardening gate stack |
| `src/nerves/runtime-hardening/gate.ts` | remove | synthetic runtime-hardening gate stack |
| `src/repertoire/tools.ts` | keep | retained remote local-tool safety hardening |
| `src/senses/teams.ts` | keep | retained runtime concurrency cap hardening |

## Move Decisions
No move actions are approved for this cleanup pass. Any path previously considered "misplaced" in this pass is removed (if synthetic gate stack) or retained in place (if runtime behavior hardening).

## Validation
- Changed-path count in baseline: 51
- Inventory rows above: 51
- `TBD` entries: 0
