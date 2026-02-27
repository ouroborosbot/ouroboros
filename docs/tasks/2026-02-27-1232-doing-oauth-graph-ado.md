# Doing: OAuth Authentication for Graph API and Azure DevOps API

**Status**: drafting
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

### ⬜ Unit 1: OAuth Setup Documentation
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

### ⬜ Unit 2: Manifest and Config Changes
**What**: Add `webApplicationInfo` to `manifest/manifest.json`. Add `OAuthConfig` and `AdoConfig` to `src/config.ts` with `getOAuthConfig()` and `getAdoConfig()` functions.
**Output**: Updated `manifest/manifest.json`, updated `src/config.ts`.

**TDD steps:**
1. Write tests for `getOAuthConfig()` -- returns defaults (`graph`, `ado`), respects env var overrides (`OAUTH_GRAPH_CONNECTION`, `OAUTH_ADO_CONNECTION`)
2. Write tests for `getAdoConfig()` -- returns defaults (empty organizations), respects env var `ADO_ORGANIZATIONS` (comma-separated parsing), respects config.json
3. Run tests, confirm FAIL (red)
4. Implement `OAuthConfig`, `AdoConfig` interfaces, add to `OuroborosConfig`, implement `getOAuthConfig()` and `getAdoConfig()`
5. Run tests, confirm PASS (green)
6. Update `manifest/manifest.json` with `webApplicationInfo` section

**Acceptance**:
- `getOAuthConfig()` returns `{ graphConnectionName: "graph", adoConnectionName: "ado" }` by default
- `getOAuthConfig()` respects `OAUTH_GRAPH_CONNECTION` and `OAUTH_ADO_CONNECTION` env vars
- `getAdoConfig()` returns `{ organizations: [] }` by default
- `getAdoConfig()` parses `ADO_ORGANIZATIONS` env var as comma-separated list
- `manifest/manifest.json` has `webApplicationInfo` with `id` matching bot ID and `resource` set to `api://botid-{id}`
- 100% coverage on new config code
- All existing tests still pass

### ⬜ Unit 3: ToolContext and Channel-Conditional Tools
**What**: Add `ToolContext` interface to `src/engine/tools.ts`. Modify `ToolHandler` type and `execTool` to accept optional `ToolContext`. Add `getToolsForChannel(channel)` function. Add `toolContext` to `RunAgentOptions` in `src/engine/core.ts`. Wire `getToolsForChannel` into the agent loop (replacing static `tools` on line 187 of `core.ts`). Pass `toolContext` through to `execTool` in tool execution loop (lines 306-344 of `core.ts`).
**Output**: Updated `src/engine/tools.ts`, updated `src/engine/core.ts`.

**TDD steps:**
1. Write tests for `getToolsForChannel("cli")` -- returns base tools only, no Graph/ADO tools
2. Write tests for `getToolsForChannel("teams")` -- returns base tools + Graph/ADO tools
3. Write tests for `execTool` with `ToolContext` -- context is passed through to handler
4. Write tests verifying `runAgent` uses channel-based tool selection (mock `getToolsForChannel`)
5. Run tests, confirm FAIL (red)
6. Implement `ToolContext` interface, modify `ToolHandler`/`execTool`, implement `getToolsForChannel`, wire into `core.ts`
7. Run tests, confirm PASS (green)

**Acceptance**:
- `ToolContext` interface has: `graphToken?: string`, `adoToken?: string`, `signin: (connectionName: string) => Promise<string | undefined>`, `adoOrganizations: string[]`
- `getToolsForChannel("cli")` returns only base tools (read_file, write_file, shell, etc.)
- `getToolsForChannel("teams")` returns base tools + `graph_profile` + `ado_work_items` (Phase 1 tools)
- `execTool` passes `ToolContext` through to handler when provided
- `runAgent` uses `getToolsForChannel(channel)` instead of static `tools` import. Note: line 187 of `core.ts` currently reads `const activeTools = options?.toolChoiceRequired ? [...tools, finalAnswerTool] : tools;` -- the replacement must preserve the `finalAnswerTool` conditional: `const baseTools = getToolsForChannel(channel); const activeTools = options?.toolChoiceRequired ? [...baseTools, finalAnswerTool] : baseTools;`
- `runAgent` passes `options.toolContext` to `execTool` calls (line 328 of `core.ts`)
- All existing tests still pass (no regressions from refactoring tool selection)
- 100% coverage on new code

