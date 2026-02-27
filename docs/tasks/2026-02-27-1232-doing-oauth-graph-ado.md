# Doing: OAuth Authentication for Graph API and Azure DevOps API

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-02-27 13:07
**Planning**: ./2026-02-27-1232-planning-oauth-graph-ado.md
**Artifacts**: ./2026-02-27-1232-doing-oauth-graph-ado/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Add OAuth/SSO authentication to the Ouroboros Teams bot so the LLM agent can call Microsoft Graph API and Azure DevOps API on behalf of the user. Two OAuth connections (graph + ado) with on-demand signin, channel-conditional tools (Teams only), error handling, and a harness-level confirmation system for write actions. Delivered in three phases: smoke test, full read tools, write tools + muscle memory.

## Completion Criteria
- [ ] Azure/Entra setup steps documented in `docs/OAUTH-SETUP.md`
- [ ] Manifest includes `webApplicationInfo` with correct structure
- [ ] Two OAuth connection names (`graph`, `ado`) configurable via config.json / env vars
- [ ] ADO organizations configurable as a list in config.json / env vars
- [ ] `graphToken` and `adoToken` available to tool handlers independently
- [ ] All 16 tools defined and functional (10 read, 6 write)
- [ ] Graph/ADO tools only available on Teams channel, not CLI
- [ ] On-demand signin flow works per connection
- [ ] Error handling: 401 triggers re-signin, 403 reports permission denied, 429 reports throttled
- [ ] Harness-level confirmation system blocks all write tools until user confirms
- [ ] Confirmation system enforced in agent loop, state persisted via SDK IStorage
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

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

---

## Phase 1: Smoke Test

### ✅ Unit 1: OAuth Setup Documentation
**What**: Write `docs/OAUTH-SETUP.md` covering the manual Azure/Entra setup steps the user must perform.
**Output**: `docs/OAUTH-SETUP.md` file committed.
**Acceptance**:
- Documents app registration creation/configuration
- Documents exposing an API and adding delegated permissions for Graph scopes (`User.Read`, `Mail.ReadWrite`, `Calendars.ReadWrite`, `Files.ReadWrite.All`, `Chat.Read`, `Sites.ReadWrite.All`) and ADO scopes (`vso.work_write`, `vso.code_write`, `vso.build`)
- Documents pre-authorizing Teams client IDs
- Documents creating two OAuth connection settings on Azure Bot resource (`graph` and `ado`) with their respective token audiences (`https://graph.microsoft.com` and `https://app.vso.com`)
- Documents `webApplicationInfo` manifest addition
- Documents dev tunnel setup for local testing
- Documents required `.env` variables

### ✅ Unit 2: Config Changes
**What**: Add `OAuthConfig` and `AdoConfig` to `src/config.ts` with `getOAuthConfig()` and `getAdoConfig()` functions. (Manifest `webApplicationInfo` already committed separately -- not included here.)
**Output**: Updated `src/config.ts`, new/updated tests in `src/__tests__/engine/config.test.ts`.
**Files modified**: `src/config.ts`
**Files created/updated**: `src/__tests__/engine/config.test.ts` (or existing config test file)

**TDD steps:**
1. Write tests for `getOAuthConfig()` -- returns defaults (`graph`, `ado`), respects env var overrides (`OAUTH_GRAPH_CONNECTION`, `OAUTH_ADO_CONNECTION`)
2. Write tests for `getAdoConfig()` -- returns defaults (empty organizations), respects env var `ADO_ORGANIZATIONS` (comma-separated parsing), respects config.json
3. Run tests, confirm FAIL (red)
4. Implement `OAuthConfig`, `AdoConfig` interfaces, add to `OuroborosConfig`, implement `getOAuthConfig()` and `getAdoConfig()`
5. Run tests, confirm PASS (green)

**Acceptance**:
- `getOAuthConfig()` returns `{ graphConnectionName: "graph", adoConnectionName: "ado" }` by default
- `getOAuthConfig()` respects `OAUTH_GRAPH_CONNECTION` and `OAUTH_ADO_CONNECTION` env vars
- `getAdoConfig()` returns `{ organizations: [] }` by default
- `getAdoConfig()` parses `ADO_ORGANIZATIONS` env var as comma-separated list
- 100% coverage on new config code
- All existing tests still pass

