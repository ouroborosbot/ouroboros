# Doing: Regression tests for system prompt assembly (src/mind/prompt.ts)

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Prevent silent behavior regressions in system prompt assembly by adding focused regression tests that validate:
- psyche sections are present
- section ordering is stable
- output is deterministic (under controlled time/cwd)
- missing required psyche files fails loudly (clear error)

## Completion Criteria
- [ ] A new regression test suite snapshots (normalized) assembled system prompt output.
- [ ] Tests assert presence + ordering of psyche sections (SOUL → IDENTITY → LORE → FRIENDS → SELF-KNOWLEDGE).
- [ ] `buildSystem()` supports a small test hook to load psyche from a fixture directory (runtime defaults unchanged).
- [ ] Missing required psyche files (SOUL/IDENTITY) results in a clear, deterministic error (no silent partial prompt).
- [ ] Existing prompt tests are updated as needed to match the new contract.
- [ ] All new/changed code has tests.
- [ ] All tests pass.

## Work Units

### ⬜ Unit 1a: Psyche fixtures — add minimal on-disk fixture files
**What**: Create a minimal, deterministic fixture psyche directory used by regression tests.
**Files**:
- `src/__tests__/fixtures/psyche/SOUL.md`
- `src/__tests__/fixtures/psyche/IDENTITY.md`
- `src/__tests__/fixtures/psyche/LORE.md`
- `src/__tests__/fixtures/psyche/FRIENDS.md`
- `src/__tests__/fixtures/psyche/SELF-KNOWLEDGE.md`

**Acceptance**:
- Fixture files exist with unique marker strings (easy to assert ordering/presence).

### ⬜ Unit 1b: Negative fixture — missing required psyche file
**What**: Add a second fixture directory missing a required file to drive a failing test for strict loading.
**Files**:
- `src/__tests__/fixtures/psyche-missing-soul/` (directory)
- `src/__tests__/fixtures/psyche-missing-soul/IDENTITY.md`
- `src/__tests__/fixtures/psyche-missing-soul/LORE.md`
- `src/__tests__/fixtures/psyche-missing-soul/FRIENDS.md`
- `src/__tests__/fixtures/psyche-missing-soul/SELF-KNOWLEDGE.md`
  - (intentionally omit `SOUL.md`)

**Acceptance**:
- Directory exists and intentionally lacks `SOUL.md`.

### ⬜ Unit 2a: Prompt assembly regression suite — Tests (red)
**What**: Add a focused test suite that builds the system prompt using on-disk fixtures and asserts invariants + snapshot.

Key assertions:
- Prompt contains markers for each psyche section.
- Ordering is stable: SOUL marker appears before IDENTITY marker, before `## my lore`, before `## my friends`, before `## self-knowledge`.
- Determinism: with frozen time and normalized cwd line, repeated calls produce identical output.
- Snapshot: normalized prompt matches a stored snapshot.
- Negative: missing `SOUL.md` (fixture) throws a clear error mentioning the missing file.

**Files**:
- `src/__tests__/mind/prompt.assembly-regression.test.ts` (new)

**Notes/Conventions**:
- Freeze time with `vi.useFakeTimers()` + `vi.setSystemTime(new Date("2030-01-02T03:04:05Z"))` so the date section is stable.
- Normalize volatile lines before snapshot (at least `cwd: ...`), e.g. `prompt.replace(/cwd: .*/g, "cwd: <cwd>")`.
- Mock `../../identity` minimally for stable `getAgentName()` and to keep config reads local (avoid touching `~/.agentsecrets`). Point `configPath` to a repo-local test secrets file (create one if needed under fixtures).

**Acceptance**: 
- Tests exist and FAIL (red) due to missing implementation hooks/behavior.

### ⬜ Unit 2b: Update existing prompt tests for new missing-psyche behavior — Tests (red)
**What**: Update the existing test that currently expects missing psyche files to be silently ignored.

**Files**:
- `src/__tests__/mind/prompt.test.ts`

**Acceptance**:
- The old test `"handles missing psyche files gracefully (empty string, no crash)"` is changed to assert the new contract (throws a clear error for missing required psyche files).
- Test suite still fails overall until implementation is updated.

### ⬜ Unit 3a: mind/prompt.ts — Implementation: injectable psycheDir + strict required files (green)
**What**: Implement a small, non-architectural test hook and stricter loading behavior.

Implementation outline:
- Extend `BuildSystemOptions` with an optional `psycheDir?: string`.
- Update psyche loading helpers to use `options.psycheDir` when provided; otherwise default to `path.join(getAgentRoot(), "psyche")`.
- Make `SOUL.md` and `IDENTITY.md` required:
  - If missing/unreadable OR trims to empty, throw `Error` with a message that includes the missing filename(s) and the psyche directory.
- Keep `LORE.md`, `FRIENDS.md`, and `SELF-KNOWLEDGE.md` optional (continue current behavior).
- Update caching to be safe with the new option:
  - Cache must be keyed by psycheDir (e.g. store `{ dir, psyche }`), or reload if `psycheDir` changes.

**Files**:
- `src/mind/prompt.ts`

**Acceptance**:
- Unit 2 tests now PASS (green).
- Runtime behavior unchanged when files exist (default path still `getAgentRoot()/psyche`).

### ⬜ Unit 3b: Snapshot stabilization — Implementation details (green)
**What**: Ensure the snapshot test is stable across machines.

**Approach**:
- Keep normalization in tests (preferred) rather than adding production-only formatting changes.
- If needed, adjust prompt assembly to ensure section separators are consistent (avoid accidental extra whitespace), but do not change content structure unless tests demand it.

**Files**:
- `src/__tests__/mind/prompt.assembly-regression.test.ts`
- (auto-generated) `src/__tests__/mind/__snapshots__/prompt.assembly-regression.test.ts.snap`

**Acceptance**:
- Snapshot file is generated/checked in and stable across environments.

### ⬜ Unit 4: Verification sweep
**What**: Run full typecheck + tests + coverage gate.

**Commands**:
- `npm test`
- `npm run build` (tsc)
- `npm run test:coverage` (ensures 100% thresholds still satisfied)

**Acceptance**:
- All commands succeed locally.

## Progress Log
- 2026-03-05 Created from reflection proposal
