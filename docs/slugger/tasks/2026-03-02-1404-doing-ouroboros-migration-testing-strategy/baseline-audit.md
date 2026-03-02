# Baseline Audit

## Scope Check Against Unit 0 Acceptance

- [x] Coverage threshold baseline reviewed (`vitest.config.ts`)
- [x] CI coverage gate baseline reviewed (workflows)
- [x] Shared conventions doc location baseline reviewed
- [x] Legacy coverage-gap handling baseline reviewed

## Current State

### 1. Coverage Thresholds (`vitest.config.ts`)

- Coverage provider/reporters are configured.
- Thresholds are **not** configured (`lines|branches|functions|statements` missing).
- Impact: `npm run test:coverage` does not currently fail based on explicit threshold config.

### 2. CI Coverage Gate (`.github/workflows`)

- `.github/workflows` directory is currently absent.
- No CI workflow currently enforces `npm run test:coverage`.
- Impact: coverage enforcement is local-only today.

### 3. Shared Testing Conventions Location

- Decided target path: `docs/cross-agent/testing-conventions.md`.
- File does not yet exist.
- `CONTRIBUTING.md` does not yet link to this path.

### 4. Legacy Coverage Gap Handling

- Doing plan requires red baseline first, then explicit backfill of uncovered paths exposed after threshold enforcement.
- Existing baseline indicates this risk is real once thresholds are added.
- Required execution behavior: capture uncovered files in Unit 1a and close all surfaced gaps in Unit 1b/1c.

## Gap Summary

1. Add explicit 100% thresholds in `vitest.config.ts`.
2. Add CI coverage workflow (`npm run test:coverage`).
3. Create `docs/cross-agent/testing-conventions.md`.
4. Add concise pointer in `CONTRIBUTING.md`.
5. Backfill any legacy uncovered files surfaced by threshold enforcement.
