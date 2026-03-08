# Doing: BlueBubbles iMessage Sense

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-07
**Planning**: /Users/arimendelow/Projects/ouroboros-agent-harness-bluebubbles/slugger/tasks/2026-03-07-2210-planning-bluebubbles-imessage-sense.md
**Artifacts**: ./slugger/tasks/2026-03-07-2210-doing-bluebubbles-imessage-sense/

## Objective
Implement a first-class `bluebubbles` sense for the harness that preserves the BlueBubbles primitives we observed live: message creation, message mutation, reply threading, attachment/OG-card context, and stable DM/group routing.

## Completion Criteria
- [ ] Harness exposes a first-class `bluebubbles` sense entrypoint alongside existing senses
- [ ] `Channel`/capability plumbing recognizes `bluebubbles` as a distinct sense
- [ ] Runtime config supports BlueBubbles without introducing environment variables
- [ ] Inbound BlueBubbles handling models both `new-message` and `updated-message`
- [ ] Reply threading works from `threadOriginatorGuid` in both DM and group contexts
- [ ] Reactions, edits, unsends, and delivery/read mutations are not silently dropped
- [ ] Session identity is stable for DM/group/thread-aware routing
- [ ] Attachment and OG-card handling give the agent useful context or an explicit fallback
- [ ] Automated tests cover all new code at 100%
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` passes
- [ ] No warnings

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

### ✅ Unit 1a: Channel And Config Contract — Tests
**What**: Add failing tests for the harness-level BlueBubbles contract in `src/__tests__/mind/friends/channel.test.ts`, `src/__tests__/mind/friends/types.test.ts`, and `src/__tests__/heart/config.test.ts`. Cover the new `bluebubbles` channel, its capabilities, the secrets/config surface, and fail-fast validation for incomplete BlueBubbles config.
**Output**: Failing tests that define the channel/config contract before any production changes.
**Acceptance**: Tests exist, fail red, and cover both happy path and invalid-config branches.

### ✅ Unit 1b: Channel And Config Contract — Implementation
**What**: Implement the approved harness contract in `src/mind/friends/types.ts`, `src/mind/friends/channel.ts`, `src/heart/config.ts`, `src/mind/prompt.ts`, `src/repertoire/tools.ts`, and any entrypoint/package wiring needed for a new sense script. Keep the config source-of-truth aligned with `agent.json` + `~/.agentsecrets/<agent>/secrets.json`.
**Output**: Production support for a `bluebubbles` sense with explicit capabilities and fail-fast config loading.
**Acceptance**: Unit 1a tests pass, build is clean, and no unrelated channels regress.

### ✅ Unit 2a: BlueBubbles Message Model — Tests
**What**: Add failing tests for a pure BlueBubbles normalization layer using the live payload shapes we captured. Cover `new-message`, `updated-message`, reply threading via `threadOriginatorGuid`, associated-message mutations for reactions, edit/unsend/update payloads, group vs DM identity, and OG-card/media attachment shapes.
**Output**: Fixture-backed failing tests for the sense’s core message model.
**Acceptance**: Tests fail red against the missing normalization/runtime code and cover every observed primitive that materially affects UX/AX.

### ✅ Unit 2b: BlueBubbles Message Model — Implementation
**What**: Implement the pure message-model layer and its helpers in new BlueBubbles sense modules under `src/senses/`. The model should preserve creation vs mutation as first-class distinctions, compute stable session/routing identity, and emit explicit fallback state for missing media hydration instead of silently dropping context.
**Output**: Pure BlueBubbles parsing/normalization modules ready to feed the sense runtime.
**Acceptance**: Unit 2a tests pass, all branches are covered, and the model matches the live-observed payload contracts.

### ⬜ Unit 3a: Sense Runtime Wiring — Tests
**What**: Add failing tests for the BlueBubbles runtime path: startup, entrypoint behavior, inbound event handling, session key derivation, friend resolution, reply-thread routing, and outbound send/update flow. Cover both DM and group shapes plus mutation events that previously disappeared in OpenClaw.
**Output**: Red tests for the actual sense runtime and its integration points.
**Acceptance**: Tests demonstrate the runtime behavior we expect before implementation lands.

### ⬜ Unit 3b: Sense Runtime Wiring — Implementation
**What**: Implement the BlueBubbles sense runtime and entrypoint in `src/senses/`, wire it into the harness runtime, and connect it to the message model from Unit 2. The runtime should treat event delivery as wakeup/input and use repair/enrichment when needed so mutations and rich content are not lost just because the first payload is incomplete. This unit should also wire the channel through the existing friend-resolution, system-prompt, and tool-selection paths rather than leaving BlueBubbles as a sidecar.
**Output**: Runnable `bluebubbles` sense entrypoint and supporting runtime code.
**Acceptance**: Unit 3a tests pass, build is clean, and the sense can be started with explicit BlueBubbles config.

### ⬜ Unit 4a: Mutation And Rich-Content Repair — Tests
**What**: Add failing tests for media/OG-card enrichment and message-update repair flows. Cover readable fallbacks when content cannot be hydrated, explicit error signaling instead of silent drops, and mutation persistence for reactions/edits/unsends/read-delivery updates.
**Output**: Failing tests that lock the “no silent failure” behavior into place.
**Acceptance**: Tests fail red and cover fallback, enrichment, and mutation persistence branches.

### ⬜ Unit 4b: Mutation And Rich-Content Repair — Implementation
**What**: Implement the enrichment/repair path needed by the sense so attachment/OG-card context and mutation updates reach the agent coherently. Keep the implementation small and auditable; prefer pure helpers plus a narrow runtime seam over broad adapter magic.
**Output**: BlueBubbles sense runtime that preserves rich/mutation context or emits explicit fallback state.
**Acceptance**: Unit 4a tests pass, no silent-drop paths remain in the new code, and the implementation remains reversible.

### ⬜ Unit 5a: Automated Verification
**What**: Run the full automated verification (`npm test`, `npx tsc --noEmit`, coverage on new code), fix anything still failing, and save command outputs in the artifacts directory.
**Output**: Passing automated checks with captured logs.
**Acceptance**: All automated checks pass, coverage is 100% on new code, and no warnings remain.

### ⬜ Unit 5b: Live Smoke Pass
**What**: Perform the best-available live smoke pass against the local BlueBubbles/OpenClaw environment to confirm the sense behaves coherently for DM/group replies, OG cards/media, and mutations.
**Output**: Saved verification notes/logs describing the live scenarios run and what was confirmed end to end.
**Acceptance**: The live smoke pass documents what was verified, any residual gaps are explicit, and the final completion criteria are supported by evidence.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each unit phase
- Push after each atomic commit
- Save logs, transcripts, and verification notes to `./slugger/tasks/2026-03-07-2210-doing-bluebubbles-imessage-sense/`
- No environment variables; use explicit config only
- Keep changes small, auditable, and reversible

## Progress Log
- 2026-03-07 22:15 Created from planning doc
- 2026-03-07 22:24 Unit 1a complete: added failing channel/config/prompt/tool-safety tests and captured red output
- 2026-03-07 22:26 Unit 1b complete: wired bluebubbles into channel types, config, prompt behavior, and remote tool safety
- 2026-03-07 22:40 Unit 2a complete: added fixture-backed red tests for message, thread, group, reaction, edit, unsend, and read-state normalization
- 2026-03-07 22:50 Unit 2b complete: implemented BlueBubbles event normalization with stable chat/thread identity, mutation modeling, explicit fallback text, and 100% coverage on the new model
