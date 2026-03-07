# Doing: Token-budget–aware context trimming (token estimator + tool-coherent pruning)

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Replace the current “average per-message” trimming heuristic in `src/mind/context.ts` with a token-budget–aware approach that:
- Uses a lightweight, dependency-free token estimator to decide when/what to trim.
- Trims oldest *non-critical* history first while preserving:
  - All system message(s)
  - The most recent conversation turns (preferentially)
  - Tool-call + tool-result coherence (never keep one without the other)
- Applies a configurable safety margin (reuse existing `contextMargin`) so we aim below the hard limit to reduce overflow risk.
- Improves observability by emitting estimated token counts before/after trimming.

## Completion Criteria
- [ ] `trimMessages` trims based on estimated token usage (and optional actual usage), not average per-message cost.
- [ ] Trimming target uses safety margin: `targetTokens = maxTokens * (1 - contextMargin/100)`.
- [ ] All system messages are always preserved.
- [ ] Recent messages are preserved preferentially (only trimmed if unavoidable).
- [ ] Tool-call/tool-result pairs are kept coherent (dropped/kept together).
- [ ] Telemetry includes estimated token counts pre/post trim.
- [ ] All new/updated code has tests.
- [ ] All tests pass.

## Work Units

### ⬜ Unit 1a: Audit current trimming behavior — Tests (characterization)
**What**: Add/adjust characterization tests documenting current shortcomings that must be fixed:
- Current algorithm assumes uniform per-message token cost.
- It can drop tool-result messages without their initiating tool-call (or vice versa) when trimming by index.

**Files**:
- `src/__tests__/mind/context.test.ts`

**Acceptance**:
- Tests exist and FAIL (red) against current `trimMessages` implementation.
- At least one failing test demonstrates tool-call/tool-result incoherence risk.

---

### ⬜ Unit 1b: Add lightweight token estimator — Tests
**What**: Write failing tests for a dependency-free estimator.

**Design constraints**:
- No new npm dependencies.
- Use conservative heuristic: `ceil(chars / 4)` plus a per-message overhead.
- Include tool call names + arguments in estimation.

**Files**:
- Create `src/mind/token-estimate.ts` (preferred) *or* extend `src/mind/context.ts`.
- Create/extend tests in `src/__tests__/mind/token-estimate.test.ts` (new) or `src/__tests__/mind/context.test.ts`.

**Acceptance**:
- Tests exist and FAIL (red), covering:
  - String content estimation
  - Array/structured content handled safely (counts text-like fields, otherwise ignores)
  - Assistant `tool_calls` included in estimate
  - Tool messages include `tool_call_id` + content in estimate

---

### ⬜ Unit 1c: Add lightweight token estimator — Implementation
**What**: Implement estimator functions.

**Implementation notes**:
- Export:
  - `estimateTokensForMessage(msg: OpenAI.ChatCompletionMessageParam): number`
  - `estimateTokensForMessages(msgs: OpenAI.ChatCompletionMessageParam[]): number`
- Heuristic constants (module-level):
  - `CHARS_PER_TOKEN = 4`
  - `PER_MESSAGE_OVERHEAD_TOKENS = 10` (conservative)
- Ensure the estimator never throws; treat unknown content shapes as empty.

**Files**:
- `src/mind/token-estimate.ts` (or `src/mind/context.ts`)

**Acceptance**:
- All estimator tests PASS (green).

---

### ⬜ Unit 2a: Budget-driven trimming + invariants — Tests
**What**: Replace existing `trimMessages` expectations with contract tests that reflect the new behavior.

**Contracts to test** (per proposal):
1. **Stays under budget** (by estimator):
   - `estimateTokensForMessages(trimmed) <= targetTokens` where `targetTokens = maxTokens * (1 - contextMargin/100)`
2. **System preserved**:
   - All `role: "system"` messages remain in output.
3. **Recent preserved preferentially**:
   - When trimming is needed, older messages are removed first; newest N messages remain (unless impossible under budget).
4. **Tool coherence preserved**:
   - If an assistant message contains `tool_calls: [{ id: "X" ...}]`, then any `role:"tool"` message with `tool_call_id:"X"` is kept/dropped together with the assistant tool-call message.