### ⬜ Unit 3: OAuth Plumbing (Vertical Slice)
**What**: Build the entire vertical slice needed for the two smoke-test tools (`graph_profile` and `ado_work_items`) to work end-to-end. This combines ToolContext, channel-conditional tools, core.ts wiring, Teams adapter refactoring, Graph client, ADO client, shared error handling, and the two tool handlers into a single unit.
**Output**: 3 new source files, 3 new test files, 3 modified source files, 3 modified test files (see below).

**Files created:**
- `src/engine/graph-client.ts` -- minimal Graph client with `getProfile(token)`
- `src/engine/ado-client.ts` -- minimal ADO client with `queryWorkItems(token, org, query)`
- `src/engine/api-error.ts` -- shared `handleApiError(response, service, connectionName)` helper
- `src/__tests__/engine/graph-client.test.ts`
- `src/__tests__/engine/ado-client.test.ts`
- `src/__tests__/engine/api-error.test.ts`

**Files modified:**
- `src/engine/tools.ts` -- add `ToolContext` interface, modify `ToolHandler` type, modify `execTool` signature, add `getToolsForChannel(channel)`, add `graphAdoTools` array, add `graph_profile` and `ado_work_items` definitions + handlers, update `summarizeArgs` (line 259)
- `src/engine/core.ts` -- add `toolContext` to `RunAgentOptions`, replace static `tools` with `getToolsForChannel(channel)` on line 187, pass `toolContext` to `execTool` in tool execution loop (lines 306-344, specifically line 328)
- `src/channels/teams.ts` -- refactor `app.on("message")` handler (line 203) to access full `IActivityContext`, fetch both tokens, refactor `handleTeamsMessage` to accept `TeamsMessageContext`, build `ToolContext` and pass to `runAgent`, add `oauth: { defaultConnectionName: "graph" }` to `App` constructor in `startTeamsApp`
- `src/__tests__/engine/tools.test.ts` -- tests for ToolContext, getToolsForChannel, new tool handlers
- `src/__tests__/engine/core.test.ts` -- tests for channel-based tool selection in runAgent, toolContext passthrough
- `src/__tests__/channels/teams.test.ts` -- tests for token threading, TeamsMessageContext, ToolContext construction

**Architectural details:**

_ToolContext interface shape:_
```typescript
interface ToolContext {
  graphToken?: string;
  adoToken?: string;
  signin: (connectionName: string) => Promise<string | undefined>;
  adoOrganizations: string[];
}
```

_core.ts line 187 replacement -- must preserve finalAnswerTool conditional:_
```typescript
// OLD: const activeTools = options?.toolChoiceRequired ? [...tools, finalAnswerTool] : tools;
// NEW:
const baseTools = getToolsForChannel(channel);
const activeTools = options?.toolChoiceRequired ? [...baseTools, finalAnswerTool] : baseTools;
```

_core.ts tool execution loop (lines 306-344):_ Pass `options.toolContext` to `execTool` at line 328.

_Teams adapter (line 203):_ Currently destructures only `{ stream, activity }`. Must access full `IActivityContext` including `api`, `signin`, `activity`. Fetch both tokens via `api.users.token.get({ channelId, userId, connectionName })` for each connection.

_Error handling mapping (in api-error.ts):_
- 401 -> `AUTH_REQUIRED:{connectionName}` (triggers re-signin flow)
- 403 -> `PERMISSION_DENIED`
- 429 -> `THROTTLED`
- 5xx -> `SERVICE_ERROR`
- Network error -> `NETWORK_ERROR`

_Graph client:_ `getProfile(token)` calls `GET https://graph.microsoft.com/v1.0/me`, returns formatted summary (displayName, mail, jobTitle, department, officeLocation).

_ADO client:_ `queryWorkItems(token, org, query)` calls `POST https://dev.azure.com/{org}/_apis/wit/wiql?api-version=7.1` with WIQL query, then fetches work item details. Returns formatted work item list (id, title, state, assignedTo).

