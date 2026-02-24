# Doing: WU1.5 -- Bot Registration, Dev Tunnels, Real Teams Surface

**Status**: drafting
**Execution Mode**: pending
**Created**: 2026-02-23
**Planning**: ./2026-02-23-1908-planning-wu15-real-teams.md
**Artifacts**: ./2026-02-23-1908-doing-wu15-real-teams/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

Execution mode is `pending` because several units require interactive collaboration with the user (Azure login, dev tunnel setup, sideloading, manual testing in Teams). The agent cannot fully automate these steps without the user's environment and browser.

## Objective

Connect the Ouroboros agent to real Teams -- move from the DevtoolsPlugin playground (WU1) to actual Teams chat. Register an Azure Bot, set up dev tunnels for local development, create an app manifest, and verify streaming works in both 1:1 Teams chat and Microsoft 365 Copilot Chat (Custom Engine Agent).

## Completion Criteria

- [ ] Azure Bot Service resource exists with App ID and client secret
- [ ] Dev tunnel is configured and persistent (same URL across sessions)
- [ ] Bot messaging endpoint is set to `https://<tunnel-url>/api/messages`
- [ ] `teams.ts` works in both DevtoolsPlugin mode (no env vars) and real bot mode (with `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`)
- [ ] `.env` file pattern documented and `.env` in `.gitignore`
- [ ] App manifest is valid and sideloaded into Teams
- [ ] Sending a message in 1:1 Teams bot chat triggers the agent and streams a response
- [ ] Sending a message via Copilot Chat (CEA) triggers the agent and streams a response
- [ ] Informative updates appear during tool execution in both surfaces
- [ ] Streaming sends cumulative (append-only) content, not incremental chunks
- [ ] Streaming respects the 1 req/sec throttle (buffered, not per-token)
- [ ] Stop-streaming signal from Teams is handled gracefully
- [ ] `@mention` markup is stripped from incoming messages
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
Not started / In progress / Done / Blocked

### Unit 0: Azure and Infra Setup (Interactive)

**What**: Set up all Azure infrastructure and local tooling. This unit is interactive -- the agent provides commands, the user runs them.

Steps:
1. Add `.env` to `.gitignore`
2. Create Azure resource group:
   ```
   az group create --name agent --location westus2 --subscription 99cdfbb7-03e5-4055-bad7-9cefd8f23251
   ```
3. Create Microsoft Entra app registration (bot identity):
   ```
   az ad app create --display-name "Ouroboros" --sign-in-audience AzureADMyOrg
   ```
   Capture the `appId` from output.
4. Create a client secret for the app:
   ```
   az ad app credential reset --id <appId> --display-name "ouroboros-bot-secret"
   ```
   Capture `password` from output (this is the `CLIENT_SECRET`).
5. Create Azure Bot Service resource:
   ```
   az bot create --resource-group agent --name Ouroboros --app-type SingleTenant --appid <appId> --tenant-id smbdevnotags3.onmicrosoft.com --location global --subscription 99cdfbb7-03e5-4055-bad7-9cefd8f23251
   ```
6. Enable the Teams channel on the bot:
   ```
   az bot msteams create --resource-group agent --name Ouroboros --subscription 99cdfbb7-03e5-4055-bad7-9cefd8f23251
   ```
7. Install dev tunnels CLI (macOS):
   ```
   brew install --cask devtunnel
   ```
8. Login to dev tunnels:
   ```
   devtunnel user login
   ```
9. Create a persistent named tunnel:
   ```
   devtunnel create ouroboros --allow-anonymous
   devtunnel port create ouroboros --port-number 3978 --protocol https
   ```
10. Get the tunnel URL:
    ```
    devtunnel show ouroboros
    ```
    Capture the URL (e.g. `https://ouroboros-XXXX.devtunnels.ms`).
11. Set the bot messaging endpoint to the tunnel URL:
    ```
    az bot update --resource-group agent --name Ouroboros --endpoint "https://<tunnel-url>/api/messages" --subscription 99cdfbb7-03e5-4055-bad7-9cefd8f23251
    ```
12. Create `.env` file in project root:
    ```
    CLIENT_ID=<appId>
    CLIENT_SECRET=<password>
    TENANT_ID=smbdevnotags3.onmicrosoft.com
    ```

**Output**: Azure Bot resource, dev tunnel, `.env` file, `.gitignore` updated.
**Acceptance**: `az bot show --resource-group agent --name Ouroboros` returns bot details. `devtunnel show ouroboros` returns tunnel URL. `.env` exists with credentials. `.env` is in `.gitignore`.

### Unit 1a: Streaming Overhaul -- Tests

**What**: Write tests for the new streaming behavior in `teams.ts`. The streaming changes are:
1. **Cumulative content**: `stream.emit()` must send ALL previous content plus new content (append-only). Add an accumulator that tracks total emitted text.
2. **Buffered flushing**: Text chunks from `onTextChunk` are buffered and flushed to `stream.emit()` at most once per ~1.5 seconds (configurable). This respects the Teams 1 req/sec throttle.
3. **Stop-streaming support**: When the stream signals cancellation (403 error), the adapter aborts the agent via `AbortController`. `runAgent()` already supports `AbortSignal` (parameter added in WU1).
4. **Flush-on-close**: When `runAgent()` completes, any remaining buffered content is flushed before `stream.close()`.

