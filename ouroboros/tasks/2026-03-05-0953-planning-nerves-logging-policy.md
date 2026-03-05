# Planning: Nerves Logging Policy Enforcement

**Status**: NEEDS_REVIEW
**Created**: 2026-03-05 09:54

## Goal
Enforce the console-to-nerves migration with an ESLint `no-console` rule so new `console.*` calls cannot be introduced, annotate the 8 legitimate exception sites, and document the logging policy in AGENTS.md and CONTRIBUTING.md.

## Scope

### In Scope
- Install ESLint and `@typescript-eslint/parser` as devDependencies
- Create `eslint.config.js` (flat config) with `no-console: "error"` scoped to `src/**/*.ts`
- Exclude `src/__tests__/**` from the no-console rule (test files are not production code)
- Add `lint` script to package.json (`eslint src/`)
- Annotate 8 legitimate console.* call sites with `// eslint-disable-next-line no-console -- <category>: <reason>`:
  - Pre-boot guard (2 sites): `src/cli-entry.ts:9`, `src/teams-entry.ts:9`
  - Terminal UX (4 sites): `src/senses/cli.ts:377`, `src/senses/cli.ts:420`, `src/senses/cli.ts:424`, `src/senses/cli.ts:474`
  - Meta-tooling (2 sites): `src/nerves/coverage/cli.ts:34`, `src/nerves/coverage/cli.ts:49`
- Add "Logging Policy" section to AGENTS.md covering:
  - All runtime logging uses `emitNervesEvent()`, never raw `console.*`
  - Three categories of legitimate exceptions (pre-boot guard, terminal UX, meta-tooling)
  - Each exception requires `// eslint-disable-next-line no-console -- <category>: <reason>`
  - New events must be registered in `src/nerves/coverage/contract.ts` REQUIRED_EVENTS
- Add brief logging policy mention in CONTRIBUTING.md under the Code section
- Verify `npm run lint` passes with all annotations in place
- Verify `npm test` still passes (ESLint should not interfere with test execution)

### Out of Scope
- Converting any remaining console.* calls (already done on this branch)
- Changes to the nerves runtime or coverage system itself
- Adding ESLint rules beyond no-console (keep config minimal)
- Creating a cross-agent-docs file for logging (keep it simple in AGENTS.md for now)
- CI pipeline changes (lint should be run manually or added to CI in a separate task)

## Completion Criteria
- [ ] ESLint installed and configured with `no-console: "error"` for `src/**/*.ts` (excluding tests)
- [ ] All 8 exception sites annotated with correct category and reason
- [ ] `npm run lint` passes cleanly (zero violations)
- [ ] Logging Policy section added to AGENTS.md
- [ ] Logging policy mention added to CONTRIBUTING.md
- [ ] `npm test` still passes
- [ ] No warnings
- [ ] 100% test coverage on all new code
- [ ] All tests pass

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [ ] Should the `lint` script be added to the existing `test:coverage` gate, or kept as a separate manual step for now?

## Decisions Made
- Use ESLint flat config (`eslint.config.js`) since the project has no existing ESLint setup
- Keep ESLint config minimal (only no-console rule) to avoid scope creep
- Exclude test files from no-console since they are not production code
- Three exception categories: pre-boot guard, terminal UX, meta-tooling (carried from prior planning)

## Context / References
- Prior planning doc: `ouroboros/tasks/2026-03-04-2354-planning-nerves-console-migration.md` (completed)
- Branch: `ouroboros/nerves-console-migration` (console-to-nerves conversions already committed)
- `src/nerves/runtime.ts` -- `emitNervesEvent()` API
- `src/nerves/coverage/contract.ts` -- `REQUIRED_EVENTS` array
- 8 exception sites confirmed at current line numbers via grep

## Notes
No existing ESLint setup in the project. ESLint + parser need to be installed fresh. No console.* calls exist in test files currently, but the exclusion protects future test code.

## Progress Log
- 2026-03-05 09:54 Created
