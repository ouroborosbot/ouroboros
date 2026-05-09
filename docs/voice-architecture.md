# Voice Architecture

Voice is a first-class Ouro sense. SIP, Twilio, browser meetings, local
microphones, and future direct agent-to-agent audio are transports under that
sense.

The AX rule is simple: the agent is speaking by Voice. Provider names describe
how audio reaches the room; they do not define the agent's identity, memory, or
durable conversation channel.

## Sense Ownership

The Voice sense owns:

- stable voice session keys and text transcripts
- agent identity and spoken style guidance
- voice-native prompt compaction
- voice-specific tools such as `voice_end_call` and `voice_play_audio`
- overview UI transcript behavior
- call/meeting routing policy and audit events

Transports own connection mechanics:

- phone number ingress/egress
- media framing and codec conversion
- browser or device automation
- provider-specific webhooks and call IDs
- provider-specific hangup, transfer, or playback commands

Transport connection IDs are metadata. They must not become the canonical
session. A Twilio `CallSid`, OpenAI SIP `call_id`, browser tab id, or meeting
participant id can identify one live connection; the Voice session key should
represent the stable speaking channel.

## Transport Families

### Twilio Media Stream Phone

This is the current working phone alpha.

The phone number terminates at Twilio, Twilio streams bidirectional audio to
Ouro, and Ouro connects that stream to OpenAI Realtime. This keeps maximum local
control: Ouro can inspect raw frames, tune interruption behavior, inject short
audio clips, and maintain compatibility with the older Whisper.cpp plus
ElevenLabs cascade.

The cost is latency and bridge complexity. There are two realtime systems in
the loop: Twilio media streams and OpenAI Realtime over WebSocket. Ouro must
manage playback buffers, truncation, VAD edge cases, and provider call state.

Use this transport when:

- we need immediate compatibility with the existing number and tunnel
- we need raw call-media control such as `voice_play_audio`
- SIP provisioning is not complete
- we want a conservative rollback path for phone calls

### OpenAI SIP Phone

OpenAI SIP is the preferred phone-number transport whenever a phone or meeting
lane can route media over SIP. It is not Twilio-only.

The general shape is:

1. A SIP trunk provider owns or routes the phone number.
2. The SIP trunk points at OpenAI's SIP endpoint for the project.
3. OpenAI emits `realtime.call.incoming` to an Ouro webhook.
4. Ouro accepts or rejects the call with the Realtime call API.
5. Ouro opens a Realtime control WebSocket for the accepted `call_id`.
6. Ouro keeps the same Voice session, transcript, tool, and call-control model.

Twilio Elastic SIP Trunking is one SIP trunk provider that can do this. It is
not the substrate. Telnyx, SignalWire, Vonage/Plivo, a carrier SIP trunk, or a
self-hosted PBX/SBC may also fit if they can route the number to OpenAI's SIP
URI, preserve the metadata we need, and meet reliability and control
requirements.

SIP should improve latency for ordinary phone conversation because the live
media leg goes directly into OpenAI Realtime instead of through Ouro as a
frame-forwarding bridge. It should also reduce the amount of provider-specific
media code Ouro has to maintain.

SIP does not remove Ouro from the loop. Ouro still owns acceptance policy,
session keys, transcript persistence, voice tools, outbound intent, identity,
and audit.

Open questions before replacing Twilio Media Streams:

- How should arbitrary non-speech playback map to SIP calls? The current
  Twilio transport can inject raw audio frames. The SIP transport may need
  OpenAI Realtime audio-item support, provider-side media injection, or a
  narrower first version of `voice_play_audio`.
- What is the cleanest outbound call flow? Inbound SIP is direct: trunk to
  OpenAI, webhook to Ouro. Outbound likely means the SIP provider originates a
  call to the human and bridges/refers it to the OpenAI SIP endpoint, while
  Ouro creates and monitors the Realtime session.
- Which SIP provider gives the best mix of latency, caller ID control,
  webhook/API quality, number portability, pricing, and operational visibility?

Current implementation:

- `voice.twilioConversationEngine=openai-sip` makes the existing Twilio Voice
  webhook return `<Dial><Sip>` to OpenAI's project SIP endpoint. This is the
  first reversible SIP path because it keeps the existing number and fallback
  Twilio webhook in place while moving live media to OpenAI SIP.
- OpenAI posts `realtime.call.incoming` to
  `/voice/agents/<agent>/sip/openai`; Ouro verifies the OpenAI webhook
  signature, accepts the call, opens the Realtime control WebSocket, sends the
  first voice turn, records transcripts, runs voice tools, and maps
  `voice_end_call` to OpenAI's call hangup endpoint.
- Arbitrary non-speech call audio is not yet implemented for SIP. Until that
  has a real media primitive, `voice_play_audio` is exposed only on the Twilio
  Media Stream Realtime lane.

Decision: if a transport can use SIP for a live phone-number style audio leg,
prefer SIP. Keep Media Streams as fallback and as the current raw-audio
injection path.

### Browser And Meeting Voice

Browser meeting voice remains a separate Voice transport, not a SIP
replacement.

SIP should be used for meeting transports when the meeting exposes a SIP or
phone dial-in and the job is just conversational audio. That path loses
browser-only context: screen state, chat, participant UI, waiting rooms, mute
controls, captions, file shares, and provider-specific meeting affordances.

For Google Meet, Riverside, Zoom, Teams, or browser-only podcast rooms, Ouro
needs a browser/WebRTC lane that can join the room, route microphone/speaker
audio, and optionally observe meeting UI. That transport should still write the
same Voice transcript and expose the same voice tools where possible.

### Local And Direct Voice

Local microphone/speaker and future direct agent-to-agent voice should also sit
under Voice. These lanes may connect to OpenAI Realtime by WebRTC or WebSocket
without any phone provider at all.

## Identity And Providers

The agent should have one coherent spoken identity for a transport family. Do
not present ElevenLabs, OpenAI Realtime, Twilio, and meeting voices as multiple
canonical selves.

Current direction:

- OpenAI Realtime is the live conversation center.
- The current native phone model default is `gpt-realtime-2`, with
  `gpt-realtime-whisper` used for Realtime transcription metadata.
- `voice.openaiRealtimeVoice` is the current phone voice selector.
- `voice.openaiRealtimeVoiceStyle` is the transport-level spoken identity
  target, for example "scrappy, upbeat, warm, lightly British".
- `voice.openaiRealtimeVoiceSpeed` can lightly bias cadence without changing
  identity; keep it conservative because phone calls need clarity.
- `marin` and `cedar` are the quality-first OpenAI Realtime voice candidates,
  but agents may audition another supported voice when identity fit matters.
- Slugger's current phone direction is a Realtime audition shaped as scrappy,
  upbeat, warm, lightly British, masculine/neutral-masc, and not posh or
  announcer-like.
- ElevenLabs is legacy cascade compatibility unless a future non-redundant use
  earns it a specific role.

Useful non-redundant ElevenLabs roles would need to be explicit, such as
offline voice rendering, long-form produced audio, or a fallback lane when
Realtime is unavailable. It should not remain just because it can also speak.

## Implementation Direction

Keep the code vocabulary aligned with the architecture:

- `voice` is the sense.
- `PhoneTransport` or equivalent is the phone-number adapter boundary.
- `TwilioMediaStreamPhoneTransport` is the current implementation.
- `OpenAISipPhoneTransport` is the target implementation.
- `BrowserMeetingVoiceTransport` is the meeting/browser implementation.
- `voice_end_call` and `voice_play_audio` are Voice call tools whose transport
  implementations may differ.

The SIP thin slice proves:

1. A Twilio-routed phone call reaches OpenAI SIP.
2. Ouro receives and verifies `realtime.call.incoming`.
3. Ouro accepts the call with Slugger's voice-native session configuration.
4. Slugger greets and converses through the same stable Voice session.
5. Transcripts persist in the same overview-visible text path.
6. `voice_end_call` maps to the OpenAI call-control API.
7. Twilio Media Streams remains available as fallback until SIP has parity for
   non-speech call audio, provider failure recovery, and richer operations.
