# Reflection Proposal: Tool outputs/logs are not proactively redacted for secrets, risking accidental credential exposure via transcripts, nerves events, or saved artifacts.

**Generated:** 2026-03-05T11:16:58.354Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Tool outputs/logs are not proactively redacted for secrets, risking accidental credential exposure via transcripts, nerves events, or saved artifacts.

## Proposal
Implement a lightweight, centralized secret-redaction layer and apply it to all built-in tool outputs (and any tool-side logging) before results are returned to the model and/or emitted to observability.

Implementation steps:
1. Add a new utility module, e.g. `src/repertoire/redact.ts`, that exports:
   - `redactSecrets(text: string): string`
   - `redactInObject<T>(value: T): T` (deep-walk JSON-like objects, redacting string fields)
   Include conservative patterns for common secret formats (e.g., `Authorization: Bearer ...`, `ghp_...`, Azure DevOps PAT-like base64-ish tokens, `xoxb-...`, `-----BEGIN ... PRIVATE KEY-----`, `client_secret=...`, etc.), plus basic “password=”, “token=” key/value heuristics.
2. Apply redaction in each core tool implementation in `src/repertoire/tools-base.ts` (and other `tools-*.ts` files as needed):
   - For tools returning stdout/stderr or file contents (`shell`, `read_file`, `gh_cli`), run redaction on returned strings.
   - For structured results, run `redactInObject` before returning.
   This avoids touching `heart/core.ts` (which would be review-gated).
3. Add tests under `src/__tests__/repertoire/redact.test.ts`:
   - Unit tests for each redaction pattern (positive matches) and for “safe” strings (non-matches).
   - A deep-object redaction test to ensure nested fields are sanitized.
4. Add integration-level tests for at least one tool wrapper (e.g., `gh_cli` and `shell`) to assert that secrets present in mocked output do not appear in the returned tool result.
5. Update `ARCHITECTURE.md` (self-model) to note the presence of a redaction layer in `repertoire/` and its intent (prevent credential exposure in tool results/logs).
6. Run `npx tsc` + test suite + coverage gate to ensure no regressions; commit as a focused PR (“Redact secrets in tool outputs”).

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
