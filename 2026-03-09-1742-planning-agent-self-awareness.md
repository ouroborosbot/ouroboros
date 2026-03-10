# Planning: Full Agent Self-Awareness

**Status**: drafting
**Created**: 2026-03-09 17:44

## Goal
Give agents full and proper self-awareness — the same level of awareness a person has about their own body. This includes understanding where/how they're running, how to modify their own bundle, the relationship between bundle and harness, fixing inner dialog so it feels like genuine inner dialog, and fixing cross-session communication so inner dialog and conversations can properly interact.

## Scope

### In Scope
- **A. Bundle vs. Harness awareness** — new system prompt section explaining what the bundle is, what the harness is, directory layout ("body map"), and where state/secrets live
- **B. Inner dialog reformation** — wire up `"inner"` channel properly (channel capabilities, buildSystem path, runAgent channel arg), create dedicated system prompt path that strips friend context/onboarding/greeting but adds metacognitive framing, reframe bootstrap/instinct user messages as first-person awareness instead of external commands
- **C. Cross-session plumbing and bidirectional loop** — C1: inner dialog drains its own pending dir before each turn (fixes CLI-to-inner-dialog). C2: daemon writes inter-agent messages to inner dialog's pending dir (fixes inter-agent-to-inner-dialog). C3: fix injection format so inner dialog notes arrive as context the agent sees but hasn't spoken yet (not fake conversation turns). C4: prompt guidance for the full bidirectional inner-dialog-to-conversation loop in both directions.
- **D. Self-evolution guide** — replace the single line "i can read and modify my own source code" with structured guidance on which psyche files to evolve and when, what tools to use for structured data, and what the runtime manages (don't touch)
- **E. Process awareness** — add process type and daemon status to runtimeInfoSection
- **F. Human inner dialog mapping validation** — ensure all 6 human-inner-dialog equivalents work after fixes

### Out of Scope
- Richer active sessions summary (e.g., last message preview) — deferred, OK for now
- Rethinking the instinct/heartbeat system architecture — just reframing messages for now
- New tools for self-awareness (the existing tools are sufficient)
- Changes to SOUL.md, IDENTITY.md, or any specific agent's psyche files
- "Speak first" / session-start logic — sessions are persistent (daemon keeps them alive via `ouro up`), so there is no meaningful fresh session case

## Completion Criteria
- [ ] `"inner"` channel has its own entry in `CHANNEL_CAPABILITIES` in channel.ts
- [ ] `buildSystem("inner")` produces a distinct prompt that includes psyche, runtime, tools, task board, skills, memory contracts but strips friend context, onboarding/first-impressions, and "i introduce myself on boot" greeting
- [ ] `buildSystem("inner")` includes metacognitive framing explaining that user messages represent the agent's own instinctual awareness
- [ ] `runInnerDialogTurn` passes `"inner"` (not `"cli"`) to both `buildSystem` and `runAgent`
- [ ] Inner dialog bootstrap message reads as first-person awakening, not external command
- [ ] Inner dialog instinct/heartbeat messages read as internal awareness, not external prompts
- [ ] `runInnerDialogTurn` drains `getPendingDir(agentName, "self", "inner", "dialog")` before building the user message, injecting results the same way drainInbox does
- [ ] Daemon `message.send` command (or message routing) writes inter-agent messages destined for an agent to that agent's inner dialog pending dir
- [ ] Pending messages from inner dialog to CLI are injected as context/awareness (not fake conversation turns) — agent sees the thought but hasn't spoken it yet, weaves it naturally into next response
- [ ] Pending messages from CLI to inner dialog (conversation outcomes sent back) are injected as context the inner dialog processes on its next turn
- [ ] System prompt includes bundle vs. harness explanation with directory layout
- [ ] System prompt includes self-evolution guide replacing the one-liner
- [ ] `runtimeInfoSection` includes process type (cli session / inner dialog / teams handler / bluebubbles handler) and daemon status
- [ ] Inner dialog prompt includes guidance for the full bidirectional loop: surfacing thoughts to conversations via send_message, and processing conversation outcomes that come back
- [ ] External channel prompts include guidance for the full bidirectional loop: weaving inner thoughts naturally ("oh, i was thinking about..."), and noting outcomes back to inner dialog to keep thinking current
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
- [ ] What exactly should the metacognitive framing say in the inner dialog system prompt? The system prompt needs to explain that "user" messages in this session are the agent's own instinctual prompts, not messages from a person. Need to get the framing right so the agent genuinely feels like it's thinking rather than being commanded.
- [ ] What injection format should replace the fake conversation turns for inner-dialog-to-CLI delivery? Options: (a) append to the system message as a transient section, (b) inject as a `role: "user", name: "harness"` message with clear framing like `[inner thought to surface: ...]`, (c) something else. The key constraint: the agent must see it as "a thought I had" not "something I already said."
- [ ] Should inner dialog get a richer active sessions summary? Currently it shows `friendName/channel/key (last: 5m ago)` — should it include a last-message preview so the agent has more context about what happened in other sessions? (Deferred for now.)
- [ ] Should inner dialog get the `contextSection` (friend context) for `friendId: "self"`? Currently it gets no friend context at all (no ResolvedContext passed). This seems correct — inner dialog has no "friend" — but worth confirming.

## Decisions Made
- **No "session start" case**: sessions are persistent (daemon keeps them alive via `ouro up`). There is no meaningful "fresh session" anymore. Inner dialog notes are injected as context for the agent's next response in an active conversation. The agent weaves them naturally ("oh hey, I was thinking about..."). No "speak first" logic needed.
- **Bidirectional inner dialog <-> conversation loop**: cross-session communication is a continuous loop, not a one-way pipe. Inner dialog surfaces thoughts via pending -> CLI agent weaves them naturally -> user responds -> CLI agent notes outcome back to inner dialog via send_message -> inner dialog processes it and continues thinking -> maybe spawns new thoughts to surface later. Both directions must feel instinctive.
- **Fix injection format**: the current fake-conversation-turn approach (injecting as user+assistant message pairs) is wrong. Inner dialog notes must arrive as context the agent sees but hasn't spoken yet. The agent should perceive them as "a thought I had" not "something I already said." Exact format TBD (see open questions).
- **Prompt guidance for the loop**: inner dialog prompt teaches surfacing thoughts and processing outcomes. External prompt teaches weaving inner thoughts naturally and noting outcomes back. Both sides close the loop.
- **Implementation order**: C1+C2 (plumbing) -> C3 (injection format fix) -> B (inner dialog reformation) -> A (bundle/harness) -> D (self-evolution) -> E (process awareness) -> C4 (loop prompt guidance)
- **Daemon writes to pending dir** for inter-agent messages (not polling) — simpler, unifies intra-agent and inter-agent delivery through one drain mechanism
- Inner dialog channel capabilities: same as CLI defaults (no markdown, streaming, rich cards, no integrations) — inner dialog is silent/headless, capabilities don't matter much
- Token budget: ~370 tokens added to external prompts (anatomy + self-evolution + process awareness), inner dialog likely net-neutral or saves tokens by stripping unused friend/onboarding sections
- The `"inner"` type already exists in the Channel union in types.ts — no type changes needed

## Context / References
- `src/mind/prompt.ts` — system prompt assembly (buildSystem, runtimeInfoSection, contextSection)
- `src/mind/friends/channel.ts` — CHANNEL_CAPABILITIES map (needs `"inner"` entry)
- `src/mind/friends/types.ts` — Channel type union (already includes `"inner"`)
- `src/senses/inner-dialog.ts` — inner dialog core (runInnerDialogTurn, buildInnerDialogBootstrapMessage, buildInstinctUserMessage)
- `src/senses/inner-dialog-worker.ts` — daemon subprocess entry (createInnerDialogWorker, handleMessage)
- `src/mind/pending.ts` — getPendingDir, drainPending
- `src/senses/cli.ts` — CLI session with drainToMessages pattern (line 742-749)
- `src/heart/daemon/daemon.ts` — OuroDaemon.handleCommand, message.send routing (line 453-463)
- `src/heart/daemon/message-router.ts` — FileMessageRouter (inter-agent JSONL inbox)
- `src/repertoire/tools-base.ts` — send_message tool (writes to pending dir, line 728-772)

### Verified current state
- `buildSystem("cli")` is called by inner dialog at line 174 of inner-dialog.ts — confirmed
- `runAgent(messages, callbacks, "cli", ...)` at line 210 of inner-dialog.ts — confirmed
- `"inner"` is NOT in `CHANNEL_CAPABILITIES` — only cli, teams, bluebubbles — confirmed
- `"inner"` IS in the Channel type union — confirmed
- Inner dialog bootstrap message uses third-person command style ("Orient yourself, decide what to do next") — confirmed
- Instinct message uses external command style ("Heartbeat instinct: check what changed...") — confirmed
- CLI's drainToMessages drains `getPendingDir(agentName, friendId, "cli", "session")` — confirmed
- Inner dialog does NOT drain any pending dir — the `drainInbox` callback exists but nobody provides messages through it — confirmed
- Daemon's `message.send` writes to router JSONL inbox + sends IPC `{ type: "message" }` to worker, but worker just runs a generic instinct turn without delivering content — confirmed
- send_message tool writes to `~/.agentstate/{agent}/pending/{friendId}/{channel}/{key}/` — confirmed, so `send_message(friendId="self", channel="inner", key="dialog")` would write to the right place IF inner dialog drained it

## Notes
The send_message tool already writes to the correct pending dir path when called with `friendId="self", channel="inner", key="dialog"`. The missing piece is that `runInnerDialogTurn` never calls `drainPending` on that dir. Fix C1 is literally: call `drainPending(getPendingDir(agentName, "self", "inner", "dialog"))` early in `runInnerDialogTurn` and inject the results the same way the existing `drainInbox` callback does. This single fix enables CLI-to-inner-dialog communication.

For inter-agent messages (C2), the daemon currently writes to `FileMessageRouter`'s JSONL inbox and sends an IPC poke. The simplest fix is to have the daemon ALSO write a pending file to the target agent's inner dialog pending dir when routing a message, so C1's drain picks it up automatically.

### Current broken injection format (C3 must fix)
CLI's `drainToMessages` (cli.ts line 742-749) currently injects pending messages as fake conversation turns:
```typescript
sessionMessages.push({ role: "user", name: "harness", content: `[proactive message from ${msg.from}]` })
sessionMessages.push({ role: "assistant", content: msg.content })
```
This is wrong for self-messages: it makes the agent think it already said the content (but the user never saw it), and "[proactive message from slugger]" doesn't make sense when Slugger IS the agent. The new approach must inject inner dialog notes as context the agent sees but hasn't spoken yet, so it can weave them naturally into its next response.

### Example bidirectional loop flow
```
Inner dialog: "I should ask Ari about the rollback plan"
    -> (pending note to CLI)
CLI: "oh hey -- was thinking about that deploy. what's your rollback plan?"
Ari: "we'll use blue-green with automatic failover"
    -> (send_message to self/inner)
Inner dialog: "Ari wants blue-green with auto failover.
              That changes the task scope -- update the plan."
    -> (continues thinking autonomously)
```

## Progress Log
- 2026-03-09 17:44 Created planning doc from user's detailed task description and codebase verification
- 2026-03-09 17:51 Added key decisions: no session-start case, bidirectional inner-dialog <-> conversation loop, fix injection format (no fake turns), daemon writes to pending dir, updated implementation order and completion criteria