Test cases:
- Cumulative: first emit is "Hello", second emit is "Hello world" (not "world")
- Buffer: multiple rapid `onTextChunk` calls result in a single buffered `stream.emit()` (not one per chunk)
- Buffer: after flush interval, buffered content is emitted
- Buffer: on close, remaining buffer is flushed
- Stop: when stream emits cancel error, the `AbortController` is aborted
- Stop: after abort, no more `stream.emit()` calls are made
- Think-tag stripping still works with cumulative content
- Leading whitespace trimming still works with cumulative content
- `onModelStart` / `onToolStart` / `onToolEnd` / `onError` behavior unchanged

Update existing tests in `teams.test.ts` to expect cumulative (not incremental) emit behavior.

**Output**: Updated `src/__tests__/teams.test.ts`.
**Acceptance**: New tests FAIL (red) because streaming behavior has not changed yet. Existing tests that checked incremental behavior are updated to expect cumulative behavior and also FAIL.

### Unit 1b: Streaming Overhaul -- Implementation

**What**: Update `createTeamsCallbacks()` in `teams.ts` to implement:
1. **Cumulative accumulator**: Track `cumulativeText` string. Every time content passes think-tag stripping, append to `cumulativeText`. Emit `cumulativeText` (not the chunk).
2. **Buffer with timer**: Instead of emitting immediately, set a flush timer (~1500ms). On each `onTextChunk`, update `cumulativeText` but only emit when the timer fires. Reset the timer on each chunk. Use `setInterval` or `setTimeout` pattern.
3. **AbortController integration**: `createTeamsCallbacks` now accepts an `AbortController` parameter. When `stream.emit()` or `stream.update()` throws (403 from Teams stop button), call `controller.abort()`. `handleTeamsMessage` creates the controller and passes `controller.signal` to `runAgent()`.
4. **Flush on complete**: After `runAgent()` returns, flush any remaining buffered content, then close stream.

Also update `handleTeamsMessage` to create `AbortController`, pass signal to `runAgent()`, and handle abort cleanup.

**Output**: Updated `src/teams.ts`.
**Acceptance**: All Unit 1a tests PASS (green). `npm run build` succeeds. DevtoolsPlugin still works (backward compatible -- DevtoolsPlugin may not enforce append-only, but cumulative content is still valid).

### Unit 1c: Streaming Overhaul -- Coverage and Refactor

**What**: Run coverage on updated `teams.ts`. Fill gaps: timer edge cases (flush with empty buffer, flush after abort, rapid chunks, timer cleanup on close). Refactor buffer logic for clarity if needed.
**Output**: Updated `src/__tests__/teams.test.ts`, 100% coverage on streaming code.
**Acceptance**: `npm run test:coverage` shows 100% coverage on new/changed code in `src/teams.ts`. All tests green. No warnings.

### Unit 2a: Bot Mode and Mention Stripping -- Tests

**What**: Write tests for the dual-mode `startTeamsApp()` and mention stripping. Test:
- **DevtoolsPlugin mode**: When `CLIENT_ID` env var is NOT set, `startTeamsApp()` creates App with `DevtoolsPlugin` (existing behavior)
- **Bot mode**: When `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID` env vars ARE set, `startTeamsApp()` creates App WITHOUT DevtoolsPlugin, passing credentials to the App constructor
- **Bot mode constructor**: App receives `clientId`, `clientSecret`, `tenantId` in options
- **Mention stripping**: When `activity.text` contains `<at>Ouroboros</at> hello`, the text passed to `handleTeamsMessage` is `hello` (mention markup removed)
- **Mention stripping edge cases**: no mentions, multiple mentions, mention with extra whitespace, `activity.text` is undefined
- **Console log differs**: DevtoolsPlugin mode logs "with DevtoolsPlugin", bot mode logs "with Bot Service"

**Output**: Tests added to `src/__tests__/teams.test.ts`.
**Acceptance**: Tests FAIL (red) because dual-mode and mention stripping are not implemented yet.

### Unit 2b: Bot Mode and Mention Stripping -- Implementation

**What**: Update `startTeamsApp()` in `teams.ts`:
1. **Dual-mode detection**: Check `process.env.CLIENT_ID`. If set, run in bot mode (no DevtoolsPlugin). If not set, run in DevtoolsPlugin mode (existing behavior).
2. **Bot mode App config**:
   ```typescript
   const app = new App({
     clientId: process.env.CLIENT_ID,
     clientSecret: process.env.CLIENT_SECRET,
     tenantId: process.env.TENANT_ID,
   })
   ```
3. **Mention stripping**: Configure `activity.mentions` stripping. The Teams SDK v2 App constructor accepts `activity: { mentions: { strip: true } }` option, OR we strip manually from `activity.text` before passing to `handleTeamsMessage`. Check SDK types and use the built-in approach if available, otherwise implement manual stripping: remove all `<at>...</at>` tags and trim.
4. Update console.log to indicate which mode started.

