# Unit 3a Gap Matrix

## Required Section Matrix for `docs/cross-agent/testing-conventions.md`

| Required Section | Present in `CONTRIBUTING.md` | Gap | Needed in New Doc |
|---|---|---|---|
| Coverage policy and threshold enforcement details | Partial | No explicit threshold config ownership/process, no legacy-gap protocol | Yes |
| Strict TDD execution flow (red/green/refactor) | Partial | Present at high level but not operationally prescriptive for units/artifacts | Yes |
| Mocking conventions and patterns | Missing | No concrete mocking patterns, ordering rules, or isolation guidance | Yes |
| CI coverage gate expectations | Missing | No workflow contract, trigger expectations, or failure behavior | Yes |
| Artifact expectations for planning/doer execution | Missing | No required output/log artifact checklist for unit evidence | Yes |
| Verification checklist for completion criteria | Missing | No canonical checklist for final verification evidence | Yes |
| Cross-agent applicability statement | Missing | Existing guidance is contributor-oriented, not explicitly cross-agent shared policy | Yes |

## Summary
`CONTRIBUTING.md` should stay concise and link to a dedicated cross-agent testing conventions document containing the mandatory operational details listed above.
