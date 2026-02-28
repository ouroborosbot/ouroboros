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
- [ ] Generic API tools: `graph_query`, `graph_mutate`, `ado_query`, `ado_mutate` + convenience aliases
- [ ] Documentation tools: `graph_docs`, `ado_docs` with static endpoint indexes
- [ ] Graph/ADO tools only available on Teams channel, not CLI
- [ ] On-demand signin flow works per connection
- [ ] Error handling: 401 triggers re-signin, 403 reports permission denied, 429 reports throttled
- [ ] Confirmation system blocks mutate tools (`graph_mutate`, `ado_mutate`) until user confirms
- [ ] Confirmation enforced in agent loop, Teams callback with text prompt
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

### ✅ Unit 3: OAuth Plumbing (Vertical Slice)
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

### ✅ Unit 4: Full Test Suite and Integration Check
**What**: Run the full test suite (`npm run test:coverage`). Verify no regressions. Verify all new code has 100% coverage. Fix any issues.
**Output**: Clean test run, coverage report in `./2026-02-27-1232-doing-oauth-graph-ado/`.
**Acceptance**:
- All tests pass
- No warnings
- 100% coverage on all new files (`graph-client.ts`, `ado-client.ts`, `api-error.ts`, new code in `tools.ts`, `core.ts`, `teams.ts`)
- No regressions in existing test files
- Coverage report saved to artifacts directory

### ✅ Unit 5: Phase 1 Manual Validation Gate
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

### ✅ Unit 6: Restructure -- Split tools by channel
**What**: Split `src/engine/tools.ts` into `tools-base.ts` (shared base tools, types, handlers) and `tools-teams.ts` (Teams-only Graph/ADO tool definitions + handlers). `tools.ts` is now a thin facade that combines them via `getToolsForChannel()`. Graph/ADO clients and api-error stay in `src/engine/` alongside the tools that use them.
**Files created**: `src/engine/tools-base.ts`, `src/engine/tools-teams.ts`
**Files modified**: `src/engine/tools.ts` (now facade only)
**Acceptance**: 647 tests pass, 100% coverage, no regressions.

### ✅ Unit 7: Generic API Clients
**What**: Replace the single-purpose `getProfile()` and `queryWorkItems()` with generic request functions that can hit any endpoint. Rewrite both client files. TDD.
**Files modified**:
- `src/engine/graph-client.ts` — replace `getProfile(token)` with `graphRequest(token, method, path, body?)`. Returns raw JSON response as string. Keeps `getProfile` as a thin wrapper for backward compat (calls `graphRequest` internally).
- `src/engine/ado-client.ts` — replace `queryWorkItems(token, org, query)` with `adoRequest(token, method, org, path, body?)`. Returns raw JSON response as string. Keeps `queryWorkItems` as a thin wrapper for backward compat.
- `src/__tests__/engine/graph-client.test.ts` — tests for `graphRequest`: GET success, POST success, error handling via `handleApiError`, various paths
- `src/__tests__/engine/ado-client.test.ts` — tests for `adoRequest`: GET success, POST success (WIQL), error handling, various paths

**Design notes**:
- `graphRequest(token, method, path, body?)`: base URL `https://graph.microsoft.com/v1.0`, path is everything after (e.g. `/me/messages?$top=5`). Returns response body as formatted JSON string for the LLM.
- `adoRequest(token, method, org, path, body?)`: base URL `https://dev.azure.com/{org}`, path is everything after (e.g. `/_apis/wit/wiql?api-version=7.1`). Appends `api-version=7.1` if not present. Returns response body as formatted JSON string.
- Both use `handleApiError` from `api-error.ts` for error responses.
- Existing `getProfile` and `queryWorkItems` become thin wrappers calling the generic functions (no behavior change, existing tests stay green).

**Acceptance**: All tests pass, 100% coverage, no regressions. Both generic functions tested with multiple methods/paths.

### ⬜ Unit 8: Generic Tool Definitions
**What**: Replace `graph_profile` and `ado_work_items` with 4 generic tools in `tools-teams.ts`. TDD.
**Tools**:
- `graph_query` — GET any Graph API path. Params: `path` (required). Uses `graphRequest(token, "GET", path)`.
- `graph_mutate` — POST/PATCH/DELETE any Graph API path. Params: `method` (required, one of POST/PATCH/DELETE), `path` (required), `body` (optional JSON string). Marked `requiresConfirmation: true`.
- `ado_query` — GET or POST any ADO API path (POST for WIQL is read-only). Params: `organization` (required), `path` (required), `method` (optional, defaults GET), `body` (optional JSON string). Uses `adoRequest`.
- `ado_mutate` — POST/PATCH/DELETE any ADO API path for actual mutations. Params: `organization` (required), `method` (required), `path` (required), `body` (optional JSON string). Marked `requiresConfirmation: true`.

**Files modified**:
- `src/engine/tools-teams.ts` — replace `teamsTools` array and `teamsToolHandlers` with new 4 tools. Update `summarizeTeamsArgs`. Keep existing tool names (`graph_profile`, `ado_work_items`) as convenience aliases that internally call the generic functions.
- `src/engine/tools.ts` — no changes needed (facade auto-imports)
- `src/__tests__/engine/tools.test.ts` — tests for all 4 new tool handlers: token present/missing, parameter validation, method validation for mutate tools, org validation for ADO tools, `getToolsForChannel("teams")` returns correct count, `summarizeTeamsArgs` handles all tool names

**Note**: Mutate tools are marked `requiresConfirmation` as metadata only in this unit. Enforcement happens in Unit 11.
**Acceptance**: All tests pass, 100% coverage, `getToolsForChannel("teams")` returns base tools + 4 generic teams tools (+ 2 convenience aliases = 6 teams tools total).

