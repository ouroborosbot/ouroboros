# Doing: Add skills registry + validator for markdown skills

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Prevent malformed or duplicated skill markdown files from silently degrading skill listing, tool/skill selection, and prompt assembly by introducing a lightweight skills registry + structural validator. The registry must validate existing skills, enforce uniqueness/determinism, and expose a helper for future tooling—without adding dependencies or changing CI/scripts.

## Completion Criteria
- [ ] `listSkills()` / `list_skills` only surfaces skills that pass minimal structural validation
- [ ] `loadSkill()` validates loaded skill structure and fails loudly (throw) on invalid skill markdown
- [ ] Skills registry returns a structured list of validation errors (file + reason)
- [ ] Stable deterministic ordering of registry output
- [ ] Duplicate skill-name detection is enforced (at least case-insensitive)
- [ ] `validateAllSkills()` helper is exported for future tooling use
- [ ] Documentation describes the minimal required markdown structure for skills
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: Skills registry contract — Tests
**What**: Add unit tests defining the minimal skill contract and validation behavior (parse title, require Purpose section, require non-empty body, uniqueness, stable ordering, structured errors).
**Files**:
- `src/__tests__/repertoire/skills-registry.test.ts` (new)
**Acceptance**: Tests exist and FAIL (red) until registry is implemented.

Test cases to cover (aim for 100% branch coverage):
- Parses `name` from filename (basename without `.md`), and `title` from first `# ...` heading.
- Fails when missing H1 title.
- Fails when missing `## Purpose` section (case-insensitive match allowed).
- Fails when body is empty/whitespace beyond headings.
- Enforces deterministic ordering (sorted by skill name).
- Detects duplicate names (case-insensitive). (Implementation note: in tests, mock `fs.readdirSync` to return duplicated entries to ensure the branch is testable even on case-insensitive filesystems.)
- Returns structured errors: `{ file, skillName?, reason }` (shape asserted).

### ⬜ Unit 1b: Skills registry contract — Implementation
**What**: Implement a small registry module that loads markdown skills, parses required fields, validates structure, and returns validated skills + errors.
**Files**:
- `src/repertoire/skills-registry.ts` (new)
**Acceptance**: Unit 1a tests PASS (green).

Implementation notes (no deps):
- Load `*.md` from a provided directory.
- Stable ordering: sort by skill name (or filename) before reading.
- Parsing rules:
  - `title`: first line matching `/^#\s+(.+)$/m`.
  - `purpose` presence: heading matching `/^##\s+purpose\s*$/im`.
  - `body`: non-empty markdown content (trimmed raw), plus optionally a stricter check such as “content after the H1 is non-empty”.
- Validation output:
  - `skills`: array of `{ name, title, body, filePath }` (include additional fields only if needed).
  - `errors`: array of `{ filePath, skillName, reason }`.
- Duplicate detection:
  - Track `name.toLowerCase()` in a Set; collision → error for both or for the later entry.
- Export helper(s):
  - `loadSkillsRegistry(skillsDir: string): { skills: SkillRecord[]; errors: SkillValidationError[] }`
  - `validateAllSkills(skillsDir: string): SkillValidationError[]`

### ⬜ Unit 2a: Wire registry into existing API — Tests
**What**: Update repertoire skill API tests to reflect validated listing/loading behavior while keeping the public API stable.
**Files**:
- `src/__tests__/repertoire/skills.test.ts`
**Acceptance**: Updated tests exist and FAIL (red) until wiring is implemented.

Test updates/additions:
- `listSkills()` still:
  - returns `[]` when skills dir missing
  - filters non-`.md`
  - returns sorted names
  - **new**: filters out invalid skills (e.g., missing Purpose) and only returns validated ones
- `loadSkill()`:
  - **update** existing “returns skill content” fixture markdown to include a `## Purpose` section
  - **new**: throws (or returns error via tool handler, but `loadSkill()` itself should throw) when a skill is structurally invalid

### ⬜ Unit 2b: Wire registry into existing API — Implementation
**What**: Integrate the registry into `src/repertoire/skills.ts` without changing the exported function signatures.
**Files**:
- `src/repertoire/skills.ts`
**Acceptance**: Unit 2a tests PASS (green).

Wiring behavior:
- `listSkills()`:
  - Use registry results from `getSkillsDir()`.
  - If validation errors exist, emit a `repertoire.error` nerves event with summary metadata (count + sample reasons) and return only the validated skill names.
- `loadSkill(skillName)`:
  - Continue reading `${skillName}.md` as today.
  - Validate the loaded markdown content with the same rules (title + Purpose + non-empty body).
  - On invalid: emit `repertoire.error` and throw an Error that includes the reasons (keeps current tool handler behavior: it will stringify as `error: ...`).
- Preserve loaded skill tracking (`loadedSkills`) semantics.

### ⬜ Unit 3a: Validate real repository skills — Tests
**What**: Add a “golden” test that validates all skills in `ouroboros/skills/` in this repo.
**Files**:
- `src/__tests__/repertoire/skills-existing-files.test.ts` (new)
**Acceptance**: Test exists and FAILS (red) if any checked-in skill file violates the contract.

Test design:
- Do **not** mock `fs`.
- Compute skills directory via `getRepoRoot()` + `path.join(repoRoot, "ouroboros", "skills")` (avoids needing `--agent` in tests).
- Call `validateAllSkills(skillsDir)` and assert it returns `[]`.

### ⬜ Unit 3b: Fix any existing skills that fail validation
**What**: If any existing `ouroboros/skills/*.md` lack a `## Purpose` section or H1 title, update those markdown files to comply.
**Files**:
- `ouroboros/skills/*.md` (as needed)
**Acceptance**: Unit 3a passes with zero errors.

### ⬜ Unit 4a: Documentation — Tests
**What**: Add/update a doc describing the minimal required skill markdown structure.
**Files**:
- `ouroboros/skills/README.md`
**Acceptance**: Doc change exists; (no automated test required).

### ⬜ Unit 4b: Documentation — Implementation
**What**: Update `ouroboros/skills/README.md` to clearly describe required headings/sections.
**Files**:
- `ouroboros/skills/README.md`
**Acceptance**: README includes a concise template, e.g.:

```md
# Skill Title

## Purpose
One or two sentences describing what this skill is for.

## Instructions
...
```

…and notes that missing `#` title or `## Purpose` will fail validation.

## Progress Log
- 2026-03-05 Created from reflection proposal