_Tool handlers:_ `graph_profile` checks `toolContext.graphToken`, returns `AUTH_REQUIRED:graph` if missing. `ado_work_items` checks `toolContext.adoToken`, validates `organization` param against `toolContext.adoOrganizations`, returns `AUTH_REQUIRED:ado` if missing.

**TDD steps:**
1. Write all tests first (one test file per new module, plus additions to existing test files):
   - `api-error.test.ts`: test `handleApiError` for each status code (401/403/429/5xx/network)
   - `graph-client.test.ts`: test `getProfile(token)` success with mocked fetch, test error handling delegates to `handleApiError`
   - `ado-client.test.ts`: test `queryWorkItems(token, org, query)` success with mocked fetch (WIQL query + work item detail fetch), test error handling
   - `tools.test.ts` additions: test `getToolsForChannel("cli")` returns base tools only, test `getToolsForChannel("teams")` returns base tools + `graph_profile` + `ado_work_items`, test `execTool` passes `ToolContext` through to handler, test `graph_profile` handler (token present / token missing), test `ado_work_items` handler (token present / token missing / invalid org), test `summarizeArgs` for new tool names
   - `core.test.ts` additions: test `runAgent` uses `getToolsForChannel(channel)` (mock it), test `runAgent` passes `options.toolContext` to `execTool`
   - `teams.test.ts` additions: test new `handleTeamsMessage` signature with `TeamsMessageContext`, test `ToolContext` built and passed to `runAgent`, test token fetching (both succeed, one fails silently, both fail silently), test `startTeamsApp` passes `oauth` config to `App` constructor
2. Run tests, confirm FAIL (red)
3. Implement everything: `api-error.ts`, `graph-client.ts`, `ado-client.ts`, ToolContext + getToolsForChannel + handlers in `tools.ts`, wiring in `core.ts`, Teams adapter refactoring in `teams.ts`
4. Run tests, confirm PASS (green)
5. Verify 100% coverage on all new/modified code, refactor if needed

**Acceptance**:
- `ToolContext` interface has: `graphToken?: string`, `adoToken?: string`, `signin: (connectionName: string) => Promise<string | undefined>`, `adoOrganizations: string[]`
- `getToolsForChannel("cli")` returns only base tools (read_file, write_file, shell, etc.)
- `getToolsForChannel("teams")` returns base tools + `graph_profile` + `ado_work_items` (Phase 1 tools)
- `execTool` passes `ToolContext` through to handler when provided
- `runAgent` uses `getToolsForChannel(channel)` instead of static `tools` import, preserving `finalAnswerTool` conditional
- `runAgent` passes `options.toolContext` to `execTool` calls
- `handleApiError` correctly maps 401->AUTH_REQUIRED, 403->PERMISSION_DENIED, 429->THROTTLED, 5xx->SERVICE_ERROR, network->NETWORK_ERROR
- `getProfile(token)` calls Graph API `/v1.0/me` and returns formatted profile (displayName, mail, jobTitle, department, officeLocation)
- `queryWorkItems(token, org, query)` calls ADO WIQL endpoint and returns formatted work items (id, title, state, assignedTo)
- `graph_profile` handler returns `AUTH_REQUIRED:graph` when `graphToken` missing, calls `getProfile` when present
- `ado_work_items` handler returns `AUTH_REQUIRED:ado` when `adoToken` missing, validates `organization` against `adoOrganizations`, calls `queryWorkItems` when present
- `summarizeArgs` handles `graph_profile` and `ado_work_items` tool names
- `app.on("message")` handler accesses full `IActivityContext`, fetches both tokens separately
- Token fetch failures are silently caught (token is `undefined`, not an error)
- `handleTeamsMessage` receives `TeamsMessageContext` with `graphToken`, `adoToken`, `signin(connectionName)`
- `ToolContext` is built from `TeamsMessageContext` and passed to `runAgent`
- `App` constructor receives `oauth: { defaultConnectionName }` from config
- 100% coverage on all new/modified code (all branches, error paths, edge cases)
- All existing tests still pass (no regressions)
- No warnings

