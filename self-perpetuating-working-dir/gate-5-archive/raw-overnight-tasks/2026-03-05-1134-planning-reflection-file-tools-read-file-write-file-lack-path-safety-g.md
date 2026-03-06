# Reflection Proposal: File tools (`read_file`/`write_file`) lack path-safety guards, allowing path traversal or writes outside the repo (including sensitive areas like `.git/`)

**Generated:** 2026-03-05T11:34:26.192Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
File tools (`read_file`/`write_file`) lack path-safety guards, allowing path traversal or writes outside the repo (including sensitive areas like `.git/`)

## Proposal
Add a repo-root “path sandbox” for filesystem tools so `read_file`/`write_file` can only access safe, intended paths, preventing `../` traversal, absolute-path escapes, and writes into sensitive directories (e.g. `.git`). This is a focused security + reliability hardening that doesn’t require changes to heart/mind architecture.

Implementation steps:
1. **Locate tool implementations**
   - Identify where `read_file` and `write_file` are implemented (likely `src/repertoire/tools-base.ts` per ARCHITECTURE.md).

2. **Introduce a shared path guard utility**
   - Create a helper (e.g. `src/repertoire/path-guard.ts` or a local helper in `tools-base.ts`) that:
     - Resolves requested paths against a computed repo root (e.g. `process.cwd()` or an existing repo-root helper if present).
     - Rejects:
       - Absolute paths (unless they resolve inside repo root)
       - Any path that resolves outside repo root (classic `../` traversal)
       - Paths containing null bytes
       - Writes targeting `.git/**` (and optionally a small denylist like `.env`, key files, etc.)
     - Returns the normalized, safe absolute path to use for I/O.

3. **Apply guard to tool handlers**
   - Update `read_file`:
     - Enforce “must be within repo root” (but allow reading files like `CONSTITUTION.md` since reading is allowed).
   - Update `write_file`:
     - Enforce “within repo root”
     - Deny writes to `.git/**`
     - (Optional but recommended) deny writes to `CONSTITUTION.md` to reduce accidental violations, returning a clear error message.

4. **Add targeted unit tests**
   - Add tests under `src/__tests__/repertoire/` to cover:
     - Allowed: `ouroboros/psyche/IDENTITY.md`, `src/somefile.ts` (write to temp test file under repo)
     - Denied: `../outside.txt`, `/etc/passwd` (or platform-appropriate absolute path), `.git/config`
     - Ensure error messages are deterministic and helpful (“Path escapes repository root”, “Writes to .git are not allowed”, etc.)

5. **Run full checks**
   - `npx tsc`
   - test suite + coverage gate

6. **Commit**
   - Single commit with a message like: `Harden file tools with repo-root path sandbox + tests`

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
