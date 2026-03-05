# Reflection Proposal: Autonomous reflection/plan/do/merge loop has no preflight safety checks (clean git state, correct branch, required tooling), so it can start from an unsafe repo state and create hard-to-debug failures or accidental changes on the wrong branch.

**Generated:** 2026-03-05T12:49:29.720Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Autonomous reflection/plan/do/merge loop has no preflight safety checks (clean git state, correct branch, required tooling), so it can start from an unsafe repo state and create hard-to-debug failures or accidental changes on the wrong branch.

## Proposal
Add a lightweight “preflight” gate at the start of `src/reflection/autonomous-loop.ts` (and CLI entrypoints) that validates the local environment and git state before any artifacts are written or sub-agents run.

Implementation steps:
1. **Create a preflight module**
   - Add `src/reflection/preflight.ts` exporting `runPreflightOrThrow(opts)` that performs checks and throws a typed error with actionable remediation.
2. **Implement git safety checks (read-only)**
   - Check working tree is clean: `git status --porcelain` must be empty.
   - Check current branch is not `main` (or allowlist configured): `git rev-parse --abbrev-ref HEAD`.
   - Check repo has an `origin` remote (optional but helpful): `git remote get-url origin`.
3. **Implement runtime/tooling checks**
   - Confirm required commands are available (as applicable): `git`, `node`, `npm`, and (if merger stage uses it) `gh`.
   - Validate that `gh auth status` succeeds *only if* the loop is configured to create PRs (don’t hard-require otherwise).
4. **Wire preflight into the loop**
   - In `src/reflection/autonomous-loop.ts`, call `runPreflightOrThrow()` before any stage begins.
   - Add a `--skip-preflight` flag to `src/reflection/loop-entry.ts` for emergency/manual runs (default: preflight on).
5. **Add tests**
   - Add unit tests for preflight parsing/behavior in `src/__tests__/reflection/preflight.test.ts` by mocking shell execution results (no real git needed).
   - Cover: dirty tree, on main branch, missing `gh` when PR stage enabled, happy path.
6. **Documentation**
   - Update `ARCHITECTURE.md` (reflection module section) with the new preflight gate and the skip flag behavior.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
