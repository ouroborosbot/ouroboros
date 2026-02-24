# Planning: WU1 -- Teams Bot <> Agent Locally (DevtoolsPlugin)

**Status**: NEEDS_REVIEW
**Created**: 2026-02-23

## Goal

Extract the ouroboros agentic loop into a channel-agnostic core, then wire it to a Teams bot adapter so a user can chat with the agent through the DevtoolsPlugin local UI -- proving the interface works before any cloud deployment.

## Scope

### In Scope

- Extract `runAgent()` from `agent.ts` into a new `core.ts` with a callback-based interface (`ChannelCallbacks`)
- Move `buildSystem()` and `isOwnCodebase()` to `core.ts` (used for system prompt construction, shared by all adapters)
- Refactor `main()` in `agent.ts` as a CLI adapter that calls `runAgent()` -- ANSI colors, spinner, think tag dimming preserved, plus CLI UX improvements:
  - Fix double message display (input echoed twice when you send)
  - Fix input during model calls (typed chars appear as garbage because raw mode is set wrong)
  - Ctrl-C clears current input instead of killing the process
  - Ctrl-C with empty input warns before exiting (confirmation)
  - Input history (up arrow for previous messages)
- Set up vitest as the test framework for ouroboros: add dev dependency, create vitest config, add test/coverage scripts to package.json
- Scaffold a Teams bot within the ouroboros repo (`teams-bot/` subdirectory) using `@microsoft/teams.apps` v2 with DevtoolsPlugin
- Wire a Teams adapter that calls `runAgent()` with Teams-specific callbacks
- Streaming text output in DevtoolsPlugin (token-by-token, following Teams SDK best practices)
- Informative status updates during tool execution (e.g. "running read_file (package.json)...")
- Think tag handling: CLI dims with ANSI (existing behavior), Teams strips them
- Single global messages array for WU1 (multi-user deferred to WU2)

### Out of Scope

- Real Teams connectivity (tunnels, bot registration, Azure AD) -- deferred to WU1.5
- Multi-user session handling -- deferred to WU2
- HTTP API wrapper around the agent -- deferred to WU3
- Any modification to tool definitions or tool handlers (they move to core unchanged)
- Any modification to the `flush()` think-tag logic -- it is a PROTECTED ZONE (closing tag `</think>`, offset 8)
- Adaptive cards or rich formatting in Teams responses (plain text streaming only for WU1)

## Completion Criteria

- [ ] `runAgent()` exported from `src/core.ts`, fully channel-agnostic (no `process.stdout`, no `process.stderr`, no ANSI codes)
- [ ] `ChannelCallbacks` interface covers all adapter needs: `onModelStart`, `onModelStreamStart`, `onTextChunk`, `onToolStart`, `onToolEnd`, `onError`
- [ ] CLI adapter (`agent.ts`) calls `runAgent()` -- boot greeting, ANSI think tag dimming, spinner on stderr, tool result summaries
- [ ] CLI UX fixes: no double message echo, no garbage chars during model calls, Ctrl-C clears input (or confirms exit if empty), up-arrow history
- [ ] Teams bot (`teams-bot/` subdirectory) starts with DevtoolsPlugin, imports `runAgent` from core
- [ ] Sending a message in DevtoolsPlugin UI triggers the ouroboros agent and streams a response
- [ ] Tool calls show informative updates in DevtoolsPlugin during execution
- [ ] Think tags stripped from Teams output (not shown to user)
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements

**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions

- [ ] Does `stream.update()` in DevtoolsPlugin get cleared/replaced when the first `stream.emit()` arrives, or do updates and content coexist? (Unit 0a spike will answer this)
- [ ] Does `stream.close()` require a final message body, or does it finalize whatever was emitted? (Unit 0a spike will answer this)
- [ ] Import strategy for `teams-bot/` subdirectory importing from `src/core.ts` -- relative imports, path aliases, or TS project references? (teams-bot is now inside the ouroboros repo, so this is simpler than cross-project)
- [ ] Should `runAgent()` push the user message onto the messages array itself, or should the adapter do it before calling? (Leaning: runAgent does it, keeps adapter simpler)

## Decisions Made