### ⬜ Unit 4: Full Test Suite and Integration Check
**What**: Run the full test suite (`npm run test:coverage`). Verify no regressions. Verify all new code has 100% coverage. Fix any issues.
**Output**: Clean test run, coverage report in `./2026-02-27-1232-doing-oauth-graph-ado/`.
**Acceptance**:
- All tests pass
- No warnings
- 100% coverage on all new files (`graph-client.ts`, `ado-client.ts`, `api-error.ts`, new code in `tools.ts`, `core.ts`, `teams.ts`)
- No regressions in existing test files
- Coverage report saved to artifacts directory

### ⬜ Unit 5: Phase 1 Manual Validation Gate
**What**: **STOP. Manual validation with user required.** Present the user with instructions to:
1. Ensure Azure/Entra setup is complete per `docs/OAUTH-SETUP.md`
2. Start dev tunnel: `devtunnel host --port-numbers 3978 --allow-anonymous`
3. Update `.env` with `ADO_ORGANIZATIONS`, `OAUTH_GRAPH_CONNECTION`, `OAUTH_ADO_CONNECTION` if non-default
4. Run `npm run teams`
5. In Teams, ask the bot "Who am I?" -- should trigger `graph_profile`, may prompt signin for Graph connection
6. Ask "Show my work items in {org}" -- should trigger `ado_work_items`, may prompt signin for ADO connection
7. Verify both tools return real data
8. Verify signin flow explains WHY before showing OAuth card
**Output**: User confirms smoke test passes.
**Acceptance**: User explicitly says Phase 1 is validated. **Do not proceed to Phase 2 without this.**

---

## Phase 2: Full Read Tools

### ⬜ Unit 10a: Graph Client Read Methods -- Tests
**What**: Write tests for remaining Graph client read methods: `getEmails(token, params)`, `getCalendar(token, params)`, `getFiles(token, params)`, `getTeamsMessages(token, params)`, `search(token, params)`. Test success cases with mocked responses, test error handling (reuses shared handler), test parameter handling (folder, query, count, date ranges, etc.).
**Output**: Additional tests in `src/__tests__/engine/graph-client.test.ts`.
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 10b: Graph Client Read Methods -- Implementation
**What**: Add `getEmails`, `getCalendar`, `getFiles`, `getTeamsMessages`, `search` methods to `src/engine/graph-client.ts`. Each calls the appropriate Graph API endpoint, formats results as human-readable summaries.
**Output**: Updated `src/engine/graph-client.ts`.
**Acceptance**: All graph-client tests PASS (green), no warnings.

### ⬜ Unit 10c: Graph Client Read Methods -- Coverage
**What**: Verify 100% coverage. Refactor if needed.
**Output**: Coverage report.
**Acceptance**: 100% coverage, tests green.

### ⬜ Unit 11a: ADO Client Read Methods -- Tests
**What**: Write tests for remaining ADO client read methods: `getRepos(token, org, params)`, `getPullRequests(token, org, params)`, `getPipelines(token, org, params)`. Test success, error handling, parameter handling.
**Output**: Additional tests in `src/__tests__/engine/ado-client.test.ts`.
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 11b: ADO Client Read Methods -- Implementation
**What**: Add `getRepos`, `getPullRequests`, `getPipelines` methods to `src/engine/ado-client.ts`. Each calls the appropriate ADO REST API endpoint, formats results.
**Output**: Updated `src/engine/ado-client.ts`.
**Acceptance**: All ado-client tests PASS (green), no warnings.

### ⬜ Unit 11c: ADO Client Read Methods -- Coverage
**What**: Verify 100% coverage. Refactor if needed.
**Output**: Coverage report.
**Acceptance**: 100% coverage, tests green.

### ⬜ Unit 12a: Remaining Read Tools -- Tests
**What**: Write tests for 8 remaining read tool handlers: `graph_emails`, `graph_calendar`, `graph_files`, `graph_teams_messages`, `graph_search`, `ado_repos`, `ado_pull_requests`, `ado_pipelines`. Test token-present/missing for each, test parameter passthrough, test `getToolsForChannel("teams")` now includes all 10 read tools.
**Output**: Additional tests.
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 12b: Remaining Read Tools -- Implementation
**What**: Add 8 read tool definitions and handlers. Register in `graphAdoTools`. Update `getToolsForChannel("teams")` to include all 10. Update `summarizeArgs` to handle all new tool names.
**Output**: Updated `src/engine/tools.ts`.
**Acceptance**: All tests PASS (green), `summarizeArgs` handles all 10 tools, no warnings.

