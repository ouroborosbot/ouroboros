# Unit 5b Live Smoke

## Setup
- Replayed real BlueBubbles webhook payloads captured in `/Users/arimendelow/.openclaw/logs/bluebubbles-observer.jsonl`.
- Used the local BlueBubbles server config already present in `/Users/arimendelow/.openclaw/openclaw.json`.
- Synced Slugger's local harness BlueBubbles secrets from that existing OpenClaw config so the real `bluebubbles-entry` could start normally.
- Suppressed outbound sends during replay by injecting a no-text/no-send `runAgent` stub, so the smoke pass exercised real BB repair/fetch without sending new iMessages.

## Scenarios Confirmed
- DM OG card replay: handled, notified the agent, preserved explicit link-preview fallback text.
- DM image replay: handled, notified the agent, preserved explicit image attachment context.
- DM voice-note replay: handled, notified the agent, preserved explicit audio attachment context.
- DM threaded reply replay: handled, notified the agent, preserved thread-aware session routing.
- Group threaded reply replay: handled, notified the agent, preserved group sender prefix plus thread-aware session routing.
- Group OG-card replay: handled, notified the agent, preserved group sender prefix plus explicit link-preview fallback text.
- Reaction replay: handled as a mutation, notified the agent, and recorded a mutation sidecar entry.

Structured results were saved to `/Users/arimendelow/Projects/ouroboros-agent-harness-bluebubbles/slugger/tasks/2026-03-07-2210-doing-bluebubbles-imessage-sense/unit-5b-live-smoke.json`.

## Live Entry Probe
- Started the real entrypoint with `node dist/senses/bluebubbles-entry.js --agent slugger`.
- Verified startup log: BlueBubbles sense started on port `18790`.
- Posted a captured `fromMe` payload to the live webhook.
- Verified live webhook response saved in `/Users/arimendelow/Projects/ouroboros-agent-harness-bluebubbles/slugger/tasks/2026-03-07-2210-doing-bluebubbles-imessage-sense/unit-5b-live-webhook-response.json`:
  - `{"handled":true,"notifiedAgent":false,"kind":"message","reason":"from_me"}`

## Residual Gap
- No live `updated-message` payload for edit/unsend/read/delivery was available in the observer capture used for replay.
- Those mutation shapes are covered by automated tests and by BlueBubbles source-path verification, but the live replay evidence in this pass covers `reaction` as the observed mutation primitive.