### ⬜ Unit 4: Teams Adapter Token Threading
**What**: Refactor `src/channels/teams.ts` to thread OAuth tokens and signin callback through to the agent loop. The `app.on("message")` handler (line 203) currently destructures only `{ stream, activity }`. Refactor it to access full `IActivityContext` including `api`, `signin`, `activity`. Fetch tokens for both `graph` and `ado` connections using `api.users.token.get({ channelId, userId, connectionName })`. Refactor `handleTeamsMessage` signature to accept a `TeamsMessageContext`. Build `ToolContext` and pass to `runAgent` via options. Add `oauth: { defaultConnectionName: "graph" }` to `App` constructor in `startTeamsApp`.
**Output**: Updated `src/channels/teams.ts`.

**TDD steps:**
1. Write tests for new `handleTeamsMessage` signature accepting `TeamsMessageContext` with `graphToken`, `adoToken`, `signin`
2. Write tests verifying `ToolContext` is built and passed to `runAgent` options
3. Write tests for token fetching: both tokens fetched, one fails silently (token undefined), both fail silently
4. Write tests for `startTeamsApp` passing `oauth` config to `App` constructor
5. Run tests, confirm FAIL (red)
6. Implement the refactoring
7. Run tests, confirm PASS (green)

**Acceptance**:
- `app.on("message")` handler accesses full context, fetches `graphToken` and `adoToken` separately
- Token fetch failures are silently caught (token is `undefined`, not an error)
- `handleTeamsMessage` receives `TeamsMessageContext` with `graphToken`, `adoToken`, `signin(connectionName)`
- `ToolContext` is built from `TeamsMessageContext` and passed to `runAgent`
- `App` constructor receives `oauth: { defaultConnectionName }` from config
- All existing Teams adapter tests still pass
- 100% coverage on new/modified code

### ⬜ Unit 5a: Graph Client -- Tests
**What**: Write tests for minimal Graph client (`src/engine/graph-client.ts`). Test `getProfile(token)` with mocked fetch. Test error handling: 401 returns `AUTH_REQUIRED:graph`, 403 returns `PERMISSION_DENIED`, 429 returns `THROTTLED`, 5xx returns `SERVICE_ERROR`, network error returns `NETWORK_ERROR`. Test success case returns formatted profile summary.
**Output**: Test file `src/__tests__/engine/graph-client.test.ts`.
**Acceptance**: Tests exist and FAIL (red) because `graph-client.ts` does not exist yet.

### ⬜ Unit 5b: Graph Client -- Implementation
**What**: Create `src/engine/graph-client.ts` with `getProfile(token)` method. Implement shared `handleApiError(response, service, connectionName)` helper. `getProfile` calls `GET https://graph.microsoft.com/v1.0/me`, returns formatted summary (displayName, mail, jobTitle, department, officeLocation).
**Output**: `src/engine/graph-client.ts`.
**Acceptance**: All graph-client tests PASS (green), no warnings.

### ⬜ Unit 5c: Graph Client -- Coverage
**What**: Verify 100% coverage on `graph-client.ts`. Refactor if needed.
**Output**: Coverage report showing 100% on `src/engine/graph-client.ts`.
**Acceptance**: 100% branch/line/function coverage, tests still green.

