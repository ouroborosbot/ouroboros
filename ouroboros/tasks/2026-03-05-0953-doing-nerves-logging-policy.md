# Doing: Nerves Logging Policy Enforcement

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-05 09:56
**Planning**: ./2026-03-05-0953-planning-nerves-logging-policy.md
**Artifacts**: ./2026-03-05-0953-doing-nerves-logging-policy/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Enforce the console-to-nerves migration with an ESLint `no-console` rule so new `console.*` calls cannot be introduced, annotate the 8 legitimate exception sites, and document the logging policy in AGENTS.md and CONTRIBUTING.md.

## Completion Criteria
- [ ] ESLint installed and configured with `no-console: "error"` for `src/**/*.ts` (excluding tests)
- [ ] All 8 exception sites annotated with correct category and reason
- [ ] `npm run lint` passes cleanly (zero violations)
- [ ] `npm run lint` integrated into `scripts/run-coverage-gate.cjs`
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

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

### ⬜ Unit 1: Install ESLint and create config
**What**: Install `eslint` and `typescript-eslint` as devDependencies. Create `eslint.config.js` (flat config) with `no-console: "error"` scoped to `src/**/*.ts`, explicitly excluding `src/__tests__/**` from the no-console rule. Add `"lint": "eslint src/"` script to `package.json`.
**Output**: `eslint.config.js` created, `package.json` updated with eslint deps and lint script
**Acceptance**: `npx eslint --print-config src/identity.ts` shows `no-console: "error"`; `npx eslint --print-config src/__tests__/somefile.ts` does NOT show `no-console: "error"` (or shows "off")

### ⬜ Unit 2: Annotate exception sites
**What**: Add `// eslint-disable-next-line no-console -- <category>: <reason>` above each of the 8 legitimate console.* calls:
- `src/cli-entry.ts:9` -- `// eslint-disable-next-line no-console -- pre-boot guard: --agent check before imports`
- `src/teams-entry.ts:9` -- `// eslint-disable-next-line no-console -- pre-boot guard: --agent check before imports`
- `src/senses/cli.ts:377` -- `// eslint-disable-next-line no-console -- terminal UX: startup banner`
- `src/senses/cli.ts:420` -- `// eslint-disable-next-line no-console -- terminal UX: session cleared`
- `src/senses/cli.ts:424` -- `// eslint-disable-next-line no-console -- terminal UX: command dispatch result`
- `src/senses/cli.ts:474` -- `// eslint-disable-next-line no-console -- terminal UX: goodbye`
- `src/nerves/coverage/cli.ts:34` -- `// eslint-disable-next-line no-console -- meta-tooling: audit error message`
- `src/nerves/coverage/cli.ts:49` -- `// eslint-disable-next-line no-console -- meta-tooling: audit result message`
**Output**: 4 files updated with 8 disable comments total
**Acceptance**: `npm run lint` passes with zero violations

### ⬜ Unit 3: Integrate lint into coverage gate
**What**: Add `npm run lint` as a step in `scripts/run-coverage-gate.cjs`, running before vitest. If lint fails, the gate fails with a `type: "lint"` required action.
**Output**: Updated `scripts/run-coverage-gate.cjs`
**Acceptance**: `npm run test:coverage` runs lint as part of the gate; lint failure causes gate failure

### ⬜ Unit 4: Document logging policy
**What**: Add "Logging Policy" section to `AGENTS.md` (after Git Discipline) covering: all runtime logging uses `emitNervesEvent()`, three exception categories, disable-line annotation format, new events must register in REQUIRED_EVENTS. Add brief mention in `CONTRIBUTING.md` under Code section.
**Output**: Updated `AGENTS.md` and `CONTRIBUTING.md`
**Acceptance**: Both files contain logging policy content; policy matches the three categories and annotation format

### ⬜ Unit 5: Final verification
**What**: Run `npm run lint` and `npm test` to verify everything passes end-to-end. Run `npm run test:coverage` to verify the full gate (including lint integration).
**Output**: Clean lint, passing tests, passing coverage gate
**Acceptance**: All three commands exit 0 with no errors or warnings

## Execution
- **TDD strictly enforced**: tests first then implement then refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-05-0953-doing-nerves-logging-policy/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-05 09:56 Created from planning doc
- 2026-03-05 09:57 All 4 conversion passes complete, READY_FOR_EXECUTION