### ⬜ Unit 12c: Remaining Read Tools -- Coverage
**What**: Verify 100% coverage on all new tool code. Full test suite passes.
**Output**: Coverage report.
**Acceptance**: 100% coverage, all tests green, no warnings.

---

## Phase 3: Write Tools + Muscle Memory

### ⬜ Unit 13a: Confirmation System in Agent Loop -- Tests
**What**: Write tests for the harness-level confirmation system in `src/engine/core.ts`. Test: when a tool with `requiresConfirmation` flag is called, `callbacks.onConfirmAction` is invoked with tool name and args. Test: if confirmed, tool executes normally. Test: if denied, tool returns "cancelled by user". Test: if no `onConfirmAction` callback, tool is rejected with error. Test: non-confirmation tools execute normally (no change). Test: confirmation state serialization for session persistence.
**Output**: Additional tests in `src/__tests__/engine/core.test.ts`.
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 13b: Confirmation System in Agent Loop -- Implementation
**What**: Add `onConfirmAction` to `ChannelCallbacks` interface. In the tool execution loop (lines 306-344 of `core.ts`), before calling `execTool`, check if the tool has `requiresConfirmation`. If so, call `callbacks.onConfirmAction(name, args)` which returns `"confirmed" | "denied" | "timeout"`. If confirmed, proceed with `execTool`. If denied/timeout, push a tool result message saying "cancelled by user" / "cancelled (no response)". Add `requiresConfirmation` metadata to tool definitions (extend the tool type or use a separate registry).
**Output**: Updated `src/engine/core.ts`, updated `src/engine/tools.ts`.
**Acceptance**: All confirmation tests PASS (green), no warnings, no regressions.

### ⬜ Unit 13c: Confirmation System -- Coverage
**What**: Verify 100% coverage on confirmation system code. Refactor if needed.
**Output**: Coverage report.
**Acceptance**: 100% coverage, tests green.

### ⬜ Unit 14a: Teams Confirmation Callback -- Tests
**What**: Write tests for the Teams channel implementation of `onConfirmAction` in `createTeamsCallbacks`. Test: sends confirmation message via stream. Test: persists pending state to SDK `IStorage`. Test: next message handler checks for pending confirmation. Test: "yes" response triggers tool execution. Test: "no" response clears pending state. Test: unrelated message clears pending state and processes normally.
**Output**: Additional tests in `src/__tests__/channels/teams.test.ts`.
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 14b: Teams Confirmation Callback -- Implementation
**What**: Implement `onConfirmAction` in `createTeamsCallbacks`. Use SDK `IStorage` (via `ctx.storage`) to persist pending confirmation keyed by conversation ID. In `handleTeamsMessage`, check for pending confirmation before running agent. If pending and user says yes/no, resolve accordingly. If pending and user says something else, clear pending and process normally.
**Output**: Updated `src/channels/teams.ts`.
**Acceptance**: All Teams confirmation tests PASS (green), no warnings.

### ⬜ Unit 14c: Teams Confirmation Callback -- Coverage
**What**: Verify 100% coverage. Refactor if needed.
**Output**: Coverage report.
**Acceptance**: 100% coverage, tests green.

### ⬜ Unit 15a: Graph Write Methods -- Tests
**What**: Write tests for Graph client write methods: `sendEmail(token, params)`, `createEvent(token, params)`, `uploadFile(token, params)`. Test success, error handling, parameter validation.
**Output**: Additional tests in `src/__tests__/engine/graph-client.test.ts`.
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 15b: Graph Write Methods -- Implementation
**What**: Add `sendEmail`, `createEvent`, `uploadFile` to `src/engine/graph-client.ts`.
**Output**: Updated `src/engine/graph-client.ts`.
**Acceptance**: All tests PASS (green).