### ⬜ Unit 6a: ADO Client -- Tests
**What**: Write tests for minimal ADO client (`src/engine/ado-client.ts`). Test `queryWorkItems(token, org, query)` with mocked fetch. Test with WIQL query and with work item IDs. Test error handling: same pattern as Graph (401/403/429/5xx/network). Test success case returns formatted work item list (id, title, state, assignedTo).
**Output**: Test file `src/__tests__/engine/ado-client.test.ts`.
**Acceptance**: Tests exist and FAIL (red) because `ado-client.ts` does not exist yet.

### ⬜ Unit 6b: ADO Client -- Implementation
**What**: Create `src/engine/ado-client.ts` with `queryWorkItems(token, org, query)` method. Reuse shared `handleApiError` from graph-client (or extract to a shared `api-error.ts` module). `queryWorkItems` calls `POST https://dev.azure.com/{org}/_apis/wit/wiql?api-version=7.1` with WIQL query, then fetches work item details. Returns formatted summary.
**Output**: `src/engine/ado-client.ts`.
**Acceptance**: All ado-client tests PASS (green), no warnings.

### ⬜ Unit 6c: ADO Client -- Coverage
**What**: Verify 100% coverage on `ado-client.ts` (and `api-error.ts` if extracted). Refactor if needed.
**Output**: Coverage report showing 100%.
**Acceptance**: 100% branch/line/function coverage, tests still green.

### ⬜ Unit 7a: graph_profile and ado_work_items Tools -- Tests
**What**: Write tests for the two Phase 1 tool handlers. Test `graph_profile` handler: calls `getProfile` when `graphToken` present, returns `AUTH_REQUIRED:graph` when `graphToken` missing. Test `ado_work_items` handler: calls `queryWorkItems` when `adoToken` present with correct org, returns `AUTH_REQUIRED:ado` when `adoToken` missing, validates organization param against `adoOrganizations` list.
**Output**: Tests in `src/__tests__/engine/tools.test.ts` (or a new file for Graph/ADO tool tests).
**Acceptance**: Tests exist and FAIL (red) because tool handlers are not yet registered.

### ⬜ Unit 7b: graph_profile and ado_work_items Tools -- Implementation
**What**: Add `graph_profile` and `ado_work_items` tool definitions and handlers to `src/engine/tools.ts`. Register them in the `graphAdoTools` array used by `getToolsForChannel("teams")`. Each handler checks for its required token in `ToolContext`, returns `AUTH_REQUIRED:{connection}` if missing. `ado_work_items` validates the `organization` param against `toolContext.adoOrganizations`. Also update `summarizeArgs` (line 259 of `tools.ts`) to handle the new tool names.
**Output**: Updated `src/engine/tools.ts`.
**Acceptance**: All tool tests PASS (green), `summarizeArgs` handles new tools, no warnings.

### ⬜ Unit 7c: graph_profile and ado_work_items Tools -- Coverage
**What**: Verify 100% coverage on new tool code. Refactor if needed.
**Output**: Coverage report showing 100%.
**Acceptance**: 100% branch/line/function coverage, tests still green.

### ⬜ Unit 8: Full Test Suite and Integration Check
**What**: Run the full test suite (`npm run test:coverage`). Verify no regressions. Verify all new code has 100% coverage. Fix any issues.
**Output**: Clean test run, coverage report in `./2026-02-27-1232-doing-oauth-graph-ado/`.
**Acceptance**:
- All tests pass
- No warnings
- 100% coverage on all new files (`graph-client.ts`, `ado-client.ts`, `api-error.ts` if extracted)
- No regressions in existing test files
- Coverage report saved to artifacts directory

### ⬜ Unit 9: Phase 1 Manual Validation Gate
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
- **Phase 1 gate**: Unit 9 is a hard stop -- user must manually validate before Phase 2
- **Shared error handling**: Extract `handleApiError` to `src/engine/api-error.ts` if both Graph and ADO clients use it (decide during Unit 5b/6b)

## Progress Log
- 2026-02-27 13:07 Created from planning doc
