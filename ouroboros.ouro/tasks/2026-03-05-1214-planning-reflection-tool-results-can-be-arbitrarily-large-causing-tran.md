# Reflection Proposal: Tool results can be arbitrarily large, causing transcript/context bloat and degraded performance (and potential context overflows), with no standardized truncation or artifacting strategy.

**Generated:** 2026-03-05T12:14:09.005Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Tool results can be arbitrarily large, causing transcript/context bloat and degraded performance (and potential context overflows), with no standardized truncation or artifacting strategy.

## Proposal
Implement a centralized “tool output limiting” layer so every tool invocation returns a bounded-size result to the model, while optionally persisting the full output to an artifact file for later inspection.

Implementation steps:
1. **Add config knobs (non-breaking defaults):**
   - In `ouroboros/agent.json` (and its loader), introduce defaults like:
     - `toolOutput.maxChars` (e.g., 20_000)
     - `toolOutput.artifactDir` (e.g., `ouroboros/tool-outputs/`)
     - `toolOutput.writeArtifacts` (boolean, default true)
2. **Create a small utility to enforce limits:**
   - Add `src/repertoire/tool-output.ts` with a function like `limitToolOutput({ toolName, callId, content }): { contentForModel, artifactPath? }`
   - Behavior:
     - If output length <= maxChars: return as-is.
     - If larger: write full content to artifact file (named with timestamp + toolName + callId), and return a truncated prefix/suffix plus a pointer to the artifact path and original size.
3. **Wire it into the single tool execution choke point:**
   - Identify the shared tool dispatcher (likely in `src/repertoire/tools.ts` or `tools-base.ts`) where tool handlers return results.
   - Wrap *all* tool results through `limitToolOutput` before returning them to the provider/turn loop.
   - Ensure it handles both string outputs and structured outputs (e.g., JSON): serialize deterministically for sizing, or apply limits per top-level string fields.
4. **Add tests (contract-style):**
   - New tests under `src/__tests__/repertoire/tool-output.test.ts`:
     - Small output unchanged
     - Large output truncates and writes artifact
     - Artifact path is stable/predictable enough to assert (or mock filesystem writes)
     - No artifact writing when `writeArtifacts=false`
5. **Add minimal documentation:**
   - Update `ARCHITECTURE.md` (or a short doc in `ouroboros/skills/` if preferred) describing how large tool outputs are handled and where artifacts are stored.
6. **Run checks and commit:**
   - `npx tsc`, unit tests, coverage gate.
   - One focused commit message like: “Limit tool output size; write full output to artifacts”.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
