# Planning: Fix Agent Proactivity Bug

**Status**: drafting
**Created**: 2026-02-26 18:17

## Goal
Fix the bug where the agent narrates tool-call intentions ("let me read that file") but then fails to actually make the tool call, instead producing a text-only response. The agent should act rather than describe acting.

## Scope

### In Scope
- Analyze the system prompt (`SOUL.md`, `IDENTITY.md`, `buildSystem()` in `src/mind/prompt.ts`) for gaps in tool-use guidance
- Add explicit anti-narration / proactivity instructions to the system prompt
- Ensure instructions work for both Azure (Responses API) and MiniMax (Chat Completions API) providers
- Add/update the relevant psyche file(s) with clear tool-calling behavioral rules
- Tests for any new or changed prompt logic

### Out of Scope
- Changes to the agent loop in `src/engine/core.ts` (the loop correctly handles tool calls when the model produces them -- this is a prompt/behavioral issue)
- Changes to tool definitions in `src/engine/tools.ts`
- Changes to streaming logic in `src/engine/streaming.ts`
- Changes to channel adapters (CLI/Teams)
- Adding new tools or changing tool schemas

## Completion Criteria
- [ ] System prompt contains explicit instructions that prevent narration of tool intentions without follow-through
- [ ] Instructions cover: (a) act instead of describing, (b) never announce a tool call then skip it, (c) prefer tool calls over text descriptions of actions
- [ ] SOUL.md and/or a new psyche section reinforces proactive tool-use behavior
- [ ] `buildSystem()` integrates the new instructions
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
- [ ] Should the proactivity instructions be a new psyche file (e.g. `AGENCY.md`) or added to `SOUL.md` under a new section?
- [ ] Should the instructions be channel-specific (CLI vs Teams) or universal?
- [ ] Are there specific phrases/patterns the model produces that we should explicitly prohibit (e.g., "let me", "I'll go ahead and", "I would")?

## Decisions Made
- The root cause is prompt-level, not code-level. The agent loop in `core.ts` correctly executes tool calls when the model produces them. The issue is the model choosing to emit text describing tool intentions instead of emitting actual tool_calls.
- The existing SOUL.md has two relevant lines ("If a clear next action exists, I call a tool" and "Premature narration in execution mode is failure") but they are too brief and buried among abstract philosophy. The model needs more concrete, reinforced instructions.

## Context / References
- `docs/psyche/SOUL.md` -- current soul/behavior definition (lines 38-41 contain the two relevant execution-mode lines)
- `docs/psyche/IDENTITY.md` -- current identity/voice definition
- `src/mind/prompt.ts` -- `buildSystem()` assembles system prompt from psyche files + dynamic sections
- `src/engine/core.ts` -- agent loop (lines 205-206 show `done = true` only when no tool calls, confirming the loop is correct)
- `src/engine/tools.ts` -- tool definitions (read_file, write_file, shell, list_directory, git_commit, list_skills, load_skill, get_current_time, claude, web_search)

## Notes
The current `buildSystem()` assembles: SOUL + IDENTITY + LORE + FRIENDS + selfAware + provider + date + tools + skills. The tools section only lists tool names and descriptions -- no behavioral guidance about when/how to use them. The fix likely involves adding a dedicated "tool-use behavior" section.

## Progress Log
- 2026-02-26 18:17 Created