### ⬜ Unit 9: Endpoint Documentation Tools
**What**: Add `graph_docs` and `ado_docs` tools that let the model look up API endpoint documentation before making calls. Uses static JSON indexes shipped with the codebase. TDD.
**Files created**:
- `src/engine/data/graph-endpoints.json` — index of ~30 common Graph API endpoints: path, method, description, common params, required scopes. Covers: profile, messages, calendar, files, teams chat, sites, contacts, search, send mail, create event, upload file, etc.
- `src/engine/data/ado-endpoints.json` — index of ~20 common ADO API endpoints: path pattern, method, description, common params. Covers: WIQL, work items CRUD, repos, pull requests, pipelines, builds, branches, commits, etc.

**Tools**:
- `graph_docs` — search the Graph endpoint index. Params: `query` (required, e.g. "send email" or "calendar events"). Returns matching endpoints with path, method, description, params.
- `ado_docs` — search the ADO endpoint index. Params: `query` (required). Returns matching endpoints.

**Search**: Simple case-insensitive substring match on description + path. Returns top 5 matches.

**Files modified**:
- `src/engine/tools-teams.ts` — add `graph_docs` and `ado_docs` to `teamsTools` + handlers + `summarizeTeamsArgs`
- `src/__tests__/engine/tools.test.ts` — tests for docs tools: query match, no match, multiple matches

**Acceptance**: All tests pass, 100% coverage. Model can chain `graph_docs("create calendar event")` → gets endpoint info → `graph_mutate(method: "POST", path: "/me/events", body: "...")`.

### ⬜ Unit 10: Full Suite + Coverage Check
**What**: Run full test suite. Verify 100% coverage on all new/modified code. Fix any issues.
**Acceptance**: All tests pass, no warnings, 100% coverage.

---

## Phase 3: Confirmation System

### ⬜ Unit 11: Confirmation System in Agent Loop
**What**: Add confirmation support to the agent loop so mutate tools require user approval before executing. TDD.
**Design**: Tools marked with `requiresConfirmation: true` trigger a callback before execution. The callback is async — it asks the user and waits for a response.
**Files modified**:
- `src/engine/core.ts`:
  - Add optional `onConfirmAction?(name: string, args: Record<string, string>): Promise<"confirmed" | "denied">` to `ChannelCallbacks` (line 74).
  - In tool execution loop (before `execTool` at line 333): check if tool name is in a `requiresConfirmation` set (exported from `tools-teams.ts`). If so, call `callbacks.onConfirmAction`. If confirmed, proceed. If denied or callback missing, push tool result "Action cancelled by user" and skip `execTool`.
- `src/engine/tools-teams.ts`:
  - Export `const confirmationRequired: Set<string>` containing mutate tool names (`graph_mutate`, `ado_mutate`).
- `src/__tests__/engine/core.test.ts`:
  - Test: confirmation tool + confirmed → executes normally
  - Test: confirmation tool + denied → returns "cancelled by user"
  - Test: confirmation tool + no callback → returns "cancelled" (safe default)
  - Test: non-confirmation tool → executes normally (no callback invoked)

**Acceptance**: All tests pass, 100% coverage, no regressions.

### ⬜ Unit 12: Teams Confirmation Callback
**What**: Implement `onConfirmAction` for the Teams channel. TDD.
**Design**: When a mutate tool needs confirmation, send an informative message to the user describing what will happen, then use an Adaptive Card with Confirm/Deny buttons (or fall back to text prompt). For Phase 1, use a simple text prompt approach — emit a message asking for confirmation and resolve based on the next user message.
**Files modified**:
- `src/channels/teams.ts`:
  - Add `onConfirmAction` to `createTeamsCallbacks`. When invoked: emit a message describing the action via `stream.update`, return a Promise that resolves when the user responds. Use a per-conversation pending-confirmation map (similar to `_convLocks`).
  - In `handleTeamsMessage`: before running agent, check if there's a pending confirmation for this conversation. If yes and user says "yes"/"confirm"/"go"→ resolve confirmed. If "no"/"cancel"/"deny" → resolve denied. Otherwise → resolve denied and process message normally.
- `src/__tests__/channels/teams.test.ts`:
  - Test: onConfirmAction sends descriptive message
  - Test: "yes" response resolves confirmed
  - Test: "no" response resolves denied
  - Test: unrelated message resolves denied and processes normally

**Acceptance**: All tests pass, 100% coverage, no regressions.

### ⬜ Unit 13: Final Full Suite and Validation
**What**: Run full test suite (`npx vitest run --coverage`). Verify all tests pass, no warnings, 100% coverage on all new code.
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
- **Shared error handling**: `handleApiError` in `src/engine/api-error.ts` (implemented in Unit 3)
- **Tool file split**: Base tools in `tools-base.ts`, Teams tools in `tools-teams.ts`, facade in `tools.ts` (restructured in Unit 6)

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
- 2026-02-27 13:55 Unit 3 complete: full vertical slice -- api-error.ts, graph-client.ts, ado-client.ts, ToolContext, getToolsForChannel, graph_profile + ado_work_items handlers, core.ts wiring, teams.ts token threading. 645 tests passing, no warnings, no TS errors
- 2026-02-27 13:56 Unit 4 complete: 646 tests passing, 100% coverage on all new files (ado-client.ts, api-error.ts, graph-client.ts, tools.ts, teams.ts), no warnings, coverage report saved to artifacts
- 2026-02-27 18:23 Unit 7 complete: graphRequest(token, method, path, body?) and adoRequest(token, method, org, path, body?) added. getProfile/queryWorkItems kept as thin wrappers. 715 tests passing, 100% coverage.
