// Booking-intent relevance for mail search.
//
// Today the agent's mail search ranks by recency only — `searchText.includes(term)`
// then `receivedAt` desc. That works for "give me the latest message" but fails
// the workflow Slugger actually does most: "find the decisive booking message
// in this delegated mailbox so I can update a travel doc from real evidence."
// Recent newsletter / itinerary chatter from the same sender drowns the older
// confirmation.
//
// This module adds a small additive score per document. Signals are heuristic
// and intentionally legible — not learned. Each signal is also exposed so the
// renderer can surface a "matched on" hint to the agent for triage.

import type { MailSearchCacheDocument } from "./search-cache"

export interface RelevanceSignal {
  score: number
  matchedFields: Array<"subject" | "from" | "body">
  bookingTokens: string[]
  confirmationTokens: string[]
  currencyTokens: string[]
  travelSenderHint?: string
}

const BOOKING_INTENT_TOKENS = [
  "booking confirmation",
  "booked",
  "your booking",
  "your reservation",
  "your stay",
  "your trip",
  "reservation confirmation",
  "reservation confirmed",
  "confirmation number",
  "e-ticket",
  "eticket",
  "itinerary",
  "receipt",
  "invoice",
  "check-in",
  "check in",
  "departure",
  "arrival",
  "boarding pass",
  "confirmed",
  "confirmation",
  "reservation",
] as const

// Subject-only tokens get an extra bump because subjects rarely include them
// for non-decisive mail.
const SUBJECT_DECISIVE_TOKENS = [
  "booking confirmation",
  "reservation confirmation",
  "your booking",
  "your reservation",
  "your stay",
  "e-ticket",
  "eticket",
  "boarding pass",
  "confirmed",
  "itinerary",
  "receipt",
] as const

// Known travel-domain senders. Substring match against the from list. Kept
// short on purpose — the score still works without exhaustive coverage; this
// just reinforces obvious cases.
const KNOWN_TRAVEL_SENDER_PATTERNS = [
  "booking.com",
  "hotels.com",
  "expedia",
  "airbnb",
  "marriott",
  "hilton",
  "hyatt",
  "ihg",
  "accorhotels",
  "kayak",
  "agoda",
  "trivago",
  "vrbo",
  "swiss.com",
  "lufthansa",
  "ryanair",
  "easyjet",
  "ba.com",
  "delta.com",
  "united.com",
  "aa.com",
  "alaskaair",
  "klm.com",
  "airfrance",
  "iberia",
  "sas.se",
  "norwegian.com",
  "sbb.ch",
  "sncf",
  "trenitalia",
  "renfe",
  "eurail",
  "trainline",
  "omio",
  "raileurope",
  "amtrak",
  "viarail",
  "rentalcars",
  "hertz",
  "avis",
  "europcar",
  "sixt",
  "uber.com",
  "lyft.com",
  "lime",
  "tripit",
  "kiwi.com",
  "tap.pt",
] as const

// Confirmation-number-shaped tokens. Two flavors:
//   - alphanumeric mix at least 6 long: PNRs, hotel confirmation codes
//   - long pure-digit runs (>= 8): airline ref numbers, OTA references
const ALPHANUM_CONF_RE = /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{6,12}\b/g
const LONG_DIGIT_RE = /\b\d{8,}\b/g

// Currency amounts. Symbol or ISO 3-letter currency immediately followed by
// (or following) a number. Catches "$420", "€189.50", "CHF 320", "USD 199".
const CURRENCY_RE = /(?:[$£€¥₣]\s?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?|\b(?:USD|EUR|GBP|CHF|JPY|CAD|AUD|SEK|NOK|DKK)\s?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/g

function uniqueLowercaseHits(text: string, regex: RegExp): string[] {
  const hits = text.match(regex)
  if (!hits) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const hit of hits) {
    const norm = hit.toLowerCase()
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(hit)
  }
  return out
}

function findKnownTravelSender(fromList: string[]): string | undefined {
  for (const from of fromList) {
    const lower = from.toLowerCase()
    for (const pattern of KNOWN_TRAVEL_SENDER_PATTERNS) {
      if (lower.includes(pattern)) return pattern
    }
  }
  return undefined
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (true) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) break
    count++
    from = idx + needle.length
  }
  return count
}

