# diagnose-bootstrap-drift

Bootstrap drift fires when the agent's declared intent (`agent.json`) and its observed runtime binding (`state/providers.json`) disagree on provider or model.

## Inputs from the finding inventory

- `driftFindings: DriftFinding[]` — emitted by `detectProviderBindingDrift` (Layer 4). Each entry has:
  - `agent: string`
  - `kind: "provider-mismatch" | "model-mismatch" | "missing-binding"`
  - `intent: { provider: string; model: string }` — what `agent.json` declares
  - `observed: { provider?: string; model?: string }` — what `state/providers.json` records (or absent)

## Diagnosis

| `kind` | What it means | Proposed action |
|---|---|---|
| `provider-mismatch` | `state/providers.json` records a different provider than `agent.json` declares | `provider-use` pinning the intended provider |
| `model-mismatch` | Same provider, different model | `provider-use` pinning the intended model |
| `missing-binding` | `state/providers.json` has no entry for this agent's provider | `provider-auth` to re-run the provider auth flow |

## Proposed action shapes

```json
{
  "kind": "provider-use",
  "agent": "slugger",
  "provider": "anthropic",
  "model": "claude-opus-4-7",
  "reason": "drift: agent.json declares anthropic/claude-opus-4-7 but state/providers.json recorded openai/gpt-4o"
}
```

```json
{
  "kind": "provider-auth",
  "agent": "slugger",
  "provider": "anthropic",
  "reason": "drift: state/providers.json has no anthropic binding"
}
```

## When NOT to fire

- If `driftFindings` is empty — nothing to diagnose.
- If the intent itself is malformed (no provider declared in `agent.json`) — that's a separate class of failure; surface in `notes` instead of proposing an action.
