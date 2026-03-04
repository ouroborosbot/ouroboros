# Final Audit: Turn Coordinator Steering Contract

## Scope Outcome
- Implemented shared channel-agnostic turn coordinator (`src/heart/turn-coordinator.ts`).
- Removed Teams hard reject-on-cap behavior and removed `maxConcurrentConversations` from runtime config surface.
- Added boundary-only steering follow-up injection in `runAgent` via `drainSteeringFollowUps` hook.
- Updated Teams runtime to steer same-conversation follow-ups into active turns without adapter-authored plain-text acknowledgements.

## Completion Criteria to Evidence

1. Teams no longer hard-rejects messages based on static concurrent-turn cap.
- Evidence:
  - `src/senses/teams.ts` no longer contains cap gate branch.
  - `src/__tests__/senses/teams.test.ts` includes `does not hard-reject concurrent conversations while one turn is in-flight`.
  - Passing run: `./unit-2a-test-run.txt` and `./unit-2b-test-run.txt`.

2. `teamsChannel.maxConcurrentConversations` fully removed from config schema/defaults/accessors/call sites.
- Evidence:
  - `src/config.ts` `TeamsChannelConfig` no longer includes `maxConcurrentConversations`.
  - `src/config.ts` default `teamsChannel` no longer contains the field.
  - `src/config.ts` `getTeamsChannelConfig()` returns explicit `{ skipConfirmation, disableStreaming, port }` only.
  - `src/__tests__/config.test.ts` asserts `maxConcurrentConversations` is undefined.

3. Shared turn coordinator exists and is used by Teams.
- Evidence:
  - New module: `src/heart/turn-coordinator.ts`.
  - Teams uses coordinator for turn ownership and steering buffer (`src/senses/teams.ts`).
  - Coordinator contract tests pass: `src/__tests__/heart/turn-coordinator.test.ts` (`./unit-2a-test-run.txt`).

4. Same-conversation follow-up messages during active turns are preserved and injected into active turn between model calls.
- Evidence:
  - Teams enqueues follow-ups when a conversation already has an active turn (`src/senses/teams.ts`).
  - `runAgent` drains follow-ups only at model-call boundaries (`src/heart/core.ts`).
  - Coverage tests for injection path pass (`src/__tests__/heart/core.test.ts`, `./unit-1c-coverage-run.txt`).

5. No steering follow-up dedupe/idempotency layer introduced.
- Evidence:
  - Coordinator stores follow-ups as appended entries and drains as-is (`src/heart/turn-coordinator.ts`).
  - Explicit test `does not dedupe steering follow-ups in this task scope` passes (`src/__tests__/heart/turn-coordinator.test.ts`).

6. Steering follow-ups injected as ordered discrete user messages.
- Evidence:
  - Coordinator preserves insertion order; drain returns ordered array (`src/heart/turn-coordinator.ts`).
  - Test `preserves steering follow-ups as ordered discrete messages` passes.

7. Steering injection occurs only at model-call boundaries.
- Evidence:
  - `runAgent` drains follow-ups at top of each loop before model call (`src/heart/core.ts`).
  - No mid-stream mutation path was added.
  - Test `injects steering follow-ups as ordered user messages before model calls` passes.

8. Buffered follow-ups that miss a boundary are carried into next turn.
- Evidence:
  - Follow-up buffers are not cleared on turn end; only cleared by `drainFollowUps` (`src/heart/turn-coordinator.ts`).
  - Test `keeps buffered follow-ups available across turn boundaries until drained` passes.

9. No adapter-authored plain-text steering acknowledgement messages.
- Evidence:
  - Steer path in `startTeamsApp` enqueues and returns without `stream.emit`/`ctx.send` text.
  - Test `same-conversation follow-up during active turn is steered without starting a second turn` asserts no emitted steering ack text.

10. Model receives all follow-up user messages for steering (none dropped).
- Evidence:
  - Buffer append-only behavior in coordinator and no dedupe in scope.
  - `runAgent` injection appends every drained follow-up as distinct user messages.

11. Single active-turn ownership per conversation preserved; different conversations remain parallelizable.
- Evidence:
  - Coordinator tests:
    - same key serialization
    - different key parallel execution
  - Teams conversation-level active turn gate in `startTeamsApp`.

12. Tests updated for coordinator contract, steering injection contract, and cap removal.
- Evidence:
  - Added/updated tests:
    - `src/__tests__/heart/turn-coordinator.test.ts`
    - `src/__tests__/heart/core.test.ts`
    - `src/__tests__/senses/teams.test.ts`
    - `src/__tests__/config.test.ts`

13. 100% coverage on all new code.
- Evidence:
  - `./unit-2b-coverage-run.txt` shows `All files ... 100` and full table at 100 across statements/branches/functions/lines.

14. All tests pass.
- Evidence:
  - `./unit-2b-test-run.txt`: `42 passed (42)`, `1266 passed (1266)`.

15. No warnings.
- Evidence:
  - `./unit-2b-build-run.txt` contains clean `tsc` invocation with exit code 0.
  - `./unit-2b-test-run.txt` and `./unit-2b-coverage-run.txt` complete with exit code 0.

## Verification Artifacts
- `./unit-1a-red-run.txt`
- `./unit-1b-test-run.txt`
- `./unit-1b-build-run.txt`
- `./unit-1c-coverage-run.txt`
- `./unit-1c-build-run.txt`
- `./unit-2a-test-run.txt`
- `./unit-2b-test-run.txt`
- `./unit-2b-coverage-run.txt`
- `./unit-2b-build-run.txt`