/**
 * Score a cached search document for booking-intent relevance against a list
 * of (already lowercased, non-empty) query terms.
 *
 * Signals (additive, all small integers so the result stays interpretable):
 *   - +6 per query term hit in subject
 *   - +4 per query term hit in any from address
 *   - +2 per query term hit in body
 *   - +5 per booking-intent token in subject (extra +3 for decisive subject tokens)
 *   - +2 per booking-intent token in body
 *   - +4 if any confirmation-number-shaped token appears
 *   - +3 if any currency amount appears
 *   - +6 if any from address matches a known travel-sender pattern
 *
 * The numbers are tunable. They are chosen so that a noisy newsletter that
 * mentions the query terms in body but has no booking signals scores below
 * a decisive booking confirmation that has the query terms + booking tokens
 * in subject + a confirmation code, even if the booking confirmation is older.
 */
export function scoreMailSearchDocument(
  document: MailSearchCacheDocument,
  queryTerms: string[],
): RelevanceSignal {
  const subjectLower = document.subject.toLowerCase()
  const bodyLower = document.textExcerpt.toLowerCase()
  const fromLower = document.from.join(" ").toLowerCase()

  let score = 0
  const matchedFields = new Set<RelevanceSignal["matchedFields"][number]>()

  for (const term of queryTerms) {
    if (!term) continue
    if (subjectLower.includes(term)) {
      score += 6
      matchedFields.add("subject")
    }
    if (fromLower.includes(term)) {
      score += 4
      matchedFields.add("from")
    }
    if (bodyLower.includes(term)) {
      score += 2
      matchedFields.add("body")
    }
  }

  const bookingHits = new Set<string>()
  for (const token of BOOKING_INTENT_TOKENS) {
    const inSubject = countOccurrences(subjectLower, token)
    const inBody = countOccurrences(bodyLower, token)
    if (inSubject > 0) {
      score += 5 * inSubject
      bookingHits.add(token)
    }
    if (inBody > 0) {
      score += 2 * inBody
      bookingHits.add(token)
    }
  }
  for (const decisive of SUBJECT_DECISIVE_TOKENS) {
    if (subjectLower.includes(decisive)) score += 3
  }

  const subjectAndBody = `${document.subject}\n${document.textExcerpt}`
  const confirmationTokens = [
    ...uniqueLowercaseHits(subjectAndBody, ALPHANUM_CONF_RE),
    ...uniqueLowercaseHits(subjectAndBody, LONG_DIGIT_RE),
  ]
  if (confirmationTokens.length > 0) score += 4

  const currencyTokens = uniqueLowercaseHits(subjectAndBody, CURRENCY_RE)
  if (currencyTokens.length > 0) score += 3

  const travelSenderHint = findKnownTravelSender(document.from)
  if (travelSenderHint) score += 6

  const signal: RelevanceSignal = {
    score,
    matchedFields: Array.from(matchedFields),
    bookingTokens: Array.from(bookingHits),
    confirmationTokens,
    currencyTokens,
  }
  if (travelSenderHint) signal.travelSenderHint = travelSenderHint
  return signal
}

/**
 * Sort comparator: booking relevance first, recency as tiebreaker.
 * Returns negative when `a` should come before `b`.
 */
export function compareByRelevanceThenRecency(
  a: { document: MailSearchCacheDocument; relevance: RelevanceSignal },
  b: { document: MailSearchCacheDocument; relevance: RelevanceSignal },
): number {
  if (b.relevance.score !== a.relevance.score) return b.relevance.score - a.relevance.score
  return b.document.receivedAt.localeCompare(a.document.receivedAt)
}

/**
 * Render a short "matched on" hint for surfacing under a search result.
 * Empty string when nothing notable to report (no signals, no fields). The
 * caller decides whether to display the line.
 */
export function formatRelevanceHint(signal: RelevanceSignal): string {
  if (signal.score === 0) return ""
  const parts: string[] = []
  if (signal.matchedFields.length > 0) {
    parts.push(`fields: ${signal.matchedFields.join("+")}`)
  }
  if (signal.bookingTokens.length > 0) {
    const preview = signal.bookingTokens.slice(0, 3).join(", ")
    parts.push(`booking signals: ${preview}`)
  }
  if (signal.confirmationTokens.length > 0) {
    parts.push(`conf token: ${signal.confirmationTokens[0]}`)
  }
  if (signal.currencyTokens.length > 0) {
    parts.push(`amount: ${signal.currencyTokens[0]}`)
  }
  if (signal.travelSenderHint) {
    parts.push(`sender: ${signal.travelSenderHint}`)
  }
  return parts.join(" | ")
}
