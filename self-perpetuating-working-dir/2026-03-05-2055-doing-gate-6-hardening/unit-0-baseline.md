# Unit 0 Baseline: Gate 6 Hardening

## Verified target files
- `src/senses/inner-dialog.ts`
- `src/__tests__/senses/inner-dialog.test.ts`
- `src/governance/convention.ts`
- `src/__tests__/governance/convention.test.ts`

## Baseline behavior (before Gate 6 changes)
- `runInnerDialogTurn()` appends an instinct user message on resumed sessions, but the message only includes:
  - reason
  - cycle count
  - resting state
- Resume prompts do not include explicit checkpoint context about last autonomous work.
- `queryGovernanceConvention()` exposes convention metadata and static guidance but no calibrated classifier helper for proposal summaries.
- Current governance tests validate query payload and unsupported query handling only.

## Gate 6 implementation targets
1. Add checkpoint-aware resume context to resumed inner-dialog instinct prompts.
2. Add calibrated governance classification helper and tests for 5 representative proposals (3 within-bounds, 2 requires-review).