- **In-process function call, not HTTP**: The bot imports and calls `runAgent()` directly. No Express server or subprocess. This is Decision 2 from the locked plan.
- **DevtoolsPlugin only for WU1**: No tunnel, no bot registration, no Azure AD. Real Teams deferred to WU1.5. This is Decision 3 from the locked plan.
- **Teams SDK v2 (comms-only)**: Use `@microsoft/teams.apps` for the bot framework. Do NOT use the AI planner (`ActionPlanner`, `OpenAIModel`). This is Decision 1 from the locked plan.
- **Core does not process think tags**: Raw text including `<think>...</think>` passed to `onTextChunk`. CLI adapter dims them (flush logic, protected zone). Teams adapter strips them entirely. Two separate implementations.
- **Messages array owned by adapter, not core**: Adapter creates the array, passes it by reference. `runAgent()` mutates it (pushes user/assistant/tool messages). Enables WU2 multi-user later.
- **`buildSystem()` exported from core**: Adapters call it to set up the initial system message. Keeps system prompt logic centralized.
- **Teams bot lives inside ouroboros repo**: `teams-bot/` is a subdirectory of the ouroboros repo for WU1. No separate sibling repo. May be extracted later.
- **`onModelStart`/`onModelStreamStart` split**: Two callbacks because CLI needs spinner start on model-start and spinner stop on first-token. Teams needs "thinking..." on model-start. The split gives each adapter control over both moments.
- **Teams streaming required**: Token-by-token streaming in DevtoolsPlugin is a requirement. Implementation will follow Teams SDK v2 best practices (IStreamer API discovered in type definitions). Exact approach determined during implementation.
- **Test framework: vitest**: Fast, TS-native, good mocking support. Added as a dev dependency to ouroboros with config, test scripts, and coverage reporting.

## Context / References

- Locked plan: `/Users/microsoft/code/ouroboros/docs/grow-an-agent-server.md` (WU1 section, lines 90-197)
- Agent source: `/Users/microsoft/code/ouroboros/src/agent.ts` (261 lines)
- Skills module: `/Users/microsoft/code/ouroboros/src/skills.ts`
- Self-edit skill (protected zones): `/Users/microsoft/code/ouroboros/skills/self-edit.md`
- Echo bot template: `/tmp/test-bot/src/index.ts` and `/tmp/test-bot/package.json`
- Teams SDK IStreamer interface: `/tmp/test-bot/node_modules/@microsoft/teams.apps/dist/types/streamer.d.ts`
- Teams SDK activity context (exposes `stream` property): `/tmp/test-bot/node_modules/@microsoft/teams.apps/dist/contexts/activity.d.ts`
- ouroboros package.json: deps are `openai ^4.78.0`, devDeps `typescript ^5.7.0`, scripts `build: tsc`, `dev: tsc && node dist/agent.js`
- The `flush()` protected zone is at `agent.ts` lines 141-153. Closing tag `</think>`, offset 8. Do not modify.
- The agentic loop to extract is at `agent.ts` lines 210-251 (the `while (!done)` block inside `main()`)

## Notes

The prior doing doc (deleted) contained detailed implementation-level analysis (callback mapping table, code splits, adapter code sketches). Key observations are preserved below.

Key code-level observations from the prior analysis:
- `streamResponse()` mixes model-calling with CLI output (flush writes to stdout with ANSI). Must split: model-calling stays in core, text output goes through callbacks.
- `flush()` is CLI-specific ANSI logic. It moves to the CLI adapter's `onTextChunk`, not into core.
- `client`, `tools`, `toolHandlers`, `execTool()`, `summarizeArgs()` all move to core unchanged.
- `spinner`, `inputctrl`, readline setup, ANSI prompt stay in `agent.ts` (CLI adapter).
- CLI bugs to fix in Step 2:
  - Double message: readline `terminal: true` echoes input, then nothing clears it. Need to manage prompt/line clearing properly.
  - Garbage during waits: `suppress()` sets raw mode to `false` (wrong direction) -- chars typed during model calls echo to terminal. Should either stay raw and swallow input, or properly buffer/discard.
  - No Ctrl-C handling: no SIGINT handler at all. Need readline `close` event + SIGINT to clear line or confirm exit.
  - No history: readline supports history natively, just not wired up.
- `buildSystem()` and `isOwnCodebase()` move to core (used for system prompt construction).

## Progress Log

- 2026-02-23 14:57 Created planning doc (correcting process -- planning before doing)
- 2026-02-23 17:06 Applied review feedback: added buildSystem/isOwnCodebase to scope, added vitest setup to scope, teams-bot now subdirectory of ouroboros repo, streaming kept as requirement without locking implementation, CLI UX fixes confirmed in WU1