**Files**:
- Update `src/__tests__/mind/context.test.ts`

**Acceptance**:
- Tests exist and FAIL (red) against current implementation.

---

### ⬜ Unit 2b: Budget-driven trimming + invariants — Implementation
**What**: Rework `trimMessages` to be explicitly token-budget–driven.

**Algorithm (concrete)**:
1. Compute:
   - `targetTokens = Math.floor(maxTokens * (1 - contextMargin / 100))`
   - `estimatedTotal = estimateTokensForMessages(messages)`
2. Decide whether to trim:
   - Trim if `estimatedTotal > targetTokens`.
   - If `actualTokenCount` is provided and `actualTokenCount > maxTokens`, treat as a strong signal to trim, but still use estimator to choose what to drop.
3. Preserve invariants:
   - Keep **all** system messages.
   - Build trim **blocks** after system messages so tool-call + tool-result stay coherent:
     - When encountering an assistant message with `tool_calls`, group it with the immediately-following contiguous `role:"tool"` messages.
     - Other messages form single-message blocks.
   - Prefer to keep the most recent blocks (e.g. keep last 2–3 blocks as “recent”), only trimming them if the budget cannot be met otherwise.
4. Trim oldest blocks first until `estimateTokensForMessages(result) <= targetTokens`.
5. Fallback: if still above target with only system + recent blocks, progressively drop the oldest remaining non-system blocks (even among “recent”) until within target; final floor is “system-only”.

**Telemetry**:
- Keep existing `mind.step_start` / `mind.step_end` events.
- Add meta fields:
  - `estimated_before`, `estimated_after`, `targetTokens`, `trimmed`
  - `actualTokenCount` (existing)

**Files**:
- `src/mind/context.ts`
- `src/mind/token-estimate.ts` (if created)

**Acceptance**:
- All context trimming tests PASS (green).
- `trimMessages` does not mutate its input array.
- Tool coherence tests pass (never orphan tool messages or tool-call messages).

---

### ⬜ Unit 3a: Update call sites & backward compatibility — Tests
**What**: Update any tests affected by changed trimming behavior in cold-start paths (where `usage` is undefined).

**Key expectation changes**:
- Previously: “no trimming when actualTokenCount is undefined”.
- Now: trimming may occur if estimated tokens exceed the target even without actual usage data.

**Files**:
- `src/__tests__/mind/context.test.ts`
- Any other failing tests discovered by running `vitest`.

**Acceptance**:
- Tests updated to align with new contract and FAIL (red) until implementation is complete.

---

### ⬜ Unit 3b: Update call sites & backward compatibility — Implementation
**What**: Ensure runtime behavior remains correct across:
- `postTurn(...)` (session persistence)
- overflow-retry trimming in `src/heart/core.ts`
- CLI + Teams channels

**Implementation notes**:
- Prefer not to change public function signatures.
- If a signature change is unavoidable, update:
  - `src/mind/context.ts`
  - `src/heart/core.ts`
  - `src/senses/cli.ts`
  - `src/senses/teams.ts`
  - all related tests

**Files**:
- `src/mind/context.ts`
- (only if needed) `src/heart/core.ts`, `src/senses/cli.ts`, `src/senses/teams.ts`

**Acceptance**:
- `postTurn` still trims + saves sessions.
- Overflow retry path still trims and retries safely.

---

### ⬜ Unit 4a: Observability: context trim debug event — Tests
**What**: Extend existing observability tests to assert meta includes estimated token counts.

**Files**:
- `src/__tests__/mind/context.test.ts`

**Acceptance**:
- Tests exist and FAIL (red) until instrumentation is updated.

---

### ⬜ Unit 4b: Observability: context trim debug event — Implementation
**What**: Add estimated token telemetry to `emitNervesEvent` meta in `trimMessages`.

**Files**:
- `src/mind/context.ts`

**Acceptance**:
- Observability tests PASS (green).

---

### ⬜ Unit 5: Run gates
**What**: Run typecheck + unit tests.

**Commands**:
- `npm test` (or `npx vitest run`)
- `npx tsc -p tsconfig.json`

**Acceptance**:
- No TypeScript errors.
- All unit tests pass.

## Progress Log
- 2026-03-05 Created from reflection proposal
