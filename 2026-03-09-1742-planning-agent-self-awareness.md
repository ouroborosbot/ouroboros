# Planning: Full Agent Self-Awareness

**Status**: drafting
**Created**: 2026-03-09 17:44

## Goal
Give agents full and proper self-awareness — the same level of awareness a person has about their own body. This includes understanding where/how they're running, how to modify their own bundle, the relationship between bundle and harness, fixing inner dialog so it feels like genuine inner dialog, and fixing cross-session communication so inner dialog and conversations can properly interact.

## Scope

### In Scope
- **A. Bundle vs. Harness awareness** — new system prompt section explaining what the bundle is, what the harness is, directory layout ("body map"), and where state/secrets live
- **B. Inner dialog reformation** — wire up `"inner"` channel properly (channel capabilities, buildSystem path, runAgent channel arg), create dedicated system prompt path that strips friend context/onboarding/greeting but adds metacognitive framing, reframe bootstrap/instinct user messages as first-person awareness instead of external commands
- **C. Cross-session plumbing, bidirectional loop, smart routing, and proactive outreach** — C1: inner dialog drains its own pending dir before each turn (fixes CLI-to-inner-dialog). C2: daemon writes inter-agent messages to inner dialog's pending dir (fixes inter-agent-to-inner-dialog). C3: fix injection format so inner dialog notes arrive as context the agent sees but hasn't spoken yet (not fake conversation turns). C4: prompt guidance for the full bidirectional inner-dialog-to-conversation loop in both directions. C5: proactive outreach via external channels -- BB and Teams senses poll their pending dirs and send outbound messages via their existing APIs. C6: channel-agnostic `send_message` with smart routing -- agent says "tell Ari this" and the system picks the best channel.
- **D. Self-evolution guide** — replace the single line "i can read and modify my own source code" with structured guidance on which psyche files to evolve and when, what tools to use for structured data, and what the runtime manages (don't touch)
- **E. Process awareness** — add process type and daemon status to runtimeInfoSection
- **F. Human inner dialog mapping validation** — ensure all 6 human-inner-dialog equivalents work after fixes

### Out of Scope
- Richer active sessions summary (e.g., last message preview) — deferred, OK for now
- Rethinking the instinct/heartbeat system architecture — just reframing messages for now
- New tools for self-awareness (the existing tools are sufficient)
- Changes to SOUL.md, IDENTITY.md, or any specific agent's psyche files
- "Speak first" / session-start logic — sessions are persistent (daemon keeps them alive via `ouro up`), so there is no meaningful fresh session case
- Automatic cross-channel content injection — would be expensive and noisy (iMessage conversation might be unrelated to CLI conversation). Cross-channel awareness handled via prompt guidance + inner dialog instead.

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
- [ ] Inner dialog prompt includes guidance for the full bidirectional loop: surfacing thoughts to conversations via send_message, and processing conversation outcomes / deeper-thinking requests that come back
- [ ] External channel prompts include guidance for the full bidirectional loop: weaving inner thoughts naturally ("oh, i was thinking about..."), noting outcomes back to inner dialog to keep thinking current, AND noting things that need deeper thought to inner dialog for later processing
- [ ] `send_message` tool `channel` parameter is optional -- when omitted, system does smart routing
- [ ] Smart routing: checks for active CLI session (via session lock liveness) first, then picks most recently used always-on channel (BB/Teams), then falls back to channel-agnostic queue
- [ ] Smart routing avoids dual-delivery -- one delivery, best channel
- [ ] When `channel` IS specified in `send_message`, it is used directly (backward compat)
- [ ] BlueBubbles sense periodically polls its pending dir and sends outbound messages via the BB API (sendText)
- [ ] Teams sense periodically polls its pending dir and sends outbound messages via the Bot Framework
- [ ] Proactive outreach respects trust level -- only sends to friends with trust level "family" or "friend" (no strangers, no acquaintances)
- [ ] Proactive outreach only sends to 1:1 conversations (no group chats)
- [ ] Proactive outreach looks up the friend's external address (iMessage handle, AAD ID) from the friend record's externalIds
- [ ] Teams proactive outreach uses existing Bot Framework 1:1 conversation creation (same API as `teams_send_message` tool)
- [ ] Inner dialog prompt guidance includes cross-channel awareness (review recent sessions across all channels during heartbeat/thinking)
- [ ] External channel prompt guidance includes checking other channels for context when relevant (via `query_session`)
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
- **Bidirectional inner dialog <-> conversation loop**: cross-session communication is a continuous loop, not a one-way pipe, and the loop can start from EITHER direction. (1) Inner-dialog-initiated: inner dialog surfaces thoughts via pending -> CLI agent weaves them naturally -> user responds -> CLI agent notes outcome back to inner dialog -> inner dialog processes and continues thinking. (2) Conversation-initiated: someone says something that needs deeper thought -> CLI agent notes it to inner dialog -> inner dialog processes deeply, explores options -> surfaces conclusions back in next CLI response. This mirrors how humans think -- sometimes you decide to bring something up, sometimes someone says something and you chew on it and come back later with a considered answer. Both directions must feel equally natural and instinctive. The agent shouldn't think of these as "sending messages to myself" -- it should feel like "thinking about it" and "bringing up what I was thinking."
- **Fix injection format**: the current fake-conversation-turn approach (injecting as user+assistant message pairs) is wrong. Inner dialog notes must arrive as context the agent sees but hasn't spoken yet. The agent should perceive them as "a thought I had" not "something I already said." Exact format TBD (see open questions).
- **Prompt guidance for the loop**: inner dialog prompt teaches surfacing thoughts and processing conversation outcomes / deeper-thinking requests that come back. External prompt teaches weaving inner thoughts naturally, noting outcomes back, AND noting things that need deeper thought to inner dialog. The loop can start from either side. Framing should feel like "thinking about it" and "bringing up what I was thinking" -- not "sending messages to myself."
- **Implementation order**: C1+C2 (plumbing) -> C3 (injection format fix) -> C6 (smart routing) -> C5 (proactive outreach via BB/Teams) -> B (inner dialog reformation) -> A (bundle/harness) -> D (self-evolution) -> E (process awareness) -> C4 (loop prompt guidance)
- **Channel-agnostic `send_message` with smart routing (C6)**: agent calls `send_message(friendId, content)` with NO channel. System routes: (1) is there an active CLI session with this friend right now? (liveness check via session lock, not recency) -> inject as context. (2) No active CLI -> pick the most recently used always-on channel (iMessage vs Teams, whichever the friend last messaged on -- recency IS the right signal for always-on channels). (3) Nothing available -> queue for next interaction. This avoids dual-delivery: one delivery, best channel. When `channel` IS specified, use it directly (backward compat). CLI liveness detected via session lock file (PID alive check). Session recency detected via session file mtime.
- **Proactive outreach via external channels (C5)**: each sense process polls its own pending dir and sends outbound via its existing API. ~20 lines of real code per sense. No new daemon commands, no new IPC, no new protocols. Guards: only send to friends with trust level "family" or "friend", only 1:1 (no group chats). Essential for iMessage AX -- friends text each other unprompted.
- **iMessage-specific AX**: proactive texts are natural (friends text unprompted). Inner dialog thoughts should be split into short messages for phone (not one wall of text). Timing doesn't matter -- iMessage is inherently async. Don't proactively text strangers or group chats.
- **Cross-channel continuity via prompt guidance + inner dialog, NOT automatic injection**: friend identity is already unified across channels (same friendId via externalIds array). `query_session` already works cross-channel. Active sessions summary shows metadata. No automatic cross-channel content injection -- would be expensive and noisy. Instead: (1) inner dialog proactively reviews recent sessions across all channels during heartbeat/thinking, keeping its awareness current across the full cross-channel picture. (2) CLI/Teams/BB prompts guide agent to check other recent sessions via `query_session` when context seems relevant. (3) Inner dialog surfaces cross-channel insights when it detects connections across conversations.
- **Teams proactive messaging uses existing API**: `teams_send_message` tool already exists (tools-teams.ts lines 204-252), creates 1:1 conversations with `isGroup: false` via Bot Framework API, uses AAD object ID from friend record externalIds. Teams sense pending drain uses the SAME Bot Framework API -- no new proactive messaging infrastructure needed. Both BB and Teams follow identical pending drain pattern: periodic poll -> look up friend's external ID -> send via existing API -> delete pending file.
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
- `src/senses/bluebubbles.ts` — BB event handler (handleBlueBubblesEvent, friend resolution via imessage-handle provider)
- `src/senses/bluebubbles-client.ts` — BB client with sendText(chat, text) for outbound messages
- `src/senses/teams.ts` — Teams handler (handleTeamsMessage, sendMessage callback from bot framework ctx.send)
- `src/senses/session-lock.ts` — session lock mechanism (acquireSessionLock writes PID to `{sessPath}.lock`, used for CLI liveness detection)
- `src/repertoire/tools-teams.ts` — `teams_send_message` tool (lines 204-252, creates 1:1 Bot Framework conversation with `isGroup: false`, uses AAD object ID)

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
- BB client has `sendText(params: { chat, text, replyToMessageGuid? })` — confirmed, existing send infrastructure
- BB resolves friends via `imessage-handle` provider, externalId is the iMessage handle (phone/email) — confirmed
- BB distinguishes group vs 1:1 via `event.chat.isGroup` — confirmed, group chats use `group:` prefixed externalId
- Teams handler receives `sendMessage` callback from bot framework (`ctx.send`) — confirmed, existing send infrastructure
- Teams resolves friends via `aad` provider, externalId is the AAD user ID — confirmed
- Neither BB nor Teams sense processes currently drain any pending dir — confirmed, they only respond to inbound messages
- CLI session lock: `acquireSessionLock` writes PID to `{sessPath}.lock` with `flag: "wx"` (exclusive create), checks `isProcessAlive` for stale locks — confirmed, can be used for CLI liveness detection by smart routing
- Session files live at `~/.agentstate/{agent}/sessions/{friendId}/{channel}/{key}.json` — mtime can be used for recency ranking among always-on channels
- `teams_send_message` tool exists at tools-teams.ts lines 204-252 — confirmed: creates 1:1 conversation with `isGroup: false`, uses AAD object ID, Bot Framework `conversations.create` + `activities.create` API
- `query_session` tool exists at tools-base.ts line 678 — confirmed: works cross-channel (friendId + channel param), already supports reading any session including bluebubbles/teams from CLI
- Friend identity is unified across channels — same friendId resolved via externalIds array with provider-specific entries (aad, local, imessage-handle) — confirmed via FriendResolver and FileFriendStore

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

### Pending dir drain status by channel

| Channel | Currently drains pending? | Sends how? |
|---|---|---|
| CLI | Yes (session start + after turn) | Injects as context |
| Inner dialog | No (planned: C1) | Injects as awareness |
| BlueBubbles | No (planned: C5) | Sends via BB API (sendText) |
| Teams | No (planned: C5) | Sends via Bot Framework (ctx.send) |

### C6 smart routing mechanism
When `send_message` is called without a `channel`:
1. Look up the friend's session lock files for CLI sessions. If a lock exists and the PID is alive -> route to CLI pending dir (liveness, not recency).
2. If no active CLI -> check session files for always-on channels (BB, Teams). Among channels with running senses, pick the one with the most recent session file mtime for this friendId.
3. Write to that channel's pending dir.
4. If no senses running -> write to a channel-agnostic pending queue for next interaction.

Key insight: CLI liveness is binary (session lock alive = reachable, otherwise not). Always-on channel selection uses recency as the tiebreaker (both are always reachable if the sense is running, so pick whichever the friend last interacted on).

### Teams proactive messaging (C5 implementation detail)
`teams_send_message` already implements the full proactive messaging flow: create 1:1 conversation with `isGroup: false` via Bot Framework API, then send activity. Teams sense pending drain uses the exact same API pattern. The conversations API is accessed through `ctx.botApi.conversations` which is available in the Teams sense process context. Both BB and Teams follow the identical pattern for C5: periodic poll -> look up friend's external ID from friend record -> send via existing API -> delete pending file.

### C5 proactive outreach mechanism
Each sense process adds a periodic check (every few seconds):
1. Scan pending dirs for their channel (e.g. `~/.agentstate/{agent}/pending/{friendId}/bluebubbles/{key}/`)
2. Read friend record to get external address (iMessage handle from externalIds, AAD ID)
3. Guard: skip if trust level is not "family" or "friend", skip if group chat (externalId starts with `group:`)
4. Send via the channel's existing API
5. Delete pending file

### Example smart-routed iMessage proactive outreach flow
```
2:35 PM - Ari texts: "what do you think about adding a health endpoint to the daemon?"
Slugger: "ooh ya that could be useful. let me chew on it"
  -> notes to inner dialog

3:00 PM - Inner dialog heartbeat
  -> picks up the note, reads daemon code, forms opinion
  -> calls send_message(friendId=ari, content="thought about the health endpoint...")
  -> smart routing: is Ari in CLI right now? no (closed window)
  -> smart routing: which always-on channel most recent? iMessage (texted 30 min ago)
  -> writes to BB pending dir

3:05 PM - BB sense polls pending, finds outbound message
  -> looks up Ari's iMessage handle from friend record
  -> sends via BlueBubbles API
  -> Ari's phone buzzes with a text from Slugger

Ari: "ya do it"
Slugger creates task. Loop complete.
```

### Example bidirectional loop flows

**Loop starting from inner dialog:**
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

**Loop starting from conversation:**
```
Ari: "I'm not sure the current deploy strategy is right for production"
    -> CLI agent notes to inner dialog: "Ari wants to rethink the deploy strategy"
    -> CLI responds: "that's a good point -- let me think about that"
Inner dialog picks it up, explores options, weighs tradeoffs
    -> (pending note to CLI)
CLI: "I've been thinking about what you said about deploys --
      blue-green with auto failover would handle the rollback concern
      and we could keep the zero-downtime guarantee..."
```

## Progress Log
- 2026-03-09 17:44 Created planning doc from user's detailed task description and codebase verification
- 2026-03-09 17:51 Added key decisions: no session-start case, bidirectional inner-dialog <-> conversation loop, fix injection format (no fake turns), daemon writes to pending dir, updated implementation order and completion criteria
- 2026-03-09 17:53 Added decision: loop starts from either direction (inner-dialog-initiated OR conversation-initiated), updated completion criteria and prompt guidance to cover both, added conversation-initiated example flow
- 2026-03-09 18:16 Added decision: channel-agnostic send_message with smart routing (C6) -- agent says "tell Ari this" without specifying channel, system routes via CLI liveness check then always-on channel recency. Updated completion criteria, implementation order, verified session lock mechanism for CLI liveness detection
- 2026-03-09 18:24 Added decisions: cross-channel continuity via prompt guidance + inner dialog (no automatic injection), Teams proactive messaging uses existing Bot Framework API. Verified teams_send_message tool, query_session cross-channel support, unified friend identity. Added to out of scope, completion criteria, verified state.
