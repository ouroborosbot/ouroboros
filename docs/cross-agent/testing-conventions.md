# Cross-Agent Testing Conventions

This document defines mandatory testing conventions shared by all agents working in this repository.

## 1. Coverage Policy (Mandatory)

- Coverage thresholds are enforced at `100` for `lines`, `branches`, `functions`, and `statements` in `vitest.config.ts`.
- Do not lower thresholds.
- New and modified code must maintain 100% coverage.
- If threshold enforcement surfaces uncovered legacy paths, backfill tests in the same workstream before completion.

## 2. Required Commands

Run these before marking implementation work complete:

```bash
npm test
npm run test:coverage
npm run build
```

All three must pass with no warnings.

## 3. TDD Flow (Strict)

1. Write or update tests first.
2. Run tests and confirm failure when introducing new behavior (red).
3. Implement the smallest change to pass tests (green).
4. Refactor while keeping tests green.
5. Re-run coverage and build checks.

Do not bypass red/green validation by writing implementation first.

## 4. Mocking Conventions

- Mock external systems (network, SDK boundaries, filesystem side effects where appropriate).
- Keep tests deterministic; no real network calls.
- Prefer module-level mocks consistent with existing test patterns.
- For configuration-sensitive modules, isolate state between tests.

## 5. CI Coverage Gate Contract

- CI must execute `npm run test:coverage` for pull requests and main-branch integration.
- A coverage threshold failure must fail the CI job.
- Workflow definition lives in `.github/workflows/coverage.yml` unless explicitly replaced by an equivalent single-source workflow.

## 6. Artifact Expectations for Doing Units

Each unit should leave auditable evidence in its task artifacts directory:

- Red/green logs (`*.log`) for test and coverage runs.
- Notes describing decisions, gap analysis, and verification outcomes.
- Final verification checklist mapping completion criteria to evidence.

## 7. Completion Verification Checklist

Before declaring a task complete:

- [ ] All planned units are marked complete in the doing doc.
- [ ] `npm test` passes.
- [ ] `npm run test:coverage` passes.
- [ ] `npm run build` passes.
- [ ] CI workflow gating coverage is present and valid.
- [ ] `CONTRIBUTING.md` links to this document as the detailed testing reference.

## 8. Ownership and Applicability

- This is a shared policy for all agents.
- Agent-specific process details can extend this, but cannot relax these requirements.
