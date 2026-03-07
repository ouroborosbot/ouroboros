# Doing: Wire `ouro` Command to Interactive Chat

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-07
**Planning**: /Users/arimendelow/AgentBundles/slugger.ouro/tasks/2026-03-07-ouro-command-wiring.md
**Artifacts**: ./2026-03-07-doing-ouro-command-wiring/

## Objective
`ouro` (bare command) IS chat. Running `npx ouro.bot` or `ouro` should land you in an interactive conversation with your agent. Wire `runOuroCli()` to call `cli.ts:main()` for all chat scenarios: single agent, multi-agent prompt, post-hatch, and direct `ouro <agent-name>`.

## Completion Criteria
- [ ] `ouro` with 0 agents → hatch → interactive chat with new agent
- [ ] `ouro` with 1 agent → interactive chat (REPL, not "connected to" message)
- [ ] `ouro` with multiple agents → interactive prompt → chat with selected agent
- [ ] `ouro <agent-name>` → chat with that agent (if agent exists)
- [ ] `ouro <agent-name>` with unknown agent → clear error
- [ ] `ouro hatch` → hatch → auto-open chat
- [ ] `ouro --help` → usage text
- [ ] `ouro stop|status|logs` → unchanged (daemon commands still work)
- [ ] Daemon auto-starts in background before chat opens
- [ ] REPL session persists (same session file, history preserved across runs)
- [ ] All tests pass
- [ ] No warnings
- [ ] 100% test coverage on new code

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD — no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

### ⬜ Unit 1a: Identity Setter — Tests
**What**: Write failing tests for `setAgentName(name)` in `identity.ts`. Test that calling `setAgentName("foo")` makes `getAgentName()` return `"foo"` without `--agent` in argv. Test that `resetIdentity()` clears it. Test interaction with cache (set, then get, then reset, then get should throw).
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 1b: Identity Setter — Implementation
**What**: Add `setAgentName(name: string)` to `identity.ts`. Sets `_cachedAgentName`. Update `getAgentName()` to not throw if cache is already primed (currently throws if `--agent` not in argv, but if cache is set via setter, it should return cache).
**Acceptance**: All tests PASS (green), build clean, no warnings

### ⬜ Unit 2a: `main(agentName?)` Parameter — Tests
**What**: Write failing tests for `cli.ts:main()` accepting an optional `agentName` parameter. Test that when `main("testAgent")` is called, `getAgentName()` returns `"testAgent"` within the main function's scope.
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 2b: `main(agentName?)` Parameter — Implementation
**What**: Change `main()` signature to `main(agentName?: string)`. If `agentName` provided, call `setAgentName(agentName)` at top. All downstream code (`getAgentRoot()`, `loadAgentConfig()`, etc.) works via cached identity.
**Acceptance**: All tests PASS (green), build clean, no warnings

### ⬜ Unit 3a: Daemon Auto-Start Helper — Tests
**What**: Extract daemon startup logic from `runOuroCli`'s `daemon.up` handler into `ensureDaemonRunning(deps)`. Write tests: daemon already running → no-op; daemon not running → starts it; stale socket → cleaned up and restarted.
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 3b: Daemon Auto-Start Helper — Implementation
**What**: Extract `ensureDaemonRunning(deps)` from the existing `daemon.up` block (lines 562-589). Returns `Promise<void>`. Reuse in `daemon.up` handler and before chat launch.
**Acceptance**: All tests PASS (green), build clean, no warnings

### ⬜ Unit 4a: Single Agent → Chat — Tests
**What**: Write tests for `runOuroCli([])` when `listDiscoveredAgents` returns exactly 1 agent. Should call `main(agentName)` (mock it) instead of sending `chat.connect` daemon command. Should call `ensureDaemonRunning` before chat.
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 4b: Single Agent → Chat — Implementation
**What**: In `runOuroCli`, when single agent discovered: call `ensureDaemonRunning(deps)`, then `await main(agentName)`. Import `main` from `cli.ts`. Add `startChat` to deps for testability.
**Acceptance**: All tests PASS (green), build clean, no warnings

### ⬜ Unit 5a: Multi-Agent Prompt + Agent-Name Shortcut + Help — Tests
**What**: Write tests for:
1. `runOuroCli([])` with multiple agents → calls `promptInput` with agent list, then `main(selected)`
2. `runOuroCli(["slugger"])` where "slugger" is a discovered agent → `main("slugger")`
3. `runOuroCli(["slugger"])` where "slugger" is NOT discovered → error message
4. `runOuroCli(["--help"])` → returns usage text
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 5b: Multi-Agent Prompt + Agent-Name Shortcut + Help — Implementation
**What**: Implement:
1. Multi-agent: prompt with numbered list, parse selection, call `main(selected)`
2. Agent-name shortcut: in `parseOuroCommand`, check if unknown command matches a discovered agent name → treat as chat
3. `--help` flag handling → return usage text
**Acceptance**: All tests PASS (green), build clean, no warnings

### ⬜ Unit 6a: Hatch → Auto-Chat — Tests
**What**: Write tests for `hatch.start` flow completing then calling `main(newAgentName)`. Mock `runHatchFlow` to return result, verify `main` is called with the hatched agent name. Verify daemon is started before chat.
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 6b: Hatch → Auto-Chat — Implementation
**What**: After `runHatchFlow` completes in the `hatch.start` handler, call `ensureDaemonRunning(deps)` then `await main(hatchInput.agentName)`.
**Acceptance**: All tests PASS (green), build clean, no warnings

### ⬜ Unit 7: Coverage & Refactor
**What**: Run full test suite + coverage. Verify 100% on all new/modified code. Clean up any dead code paths (e.g., old `chat.connect` daemon routing if fully replaced). Verify `cli-entry.ts` still works as standalone entry.
**Acceptance**: 100% coverage on new code, all tests pass, build clean, no warnings

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-07-doing-ouro-command-wiring/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away
- **No environment variables**: Pass state via explicit parameters only

## Progress Log
- 2026-03-07 Created from planning doc
