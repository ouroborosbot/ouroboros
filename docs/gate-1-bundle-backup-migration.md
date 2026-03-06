# Gate 1 Bundle Backup and `~/AgentBundles` Migration Path

This document defines the staged backup and migration strategy for `.ouro` bundles.

## Current State (Gate 1)

- Bundle skeletons exist in repo root:
  - `ouroboros.ouro/`
  - `slugger.ouro/`
- Existing active roots still include:
  - `ouroboros/`
  - `slugger/`

Gate 1 does not switch runtime roots yet.

## Backup Strategy (Per Bundle)

1. Ensure bundle directory is complete for the gate.
2. Initialize independent git history in the bundle directory if absent:
   - `git init`
3. Add private remote for bundle repo:
   - `git remote add origin git@github.com:<org>/<agent>-bundle.git`
4. Commit bundle snapshot with gate tag in message.
5. Push to private remote branch (default: `main`).

## Migration Target

- Final host path per bundle:
  - `~/AgentBundles/ouroboros.ouro/`
  - `~/AgentBundles/slugger.ouro/`

## Staged Migration Plan

1. Keep bundle directories in monorepo while interfaces/loaders stabilize (Gate 1).
2. In Gate 2, update identity/root resolution to point at `.ouro` directories.
3. Introduce sync/copy flow from repo bundle directories to `~/AgentBundles/<agent>.ouro/`.
4. Verify bootstrap/governance/tool loading works against `~/AgentBundles` paths.
5. Flip runtime defaults to `~/AgentBundles` once parity and tests are green.

## Safety Rules

- No force-push or history rewrite on bundle backup repos.
- Fail fast if remote auth/permissions are missing.
- Keep migration idempotent: rerunning copy/sync must not corrupt bundle state.
- Record migration checkpoints in gate artifacts before switching runtime defaults.
