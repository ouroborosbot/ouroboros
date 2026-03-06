# ARCHITECTURE

This is a shared, living architecture map for the harness and both agents.

## Core Principle

The harness is code the model can use.

- Before: pipeline code called the model as a function.
- After: the model is persistent, and the harness provides tools, context, and runtime support.

## Bootstrap Sequence

Every agent startup follows this order:

1. `bundle` - load `<agent>.ouro/` bundle state.
2. `governance` - load root `ARCHITECTURE.md` and `CONSTITUTION.md`.
3. `psyche` - load the agent's psyche files from `<agent>.ouro/psyche/`.
4. `inner-dialog` - start or resume self-directed runtime session.

## Bundle Layout (Repo-Root During Phase 1)

- `ouroboros.ouro/`
- `slugger.ouro/`

Each bundle contains:

- `agent.json`
- `teams-app/`
- `psyche/`
- `skills/`
- `tasks/`

Bundles are intentionally gitignored in the harness repository and backed up in their own git repositories.

## Shared Protocols

Shared planning/execution protocols live in `subagents/`:

- `work-planner`
- `work-doer`
- `work-merger`

Agent-specific skills live in each bundle under `skills/`.

## Runtime Guardrails

- No history rewrites on protected branches.
- All changes flow through feature branches + PR merge.
- `npm test` and `npx tsc` must pass for merge.
- New code requires complete test coverage.

## Ownership

This document is a shared governance artifact for Ouroboros and Slugger.
It should evolve as the agents gain operational experience.
