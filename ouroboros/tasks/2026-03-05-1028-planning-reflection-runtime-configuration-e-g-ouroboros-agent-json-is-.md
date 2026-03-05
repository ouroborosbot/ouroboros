# Reflection Proposal: Runtime configuration (e.g., `ouroboros/agent.json`) is not schema-validated, so malformed/partial configs can cause unclear startup failures or subtle misbehavior.

**Generated:** 2026-03-05T10:28:59.320Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Runtime configuration (e.g., `ouroboros/agent.json`) is not schema-validated, so malformed/partial configs can cause unclear startup failures or subtle misbehavior.

## Proposal
Add a lightweight, dependency-free config validation layer that runs at startup and in CLI entrypoints, producing actionable, path-specific errors (with defaults applied explicitly), plus tests to prevent regressions.

Implementation steps:
1. Locate the config loading path (likely `src/config.ts` or equivalent) and identify all config sources (`ouroboros/agent.json`, env vars, provider selection fields, context limits, phrase table settings).
2. Define a canonical TypeScript interface for the resolved config (if not already present) and separate it into:
   - `RawConfig` (as read from JSON/env)
   - `ResolvedConfig` (after defaults + normalization)
3. Implement `validateRawConfig(raw): ValidationResult` using explicit type guards (no new npm deps), validating:
   - required keys present
   - correct primitive types (string/number/boolean/arrays/objects)
   - numeric ranges (e.g., context limits > 0)
   - enums (provider names must be in the registered provider map)
   - unknown keys warning mode (collect warnings but don’t fail unless configured)
4. Implement `resolveConfig(raw): ResolvedConfig` that:
   - applies defaults in one place
   - normalizes values (trim strings, coerce safe numeric strings only if desired; otherwise error)
   - returns `{config, warnings}` so callers can surface non-fatal issues
5. Wire validation into startup/entrypoints (CLI + Teams adapter + reflection loop entry), so the process fails fast with a clear, multi-line report like:
   - `agent.json: providers.openai.model must be a string (got number)`
   - `agent.json: context.maxTokens must be > 0 (got -50)`
6. Add unit tests under `src/__tests__/` covering:
   - happy path minimal config
   - missing required field
   - wrong type
   - out-of-range numeric
   - unknown provider name
   - unknown keys produce warnings (and optionally a strict-mode failure if enabled)
7. Update `ARCHITECTURE.md` to document “Config validation & resolution” as part of initialization, including where to add new config keys safely.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
