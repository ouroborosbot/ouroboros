# Gate 3a Baseline Inventory

Generated: 2026-03-05 17:43

## Teardown State
- `src/reflection/` directory: absent
- `src/reflection/autonomous-loop.ts`: absent
- `src/reflection/loop-entry.ts`: absent
- `src/__tests__/reflection/autonomous-loop.test.ts`: absent
- `src/reflection/trigger.ts`: absent

## Package Script State
- `package.json` has no `reflect`, `reflect:dry`, `reflect:loop`, or `reflect:loop:dry` scripts.
- Active scripts are build/dev/auth/test/lint/teams + manifest packaging.

## Current Protocol Loading Behavior
- `src/repertoire/skills.ts` currently reads only from `<agent>.ouro/skills/*.md`.
- No loader path references to `subagents/*.md` or `<agent>.ouro/skills/protocols/*.md`.
- Current behavior gap for Gate 3a: no mirror-first + canonical fallback protocol loading convention.

## Governance Convention Queryability
- `src/harness/primitives.ts` exports `isGovernanceCheckResult()` and `GOVERNANCE_CHECK_RESULTS`.
- Tool registry currently has no dedicated governance-convention query tool.
- Current behavior gap for Gate 3a: expose governance/constitution convention as a queryable tool capability.

## Planned Focus from Baseline
1. Implement dual-source protocol loading with deterministic order and explicit missing-path failures.
2. Add queryable governance convention tool surface to satisfy Gate 3a criterion.
3. Add teardown invariant contracts so Gate 3a criteria are machine-verified.
