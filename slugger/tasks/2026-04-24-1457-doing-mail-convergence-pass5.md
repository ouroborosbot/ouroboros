# Mail Convergence Pass 5 Doing

Planning: `slugger/tasks/2026-04-24-1457-planning-mail-convergence-pass5.md`
Execution Mode: direct
Artifacts: `slugger/tasks/2026-04-24-1457-doing-mail-convergence-pass5/`

## Goal

Execute the fifth convergence pass on agent mail by aligning delegated historical retrieval with the way Slugger actually searches during live work.

## Completion Criteria

- [ ] Delegated `mail_search` finds older imported travel mail beyond the recent-window slice.
- [ ] `mail_search` supports simple `OR` disjunction queries that match when any term appears.
- [ ] Docs/tests clearly teach `mail_recent` versus `mail_search`.
- [ ] Coverage gate passes at 100% on changed code paths.
- [ ] Local runtime is rebuilt/reloaded and live-verified against Slugger’s setup.
- [ ] Slugger retries the summer-travel update in the audited iMessage lane and either updates the plan artifacts or produces the next real blocker.

## Code Coverage Requirements

- 100% coverage on new and modified code paths.
- Focus tests on historical delegated retrieval, `OR` query behavior, and retrieval-model docs.
- Run focused verification first, then the repo coverage gate.

## Units

### ✅ Unit 1a: Historical retrieval red tests

What:
- Add failing tests that bury delegated travel mail beneath a large newer message set and prove `mail_search` still finds it.

Acceptance:
- The previous recent-window behavior fails until the retrieval change lands.

### ✅ Unit 1b: Historical retrieval implementation

What:
- Make `mail_search` operate over the full visible scoped corpus instead of a recent-window slice.

Acceptance:
- Older imported HEY travel mail stays searchable inside a noisy delegated mailbox.

### ✅ Unit 2a: Natural-query red tests

What:
- Add failing tests for the simple `OR` disjunction pattern Slugger used in the audited travel-update lane.

Acceptance:
- The literal-only implementation fails until the disjunction support lands.

### ⬜ Unit 2b: Natural-query implementation and coverage closeout

What:
- Implement small, literal `OR` disjunction support, remove any unreachable helper branches, and close the remaining coverage gap honestly.

Acceptance:
- The changed retrieval logic is fully covered at 100% without fake branches or fake tests.

### ⬜ Unit 3: Runtime reload and watched Slugger retry

What:
- Reload the runtime from this worktree, verify live health, and watch the audited iMessage lane while Slugger retries the summer travel update from mail.

Acceptance:
- Live runtime reflects the retrieval fixes.
- Slugger either updates the travel plan artifacts or exposes the next concrete blocker through the audited lane.

## Notes

- Match Slugger’s natural behavior; do not teach around the bug.
- Keep the boundary sharp: mechanic fixes tooling, Slugger does the actual travel work.
- Prefer tiny truthful semantics over a grand search-language detour.

## Progress Log

- 2026-04-24 14:57 Doing doc created for the fifth convergence pass.
- 2026-04-24 14:57 Units 1a, 1b, and 2a were already substantially underway in the live pass and were captured here to preserve the paper trail before closing the remaining coverage/runtime/retry work.
