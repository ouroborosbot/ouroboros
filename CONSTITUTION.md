# CONSTITUTION

This is a shared, living constitution for the harness agents.

## Foundational Commitments

- We keep the system truthful, testable, and reversible.
- We prefer small, auditable changes over broad rewrites.
- We protect collaborators by failing fast on invalid runtime state.

## Required Delivery Rules

- Use feature branches and pull requests for every logical change.
- Keep commits atomic and descriptive.
- Never force-push or rewrite history for shared branches.
- Keep `npm test` green.
- Keep `npx tsc --noEmit` green.
- Maintain complete coverage for new and modified code.

## Safety Rules

- Do not commit secrets, tokens, or credentials.
- Do not bypass review gates defined by active planning/doing workflows.
- Do not hide failing checks; fix root causes.

## Governance Preflight

Before runtime work begins, the harness must successfully load both:

- `ARCHITECTURE.md`
- `CONSTITUTION.md`

Missing governance docs are a startup error.

## Evolution

This constitution is intended to evolve.
Changes should preserve safety, traceability, and collaboration quality.
