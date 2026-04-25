# Travel Grounding Pass 1

Date: 2026-04-24 20:20 America/Los_Angeles
Branch: `slugger/mail-convergence-pass1`

## Prompt Shape

- Ari says Slugger's current summer-travel picture is still wrong.
- Important constraint: do not tell Slugger the missing fact; failure to recover it from mail/travel evidence is a harness failure.
- Additional ask: if the moved-earlier outbound created a Zurich overnight before Basel, provide concrete one-night stay suggestions.
- Keep the exchange in audited Messages/iMessage.

## Immediate Observations

- Current travel docs are still missing at least one booked stay between Basel and Italy.
- Current docs also do not contain Zurich one-night stay suggestions.
- `bookings.md` currently says `Switzerland after Basel -> Milan` is `TO BE PLANNED`.
- `itinerary.md` currently keeps Aug 4-7 as `Second Switzerland base — TBD`.

## Evidence Sweep

- Structured search over `state/mail-search/*.json` surfaced only a small visible set of obviously relevant travel confirmations:
  - Chase Travel Basel hotel: Trip ID `1015943428`
  - Lufthansa/Edelweiss SEA -> ZRH booking and cancellation
  - Aer Lingus MXP -> DUB / DUB -> SEA booking and schedule change
- No obvious accommodation between Basel and Italy surfaced from that cache-level scan.
- The cache itself should not be treated as the full imported corpus; it is a search/result surface, not proof that only a few messages exist.
- Raw `.mbox` grep is noisy because some messages are encoded in ways that are not straightforwardly searchable with plain `rg`.

## Runtime / AX Hypotheses

1. The missing stay is present in delegated mail but is not discoverable enough through current mail retrieval ergonomics.
2. The missing stay is present, but Slugger's retrieval/query strategy is still too brittle around hotel/vendor phrasing.
3. The missing stay lives outside the currently indexed search surface, which would be a more serious harness bug.

## Confirmed Harness Bug

- Imported-archive fallback search was prefiltering on raw MBOX bytes before parsing the message.
- That means quoted-printable / HTML-heavy booking mail could be present in the archive yet fail fallback discovery unless it had already been cached from some previous successful read.
- This is a plausible root cause for "mail clearly exists but Slugger can't recover it" failures around travel confirmations.

## Actions Taken

- Sent an audited Messages prompt to Slugger asking for a no-hints re-audit of delegated mail and travel artifacts, with a clean closeout format.
- Explicitly instructed him not to ask Ari for the missing fact unless truly blocked after exhausting available evidence.
- Created a thread heartbeat automation (`Slugger Mail Convergence`) every 30 minutes so the loop wakes back up without relying on memory.
- Patched imported-archive fallback search to match on parsed message text rather than only raw archive bytes.
- Added a regression test covering quoted-printable booking content in `src/__tests__/mailroom/tools-mail-archive-search.test.ts`.
- Verified:
  - `npm test -- --run src/__tests__/mailroom/tools-mail-archive-search.test.ts`
  - `npm test -- --run src/__tests__/mailroom/tools-mail-hosted.test.ts`

## Next Checks

1. Watch the audited Messages thread for Slugger's closeout.
2. Re-read `travel/2026-summer-trip/bookings.md` and `travel/2026-summer-trip/itinerary.md` after any update.
3. If Slugger still misses the stay, inspect whether the failure is:
   - query formulation,
   - mail_search ranking / recall,
   - source indexing / import visibility,
   - or cross-tool orientation.
4. If the Zurich overnight is real, decide whether the better substrate surface is:
   - stronger mail-grounding retrieval,
   - a travel-grounding helper/service,
   - or both.
