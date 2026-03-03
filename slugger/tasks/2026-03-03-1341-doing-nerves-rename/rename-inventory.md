# Nerves Rename Inventory

## Active Rename Targets (In Scope)

### Runtime module tree
- `src/observability/`
  - `index.ts`
  - `runtime.ts`
  - `coverage/audit.ts`
  - `coverage/cli.ts`
  - `coverage/cli-main.ts`
  - `coverage/contract.ts`
  - `coverage/run-artifacts.ts`

### Test module tree
- `src/__tests__/observability/`
  - `coverage-audit.test.ts`
  - `coverage-cli.test.ts`
  - `coverage-contract.test.ts`
  - `coverage-run-artifacts.test.ts`
  - `global-capture.ts`
  - `logger.test.ts`
  - `runtime.test.ts`
  - `sinks.test.ts`
  - `trace.test.ts`

### Import paths referencing old namespace
- Runtime imports in active code currently reference `./observability/*` or `../observability/*` from:
  - `src/config.ts`, `src/identity.ts`
  - `src/heart/*`, `src/mind/*`, `src/repertoire/*`, `src/senses/*`, `src/wardrobe/*`
- Test mocks/imports currently reference `../observability/*` or `../../observability/*` from:
  - `src/__tests__/config.test.ts`, `src/__tests__/identity.test.ts`
  - `src/__tests__/heart/*.test.ts`, `src/__tests__/mind/*.test.ts`
  - `src/__tests__/repertoire/*.test.ts`, `src/__tests__/senses/*.test.ts`
  - `src/__tests__/wardrobe/*.test.ts`

### Command and pipeline surface
- `package.json`
  - rename script key `audit:observability` -> `audit:nerves`
  - update dist entry `dist/observability/coverage/cli-main.js` -> `dist/nerves/coverage/cli-main.js`
- `scripts/run-coverage-gate.cjs`
  - update invoked npm script name `audit:observability` -> `audit:nerves`
  - update artifact filename `observability-coverage.json` -> `nerves-coverage.json` (and related variable names)
  - update fallback required action target/reason text to `nerves-audit` terminology
- `src/observability/coverage/cli.ts`
  - update default output filename `observability-coverage.json` -> `nerves-coverage.json`
  - update console messaging to `nerves audit` wording

### Active documentation/contract touchpoints
- Current task docs under `slugger/tasks/2026-03-03-1341-*` should track renamed command/path names where they assert active workflow behavior.

## Historical References (Out of Scope to Rewrite)
- Prior completed task records under:
  - `slugger/tasks/2026-03-02-1501-*`
  - `ouroboros/tasks/*` historical migration logs
- These remain as historical audit trail unless a path is materially incorrect for current execution.

## Notes
- Event schema and event names are behaviorally preserved for this task.
- The rename is structural/terminology-focused: module namespace, command surface, and active docs.
