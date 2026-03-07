# Doing: Cross-Session Awareness

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-07
**Planning**: /Users/arimendelow/AgentBundles/slugger.ouro/tasks/2026-03-07-cross-session-awareness.md
**Artifacts**: ./2026-03-07-doing-cross-session-awareness/

## Objective
Give the agent coherent self-awareness across all its modes of existence. Layer 1 (awareness): system prompt metadata showing all active sessions. Layer 2 (recall): `query_session` tool for on-demand summarization. Layer 3 (action): `send_message` tool with pending-messages queue and `fs.watch` delivery. Session invariant enforcement. Channel type consolidation.

## Completion Criteria
See planning doc for full list (30+ items). Key gates:
- [ ] `Channel` type defined once, imported everywhere (including `"inner"` variant)
- [ ] `buildSessionSummary()` in system prompt with active sessions metadata
- [ ] `query_session` tool with trust-gated LLM summarization
- [ ] `send_message` tool with pending queue, `fs.watch` delivery, crash safety
- [ ] `validateSessionMessages()` for session invariant enforcement
- [ ] CLI pending queue drain (gated: idle or post-turn only)
- [ ] 100% test coverage on all new code
- [ ] All tests pass, no warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**

## TDD Requirements
**Strict TDD -- no exceptions.**
1. Tests first: Write failing tests BEFORE any implementation
2. Verify failure: Run tests, confirm they FAIL (red)
3. Minimal implementation: Write just enough code to pass
4. Verify pass: Run tests, confirm they PASS (green)
5. Refactor: Clean up, keep tests green

## Work Units

### Legend
- Not started / In progress / Done / Blocked

### Unit 1: Channel Type Consolidation ✅
**What**: Define `Channel = "cli" | "teams" | "inner"` once in a shared location. Update all 3 existing definitions (prompt.ts:53, friends/types.ts:71, trust-gate.ts:18) to import from the single source. Add `"inner"` variant.
**Tests**: Type-level tests + verify imports compile. Existing tests must still pass.
**Acceptance**: Single `Channel` definition, all imports updated, all tests pass.

### Unit 2: buildSessionSummary (Layer 1: Awareness) ✅
**What**: Add `buildSessionSummary(agentName, currentFriendId, currentChannel, currentKey)` to `src/mind/prompt.ts`. Scans `~/.agentstate/<agent>/sessions/` directory tree. Returns `## active sessions` metadata block with friend name, channel, key, last activity timestamp. Excludes current session. Resolves friend UUIDs to display names via direct file read from bundle `friends/` dir. `"self"` maps to agent's own name.
**Tests**: Mock fs to simulate session directory structure. Test: multiple sessions listed, current session excluded, friend names resolved, empty sessions dir returns empty block, "self" resolved to agent name.
**Acceptance**: Tests pass, `buildSessionSummary()` integrated into `buildSystem()`.

### Unit 3: Session Invariant ✅
**What**: Add `validateSessionMessages(messages)` function. Checks that after system message, sequence is always user -> assistant (with optional tool calls/results) -> user -> assistant. Never assistant -> assistant without user in between. Returns violations array. Called in `saveSession()` and `loadSession()`. Repair: merge consecutive assistants.
**Tests**: Valid sequences pass, invalid sequences (back-to-back assistant) detected, repair merges correctly, tool call sequences validated.
**Acceptance**: Tests pass, validation wired into save/load paths.

### Unit 4: query_session Tool (Layer 2: Recall) ✅
**What**: Add `query_session` tool to `src/repertoire/tools-base.ts`. Schema: `{ sessionPath, messageCount? }`. Loads last N messages from target session file, calls LLM for summarization with trust-level context in the prompt. Self-queries (from inner dialog, no friend context) use fully transparent summarization.
**Tests**: Mock session file + LLM call. Test: loads correct session, passes trust level to summarization prompt, self-query is transparent, handles missing session file.
**Acceptance**: Tests pass, tool registered in definitions.

### Unit 5: send_message Tool + Pending Queue (Layer 3: Action) ✅
**What**: Add `send_message` tool. Schema: `{ to, channel, thread?, content, context }`. Validates friend exists, resolves channel, writes pending file to `~/.agentstate/<agent>/pending/<friendId>/<channel>/<key>/<timestamp>-<uuid>.json`. Rejects self-send to current session. No daemon routing.
**Tests**: Mock friend store + fs. Test: writes pending file, rejects self-send, validates friend exists, handles missing friend.
**Acceptance**: Tests pass, tool registered, pending files written correctly.

### Unit 6: CLI Pending Queue Drain ✅ (drain module; CLI wiring deferred to Unit 8)
**What**: Add `fs.watch` drain to CLI. Gated: `drainable` flag false during `runAgent()`, true at prompt. On startup: drain offline messages. While idle: drain immediately on watch event. After postTurn: check `pendingDirty`, drain if set. Drain pushes harness-context + assistant-content pairs to in-memory messages array. Crash safety: rename to `.processing` before delivery, delete after. Retry `.processing` on startup.
**Tests**: Mock fs.watch + readline. Test: startup drain, idle drain, gated drain during runAgent, crash safety rename flow, processing file retry.
**Acceptance**: Tests pass, CLI drain integrated.

### Unit 7: Post-Turn System Prompt Refresh ✅
**What**: Extract `refreshSystemPrompt()` from `runAgent()` in core.ts. Call after `postTurn()` in CLI and inner dialog senses. Prompt sits ready in `messages[0]` for next turn.
**Tests**: Verify system prompt is refreshed after postTurn, not stale.
**Acceptance**: Tests pass, prompt refresh extracted and wired.

### Unit 8: Coverage & Integration
**What**: Run full test suite + coverage. Verify 100% on all new/modified code. Clean up dead code. Verify all completion criteria from planning doc.
**Acceptance**: 100% coverage on new code, all tests pass, build clean.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-07-doing-cross-session-awareness/` directory
- **No environment variables**: Pass state via explicit parameters only