**Output**: Updated `src/teams.ts`.
**Acceptance**: All Unit 2a tests PASS (green). `npm run build` succeeds.

### Unit 2c: Bot Mode and Mention Stripping -- Coverage and Refactor

**What**: Run coverage on dual-mode and mention stripping code. Fill gaps.
**Output**: Updated tests, 100% coverage.
**Acceptance**: `npm run test:coverage` shows 100% coverage on new/changed code. All tests green. No warnings.

### Unit 3: App Manifest and .env Setup

**What**: Create the Teams app manifest package and document the .env setup.
1. Create `manifest/` directory in project root with:
   - `manifest.json` (devPreview version, bot + CEA declarations)
   - `color.png` (192x192 placeholder icon -- simple solid color with "O" letter)
   - `outline.png` (32x32 transparent outline placeholder)
2. The manifest structure:
   ```json
   {
     "$schema": "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
     "manifestVersion": "devPreview",
     "version": "1.0.0",
     "id": "<appId from .env>",
     "developer": { ... },
     "name": { "short": "Ouroboros", "full": "Ouroboros Coding Agent" },
     "description": { "short": "Self-modifying coding agent", "full": "..." },
     "icons": { "color": "color.png", "outline": "outline.png" },
     "accentColor": "#4464ee",
     "bots": [{
       "botId": "<appId>",
       "scopes": ["personal"]
     }],
     "copilotAgents": {
       "customEngineAgents": [{
         "type": "bot",
         "id": "<botId>"
       }]
     },
     "validDomains": []
   }
   ```
3. Add a `manifest:package` npm script that creates a `manifest.zip` from the `manifest/` directory (for sideloading)
4. Document the `.env` setup in the manifest README or inline comments

Note: The `copilotAgents.customEngineAgents` type does not exist in the SDK's manifest TypeScript types (SDK only has `declarativeAgents`). The manifest is a standalone JSON file, not generated from SDK types, so this is not a blocker.

**Output**: `manifest/manifest.json`, `manifest/color.png`, `manifest/outline.png`, `manifest:package` script.
**Acceptance**: `npm run manifest:package` creates a valid `manifest.zip`. Manifest JSON validates against the devPreview schema.

### Unit 4: Sideload and Connect (Interactive)

**What**: Sideload the app into Teams and verify the bot connects. This unit is interactive.

Steps:
1. Start the dev tunnel: `devtunnel host ouroboros`
2. In a second terminal, start the bot: `npm run teams` (with `.env` loaded -- `source .env && npm run teams` or use `dotenv` package)
3. Upload the manifest zip to Teams:
   - Open Teams -> Apps -> Manage your apps -> Upload a custom app
   - Select `manifest.zip`
   - Install for personal use
4. Open 1:1 chat with "Ouroboros" bot
5. Send a test message
6. Verify: bot receives message, agent processes it, response streams back

**Output**: Bot sideloaded and responding in Teams.
**Acceptance**: A message sent in 1:1 Teams chat reaches the local bot, triggers the agent, and a response appears in the chat. Console logs show the message flow.

### Unit 5: End-to-End Validation (Interactive)

**What**: Comprehensive validation of all completion criteria, working together with the user. Test both surfaces systematically.

**5a: 1:1 Teams Bot Chat**
1. Send a simple text message -- verify streamed response appears
2. Send a message that triggers tool use (e.g. "read package.json") -- verify informative updates appear during tool execution ("running read_file (package.json)...") and then the streamed response
3. Verify streaming is buffered (not flickering per-token) -- response flows smoothly
4. Click the "Stop" button mid-stream -- verify streaming stops gracefully, no error in console
5. Check think tags -- send a message that triggers model thinking, verify no `<think>` content visible in Teams

**5b: Copilot Chat (CEA)**
1. Open Microsoft 365 Copilot Chat (https://m365.cloud.microsoft/chat or Teams Copilot)
2. Find and open the "Ouroboros" agent in Copilot Chat
3. Send a simple text message -- verify streamed response appears
4. Send a tool-triggering message -- verify informative updates and streamed response
5. Verify streaming quality and stop button work the same as 1:1

**5c: Regression**
1. Run full test suite: `npm test` -- all pass
2. Run coverage: `npm run test:coverage` -- 100% on new code
3. Build: `npm run build` -- no warnings
4. Verify DevtoolsPlugin mode still works: unset env vars, run `npm run teams`, test in DevtoolsPlugin UI

**5d: Completion Criteria Checklist**
Walk through every completion criterion and check it off.

**Output**: All completion criteria verified. Test results and any screenshots saved to artifacts directory.
**Acceptance**: All 16 completion criteria satisfied. Both surfaces working. All tests pass. No warnings.

## Execution

- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor (Units 1, 2)
- Commit after each phase (1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-23-1908-doing-wu15-real-teams/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away
- **Interactive units (0, 4, 5)**: Agent provides commands/instructions, user executes. Agent verifies results.
- **Environment loading**: Use `source .env` before `npm run teams` in bot mode, or add dotenv as a dev dependency

## Progress Log

