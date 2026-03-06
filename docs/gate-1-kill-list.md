# Gate 1 Kill List and Migration Checklist

Purpose: record what is already dead, what must remain, and what will be refactored as Phase 1 continues.

## Already Removed (Gate 0 baseline)

- `src/reflection/autonomous-loop.ts`
- `src/reflection/loop-entry.ts`
- `src/reflection/reflect-entry.ts`
- `src/reflection/trigger.ts`
- `src/__tests__/reflection/autonomous-loop.test.ts`
- `src/__tests__/reflection/trigger.test.ts`

These paths no longer exist on `main` after Gate 0 cleanup.

## Keep and Refactor (Gate 2-3 targets)

- `src/heart/core.ts`
  - Keep core turn engine.
  - Refactor toward model-driven toolkit orchestration.
- `src/heart/turn-coordinator.ts`
  - Keep as concurrency/session coordination base.
- `src/senses/cli.ts`
  - Keep as interactive runtime entry point.
  - Reuse for inner-dialog execution model.
- `src/mind/context.ts`
  - Keep session persistence primitives (`saveSession`, `loadSession`, `postTurn`).
- `src/config.ts`
  - Keep runtime config loading.
  - Extend for bundle/governance loading paths without env-var policy regressions.
- `src/identity.ts`
  - Keep identity source-of-truth semantics.
  - Update bundle-root resolution in Gate 2 migration work.

## New Scaffolding Added in Gate 1

- `src/harness/primitives.ts` and `src/harness/index.ts` (tool/bootstrap/governance interfaces)
- `src/governance/loader.ts` (shared governance loader stub)
- `ouroboros.ouro/` and `slugger.ouro/` (structure-only bundle skeletons)

## Migration Checklist

- [ ] Keep reflection pipeline removed (no reintroduction of `src/reflection/*` orchestration).
- [ ] Wire bootstrap sequence through `src/harness` interfaces.
- [ ] Route governance doc loading through `src/governance/loader.ts`.
- [ ] Migrate active agent roots to `.ouro` bundle homes in Gate 2.
- [ ] Preserve test coverage and compile cleanliness after each refactor.
