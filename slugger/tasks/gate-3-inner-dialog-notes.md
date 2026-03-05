# Gate 3 Inner Dialog — Working Notes

Scratch notes from planning review. Will be folded into the planning doc once finalized.

## What inner dialog IS

- A self-initiated session (not friend-initiated)
- The supervisor starts it on boot
- Modeled on CLI session: same engine loop, same local tool access (shell, file, git, gh)
- Does NOT have Teams-specific/OAuth tools (same as CLI)
- Runs concurrently with friend sessions per existing multi-session pattern (see runtime hardening work)
- Persisted to disk, survives crashes, like any other session
- Session path: `~/.agentstate/<agent>/sessions/self/inner-dialog.json`

## Bootstrap

- System prompt: psyche + governance + recalled context (same as any session)
- Initial user message: gives the agent its bearings — aspirations, what's going on, orient yourself
- Exact bootstrap message content TBD by implementation

## Continuation: Inner Dialog Instincts

- When no human is talking to the agent, the harness needs to produce user-role messages to keep the agent going
- These are "inner dialog instincts" — the harness observes state and produces feedback/nudges
- Agent-configurable: the agent can shape what instincts it has and how they fire
- Instincts live in the agent's .ouro bundle (location TBD by implementation)
- The exact implementation (plugin system? config + code? markdown definitions?) is determined by Codex working with Ouroboros post-bootstrap
- This is a hyper-specific plugin system ONLY for autonomous sessions — friend sessions have humans providing user messages
- No steering follow-ups in inner dialog (those are for humans steering mid-turn)

## Context window

- Not a concern — ouroboros has custom context window management, won't get "full"
- Existing system prompt already tells agent anything not written down will be lost

## .ouro bundle layout (agreed so far)

- SELF-KNOWLEDGE.md is removed (was from overnight run being reverted) — becomes TACIT.md per migration plan
- skills/ stays as skills/ (industry term, agent-specific skills)
- subagents/ stays in repo root (shared amongst agents, different from agent skills)
- manifest/ renamed to something more specific (e.g. teams-app/) — Teams bot registration artifacts
- psyche/memory/ for three-layer memory system
- psyche/ASPIRATIONS.md for aspiration layer
- psyche/CONTEXT.md for dynamic session-start context
- Inner dialog instinct definitions live somewhere in the bundle (TBD)

## Cost / rest model

- No hardcoded cost caps in the architecture
- The agent learns when to work and when to rest through instincts and aspirations
- "Rest" does NOT mean off — it means alive but not actively burning tokens
- **Heartbeat**: harness-level default interval (configurable). Supervisor sends a periodic nudge into the inner dialog session. Agent checks in, decides if there's work to do, either works or goes back to rest.
- Resting = one cheap heartbeat turn every N minutes. Working = full active turns with tools.
- The agent self-regulates between work and rest based on its own judgment.

## Out of scope for Gate 3

- External event waking (git push, new task, etc.) — separate concern
- Session interaction model (how friend messages interleave with inner dialog) — existing multi-session concurrency handles parallel sessions, deeper interaction is Gate 10 daemon territory
- Detailed cost guardrails — developed collaboratively post-bootstrap
