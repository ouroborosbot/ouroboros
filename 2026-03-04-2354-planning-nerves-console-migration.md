# Planning: Replace console.* calls with emitNervesEvent

**Status**: drafting
**Created**: 2026-03-04 23:54

## Goal
Eliminate all `console.log/warn/error` calls from production source files by converting them to structured `emitNervesEvent()` calls, and register the new events in the nerves coverage contract so the CI audit gate passes.

## Scope

### In Scope
- Convert 10 console.* calls in `src/senses/teams.ts` to emitNervesEvent
- Convert 2 console.* calls in `src/heart/core.ts` to emitNervesEvent
- Convert 1 console.* call in `src/mind/friends/resolver.ts` to emitNervesEvent
- Convert 1 console.* call in `src/identity.ts` to emitNervesEvent (already has a nerves event alongside it -- remove the redundant console.warn)
- Add all new required events to `REQUIRED_EVENTS` in `src/nerves/coverage/contract.ts`
- Ensure tests emit every new required event so `npm run test:coverage` passes
- Follow existing naming conventions (component:event format)

### Out of Scope
- `src/senses/cli.ts` (4 calls) -- these are user-facing terminal output (`console.log` for greeting, session cleared, command dispatch, goodbye). They write to the user's terminal as part of the CLI UX, not for logging/observability. Keep as console.
- `src/cli-entry.ts` (1 call) -- fatal startup error before any config/logger is initialized. Runs at module top-level before imports. Keep as console.
- `src/teams-entry.ts` (1 call) -- same pattern as cli-entry.ts. Keep as console.
- `src/nerves/coverage/cli.ts` (2 calls) -- the nerves audit tool's own CLI output. Keep as console.
- Adding nerves events to files that don't currently have console.* calls
- Refactoring the nerves system itself

## Completion Criteria
- [ ] Zero `console.*` calls in `src/senses/teams.ts`, `src/heart/core.ts`, `src/mind/friends/resolver.ts`
- [ ] The one `console.warn` in `src/identity.ts` is removed (nerves event already exists there)
- [ ] All new events registered in `REQUIRED_EVENTS` in `contract.ts`
- [ ] `npm run test:coverage` passes (nerves audit gate green)
- [ ] No sensitive data (tokens, secrets) in event meta (respect SENSITIVE_PATTERNS)
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
- [ ] For `src/heart/core.ts` lines 72-82 (getProviderRuntime fatal errors): these call `process.exit(1)` immediately after the console.error. Should we emit a nerves event before exiting, or are these effectively dead-on-arrival paths that can't meaningfully log? (The runtime logger may not be initialized yet at this point.)
- [ ] For `src/senses/teams.ts` line 684 (startup message "Teams bot started on port..."): should this become an info-level nerves event, or remain as console since it's a human-visible startup banner?

## Decisions Made
- CLI user-facing output (`src/senses/cli.ts`) stays as `console.log` -- it's UX, not logging
- Entry point files (`cli-entry.ts`, `teams-entry.ts`) keep `console.error` -- they fire before the module system is loaded
- Nerves audit CLI (`src/nerves/coverage/cli.ts`) keeps `console.*` -- it's the audit tool's own output
- `src/identity.ts` line 169: the `console.warn` is redundant with the `emitNervesEvent` on line 170-176; just remove the console.warn

## Context / References
- `src/nerves/runtime.ts` -- `emitNervesEvent()` API: `{ level?, event, trace_id?, component, message, meta? }`
- `src/nerves/coverage/contract.ts` -- `REQUIRED_EVENTS` array, `SENSITIVE_PATTERNS` regexes
- `src/nerves/coverage/audit.ts` -- how the audit collects observed events and checks coverage
- Existing naming conventions from `REQUIRED_EVENTS`:
  - `engine:engine.turn_start`, `engine:engine.error`
  - `channels:channel.message_sent`, `channels:channel.error`
  - `config/identity:config.load`, `config/identity:identity.resolve`
  - Pattern: `{component}:{component_prefix}.{action}`
- Proposed new event names for teams.ts:
  - `channels:channel.verify_state` (success/failure via level)
  - `channels:channel.message_received`
  - `channels:channel.token_status`
  - `channels:channel.signin_result`
  - `channels:channel.signin_error`
  - `channels:channel.handler_error`
  - `channels:channel.unhandled_rejection`
  - `channels:channel.app_error`
  - `channels:channel.app_started`
- Proposed new event names for other files:
  - `engine:engine.provider_init_error` (core.ts)
  - `friends:friends.persist_error` (resolver.ts)
- Branch: `ouroboros/nerves-console-migration`

## Notes
- The identity.ts console.warn (line 169) already has a nerves event emitted on the very next line (170-176). This is purely a deletion -- no new event needed.
- core.ts getProviderRuntime has two console.error calls followed by process.exit(1). These are fatal initialization failures. Even if we add nerves events, the logger may not be initialized. Worth discussing in open questions.
- teams.ts has the most calls (10) and will need careful attention to SENSITIVE_PATTERNS -- token status logging must not include actual token values (current code only logs "yes"/"no" which is safe).

## Progress Log
- 2026-03-04 23:54 Created
