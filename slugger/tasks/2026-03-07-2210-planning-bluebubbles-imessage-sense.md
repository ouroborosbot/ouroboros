# Planning: BlueBubbles iMessage Sense

**Status**: done
**Created**: 2026-03-07 22:10

## Goal
Add BlueBubbles-backed iMessage support as a first-class Ouroboros sense alongside CLI and Teams, using the live research we gathered to preserve iMessage-native UX/AX instead of inheriting OpenClaw's current channel confusion.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Add a modular `bluebubbles` sense in the harness alongside existing CLI and Teams senses.
- Design the sense around the observed BlueBubbles primitives: `new-message`, `updated-message`, `threadOriginatorGuid`, associated-message mutations, attachments, OG-card balloon payloads, group identity, and sender identity.
- Preserve thread-aware conversation handling with chat-level fallback when thread data is absent.
- Support a rich early feature envelope where it materially affects UX/AX: text, replies/threads, reactions, attachments/voice, edits, unsends, and read/delivery updates.
- Treat webhook delivery as wakeup/input, not the only truth source, so the sense can repair or enrich message state when BlueBubbles provides richer lookup by GUID.
- Keep failure behavior explicit and observable; no silent drops of routing, mutation, or media state.
- Carry the design forward in a way that can later consume Ouroboros-owned forks of `bluebubbles-server` and `bluebubbles-helper`.

### Out of Scope
- Final fork maintenance workflow for the `ouroborosbot` BlueBubbles forks.
- Non-iMessage channels or unrelated harness refactors.
- Secondary BlueBubbles affordances that do not materially change UX/AX, such as cosmetic effects-only support.
- Implementation details that can be finalized during doing work as long as they do not change approved UX/AX outcomes.

## Completion Criteria
- [x] Harness exposes a first-class `bluebubbles` sense entrypoint alongside existing senses.
- [x] The sense models both message creation and message mutation/update as first-class inbound primitives.
- [x] Thread-aware replies work in both DM and group contexts using BlueBubbles reply metadata when present.
- [x] Rich content handling covers plain links, OG cards, image/audio attachments, and clean fallback behavior when content cannot be hydrated.
- [x] Group conversations use stable routing/session identity that does not depend on a single surfaced email-or-phone representation.
- [x] The implementation does not fail silently on mutation/media/routing gaps.
- [x] 100% test coverage on all new code
- [x] All tests pass
- [x] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [x] Confirm the repo-local planning doc as the approved scope handoff for implementation in this worktree.

## Decisions Made
- BlueBubbles will be a separate modular sense, not folded into CLI, Teams, or a generic ad hoc channel.
- The sense should feel native to iMessage and reduce channel-state cognitive load on the agent instead of forcing the agent to infer routing/thread semantics from brittle text cues.
- Conversation handling is thread-aware/hybrid: use thread context when BlueBubbles provides it, otherwise fall back to chat-level continuity.
- Group participation should feel human and agent-decided, not rigidly mention-gated, though mention state can still be a hint.
- Rich text matters for Ouroboros-owned fork setups, but the public baseline must degrade cleanly to plain-text fallbacks.
- Slugger should be allowed to initiate outbound iMessages to known friends just as with other senses.
- Persisted sessions remain the harness source of truth, while the sense should still support current-thread lookup/repair when earlier context is needed.
- Nothing should fail silently.
- The sense should treat `updated-message` as part of the primary message model rather than as an optional special case.
- The harness should not rely on webhook-only truth for BlueBubbles; repair/enrichment by GUID is part of the approved product model.

## Context / References
- Prior planning and live research: `/Users/arimendelow/.Trash/AgentBundles/slugger.ouro/tasks/one-shots/2026-03-07-1847-bluebubbles-imessage-sense.md`
- OpenClaw live observer trace: `/Users/arimendelow/.openclaw/logs/bluebubbles-observer.jsonl`
- OpenClaw BlueBubbles extension used for live reconnaissance: `/Users/arimendelow/Projects/openclaw/extensions/bluebubbles/src`
- BlueBubbles docs: https://docs.bluebubbles.app/private-api
- BlueBubbles IMCore docs: https://docs.bluebubbles.app/private-api/imcore-documentation
- BlueBubbles REST/webhook docs: https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks
- BlueBubbles server source reviewed locally: `/tmp/bb-server.Te32xU`
- BlueBubbles helper source reviewed locally: `/tmp/bb-helper.tdzRyz`

## Notes
Live observation collapsed the major UX/AX unknowns. The most important findings were: replies thread via `threadOriginatorGuid`; OG cards are normal messages plus `URLBalloonProvider` and plugin payload attachments; inbound media blindness observed in OpenClaw was caused by post-webhook local attachment fetch blocking rather than missing BB attachment metadata; reactions arrive as associated-message mutations; edits/unsends are emitted upstream on `updated-message`; and current OpenClaw drops non-reaction `updated-message`, which is why live edits/unsends disappeared.

## Progress Log
- 2026-03-07 22:10 Created
- 2026-03-07 22:13 Approved from prior explicit direction to begin implementation in a dedicated worktree
- 2026-03-07 23:40 Implementation complete: BlueBubbles sense shipped with repair-by-guid, mutation logging, full automated verification, and live smoke evidence