### ⬜ Unit 15c: Graph Write Methods -- Coverage
**What**: Verify 100% coverage.
**Output**: Coverage report.
**Acceptance**: 100% coverage, tests green.

### ⬜ Unit 16a: ADO Write Methods -- Tests
**What**: Write tests for ADO client write methods: `createWorkItem(token, org, params)`, `updateWorkItem(token, org, params)`, `createPrComment(token, org, params)`. Test success, error handling, parameter validation.
**Output**: Additional tests in `src/__tests__/engine/ado-client.test.ts`.
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 16b: ADO Write Methods -- Implementation
**What**: Add `createWorkItem`, `updateWorkItem`, `createPrComment` to `src/engine/ado-client.ts`.
**Output**: Updated `src/engine/ado-client.ts`.
**Acceptance**: All tests PASS (green).

### ⬜ Unit 16c: ADO Write Methods -- Coverage
**What**: Verify 100% coverage.
**Output**: Coverage report.
**Acceptance**: 100% coverage, tests green.

### ⬜ Unit 17a: Write Tool Definitions -- Tests
**What**: Write tests for 6 write tool handlers: `graph_send_email`, `graph_create_event`, `graph_upload_file`, `ado_create_work_item`, `ado_update_work_item`, `ado_create_pr_comment`. Test each has `requiresConfirmation` flag. Test token-present/missing. Test parameter passthrough to client methods. Test `getToolsForChannel("teams")` includes all 16 tools.
**Output**: Additional tests.
**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 17b: Write Tool Definitions -- Implementation
**What**: Add 6 write tool definitions with `requiresConfirmation: true` metadata. Add handlers. Register in `graphAdoTools`. Update `summarizeArgs` to handle all 16 tool names.
**Output**: Updated `src/engine/tools.ts`.
**Acceptance**: All tests PASS (green), `summarizeArgs` handles all 16 tools.

### ⬜ Unit 17c: Write Tool Definitions -- Coverage
**What**: Verify 100% coverage on all write tool code.
**Output**: Coverage report.
**Acceptance**: 100% coverage, tests green.

### ⬜ Unit 18: Final Full Suite and Phase 3 Validation
**What**: Run full test suite (`npm run test:coverage`). Verify all tests pass, no warnings, 100% coverage on all new code. Save coverage report to artifacts directory.
**Output**: Clean test run, coverage report.
**Acceptance**: All tests pass, no warnings, 100% coverage on all new files.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (a, b, c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-27-1232-doing-oauth-graph-ado/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away
- **Phase 1 gate**: Unit 5 is a hard stop -- user must manually validate before Phase 2
- **Shared error handling**: `handleApiError` extracted to `src/engine/api-error.ts` (decided upfront, implemented in Unit 3)

## Progress Log
- 2026-02-27 13:07 Created from planning doc (Pass 1: first draft)
- 2026-02-27 13:09 Pass 2: granularity - no changes needed
- 2026-02-27 13:12 Pass 3: validation - fixed activeTools line 187 detail, added summarizeArgs updates to tool units
- 2026-02-27 13:14 Pass 4: quality - no changes needed, all 40 units have emoji status + acceptance criteria
- 2026-02-27 13:13 Status updated to READY_FOR_EXECUTION
- 2026-02-27 13:37 Phase 1 compression: Pass 1 first draft - rewrote 17 sub-units (Units 1-9) into 5 units
- 2026-02-27 13:38 Phase 1 compression: Pass 2 granularity - no changes needed (all 5 units atomic/testable)
- 2026-02-27 13:38 Phase 1 compression: Pass 3 validation - cross-checked all old units, no losses found
- 2026-02-27 13:39 Phase 1 compression: Pass 4 quality - added Output line to Unit 3 for consistency
- 2026-02-27 13:42 Unit 1 complete: docs/OAUTH-SETUP.md written covering app registration, API permissions, two OAuth connections (graph + ado), manifest webApplicationInfo, dev tunnel, env vars
- 2026-02-27 13:43 Unit 2 complete: OAuthConfig + AdoConfig interfaces, getOAuthConfig() + getAdoConfig() with env var overrides, 10 new tests all green, 599 total tests passing
