# Doing: Tool registry contract checks (name/schema/handler)

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct

## Objective
Prevent silent breakage in tool execution by adding an automated “tool registry contract” test suite that validates:
- tool name uniqueness/non-emptiness
- tool JSON-schema sanity (description + parameters shape)
- executability (every registered tool resolves to a handler used by the dispatcher)
- (optional but recommended) a stable snapshot of the tool surface area

## Completion Criteria
- [ ] A new contract test suite exists at `src/__tests__/repertoire/tools-registry.contract.test.ts`
- [ ] The canonical tool registry used by `execTool()` is importable by tests (via an explicit export)
- [ ] Contract tests fail with actionable messages for duplicates, schema issues, or unhandled tools
- [ ] Tool surface snapshot (inline snapshot or snapshot file) is in place and stable
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: Tool registry contract — Tests (red)
**What**: Add a focused contract test suite that asserts tool registry integrity.

**Files**:
- `src/__tests__/repertoire/tools-registry.contract.test.ts` (create)

**Test cases (include all below)**:
1. **Uniqueness**
   - Collect tool names from the canonical registry (planned export: `allToolDefinitions` in `src/repertoire/tools.ts`).
   - Assert every name is a non-empty string.
   - Assert all names are unique.
   - On failure, print an actionable duplicates report, e.g.:
     - `Duplicate tool names found: shell (2), graph_query (2)`
     - and/or list the indices/modules if available.

2. **Schema sanity**
   - For each tool definition:
     - `tool.type === "function"`
     - `tool.function.description` is a non-empty string
     - `tool.function.parameters` is a non-null object
     - if `parameters.type === "object"`, then `parameters.properties` exists and is a plain object (not array/null)
     - if `parameters.required` exists, it must be an array of strings
   - Aggregate errors and fail once with a single message listing all offending tools and which checks failed.

3. **Executability / resolvability**
   - For each registered tool name, assert the dispatcher can resolve it to a definition and handler.
   - Planned import surface from `src/repertoire/tools.ts`:
     - `resolveToolDefinition(name)` (or equivalent)
   - Assertions:
     - `resolveToolDefinition(name)` returns a definition
     - `typeof def.handler === "function"`

4. **Tool surface snapshot** (optional but recommended; implement as part of this unit)
   - Snapshot the sorted list of tool names from the canonical registry.
   - Prefer `toMatchInlineSnapshot()` so the snapshot lives in the test file and changes are obvious in PR diffs.

**Acceptance**: New tests exist and FAIL (red) because the canonical registry/resolver exports do not yet exist (or otherwise fail until implementation is added).

### ⬜ Unit 1b: Canonical tool registry export + resolver — Implementation (green)
**What**: Make the contract tests pass by exporting the canonical registry (the same one used by `execTool`) and a resolver function.

**Files**:
- `src/repertoire/tools.ts` (modify)

**Implementation steps**:
- Refactor the combined registry constant to be exportable, e.g.:
  - `export const allToolDefinitions: ToolDefinition[] = [...]`
- Add and export a single resolver that is used by the execution layer:
  - `export function resolveToolDefinition(name: string): ToolDefinition | undefined` which looks up in `allToolDefinitions`.
- Update `isConfirmationRequired()` and `execTool()` to use `resolveToolDefinition()` (single source of truth).

**Acceptance**: All contract tests PASS (green) and `execTool()` behavior remains unchanged.

### ⬜ Unit 2a: Failure-message ergonomics — Tests (red)
**What**: Add targeted tests to ensure failures are actionable (not just “expected true to be false”).

**Files**:
- `src/__tests__/repertoire/tools-registry.contract.test.ts` (modify)

**Test cases**:
- Create a small “bad registry” fixture inside the test (do not mutate the real registry) to verify:
  - duplicate detection output contains the duplicate tool name
  - schema sanity output includes the tool name + which field is invalid (e.g., `parameters.type missing`)

**Acceptance**: Added tests fail until helper/assertion formatting is implemented.

### ⬜ Unit 2b: Failure-message ergonomics — Implementation (green)
**What**: Implement small internal helpers in the contract test file (or a local test util) to produce readable diffs and aggregated error output.

**Files**:
- `src/__tests__/repertoire/tools-registry.contract.test.ts` (modify)

**Acceptance**: Failure-message tests PASS and contract suite outputs clear, actionable diagnostics when intentionally broken.

### ⬜ Unit 3: Run full test suite
**What**: Run the full suite and ensure stability.

**Command**:
- `npm test`

**Acceptance**: Test run passes consistently; snapshot is stable.

### ⬜ Unit 4: Commit
**What**: Commit changes.

**Command**:
- `git status`
- `git commit -m "test(repertoire): add tool registry contract checks"`

**Acceptance**: Commit contains only the intended test + small export/refactor changes.

## Progress Log
- 2026-03-05 Created from reflection proposal
