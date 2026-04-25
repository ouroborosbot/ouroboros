import { describe, expect, it } from "vitest"
import type { MailSearchCacheDocument } from "../../mailroom/search-cache"
import {
  compareByRelevanceThenRecency,
  formatRelevanceHint,
  scoreMailSearchDocument,
} from "../../mailroom/search-relevance"

function doc(overrides: Partial<MailSearchCacheDocument> = {}): MailSearchCacheDocument {
  const base: MailSearchCacheDocument = {
    schemaVersion: 1,
    messageId: "mail_test",
    agentId: "slugger",
    receivedAt: "2026-04-24T18:00:00.000Z",
    placement: "imbox",
    compartmentKind: "delegated",
    from: ["someone@example.com"],
    subject: "subject",
    snippet: "snippet",
    textExcerpt: "body",
    untrustedContentWarning: "untrusted",
    searchText: "subject\nsnippet\nbody\nsomeone@example.com",
  }
  return { ...base, ...overrides }
}

describe("scoreMailSearchDocument", () => {
  it("returns score 0 and no signals on a doc with no query terms or booking signals", () => {
    const signal = scoreMailSearchDocument(doc({ subject: "lunch?", textExcerpt: "want to grab lunch friday?", from: ["alex@friend.example"] }), [])
    expect(signal.score).toBe(0)
    expect(signal.matchedFields).toEqual([])
    expect(signal.bookingTokens).toEqual([])
    expect(signal.confirmationTokens).toEqual([])
    expect(signal.currencyTokens).toEqual([])
    expect(signal.travelSenderHint).toBeUndefined()
  })

  it("scores subject hits higher than body hits", () => {
    const subjectHit = scoreMailSearchDocument(doc({ subject: "Basel weekend", textExcerpt: "unrelated text" }), ["basel"])
    const bodyHit = scoreMailSearchDocument(doc({ subject: "weekend plans", textExcerpt: "going to basel maybe" }), ["basel"])
    expect(subjectHit.score).toBeGreaterThan(bodyHit.score)
    expect(subjectHit.matchedFields).toContain("subject")
    expect(bodyHit.matchedFields).toContain("body")
  })

  it("rewards decisive booking-intent tokens in the subject", () => {
    const decisive = scoreMailSearchDocument(doc({
      subject: "Booking Confirmation - Hotel Marthof",
      textExcerpt: "Your stay is confirmed.",
    }), [])
    const noisy = scoreMailSearchDocument(doc({
      subject: "Top Hotels in Basel",
      textExcerpt: "Curated picks for your next trip.",
    }), [])
    expect(decisive.score).toBeGreaterThan(noisy.score)
    expect(decisive.bookingTokens.length).toBeGreaterThan(0)
  })

  it("extracts confirmation-shaped tokens from subject and body", () => {
    const signal = scoreMailSearchDocument(doc({
      subject: "Confirmation BSL47291",
      textExcerpt: "Your reference code is 8829110472.",
    }), [])
    // BSL47291 (alphanumeric, 8 chars, has letter+digit) and 8829110472 (10 digits) both extracted.
    expect(signal.confirmationTokens.length).toBeGreaterThanOrEqual(2)
    expect(signal.score).toBeGreaterThan(0)
  })

  it("does not flag plain alphabetic words as confirmation tokens", () => {
    const signal = scoreMailSearchDocument(doc({
      subject: "RANDOMWORDS HELLO BASEL",
      textExcerpt: "no codes here just shouty letters",
    }), [])
    expect(signal.confirmationTokens).toEqual([])
  })

  it("extracts currency amounts in multiple formats", () => {
    const signal = scoreMailSearchDocument(doc({
      subject: "Payment receipt",
      textExcerpt: "Total: $420.00. Tax: CHF 35. Refund pending: €189,50.",
    }), [])
    expect(signal.currencyTokens.length).toBeGreaterThanOrEqual(3)
  })

  it("recognizes a known travel-sender domain in the from list", () => {
    const signal = scoreMailSearchDocument(doc({
      from: ["confirmations@booking.com"],
      subject: "Reservation",
      textExcerpt: "thanks",
    }), [])
    expect(signal.travelSenderHint).toBe("booking.com")
    expect(signal.score).toBeGreaterThanOrEqual(6)
  })

  it("composes signals additively for a strong booking confirmation", () => {
    const strong = scoreMailSearchDocument(doc({
      from: ["noreply@booking.com"],
      subject: "Booking Confirmation - Hotel Marthof, Basel",
      textExcerpt: "Confirmation: BSL47291. Total $420.00. Check-in: August 2.",
    }), ["basel"])
    const weak = scoreMailSearchDocument(doc({
      from: ["alex@friend.example"],
      subject: "thinking about basel",
      textExcerpt: "what do you think about basel for a weekend",
    }), ["basel"])
    expect(strong.score).toBeGreaterThan(weak.score)
    expect(strong.matchedFields).toContain("subject")
    expect(strong.bookingTokens.length).toBeGreaterThan(0)
    expect(strong.confirmationTokens.length).toBeGreaterThan(0)
    expect(strong.currencyTokens.length).toBeGreaterThan(0)
    expect(strong.travelSenderHint).toBe("booking.com")
  })
})

describe("compareByRelevanceThenRecency", () => {
  it("orders by score desc, then receivedAt desc", () => {
    const olderHigh = {
      document: doc({ messageId: "older_high", receivedAt: "2026-04-01T00:00:00.000Z" }),
      relevance: { score: 30, matchedFields: [], bookingTokens: [], confirmationTokens: [], currencyTokens: [] },
    }
    const newerLow = {
      document: doc({ messageId: "newer_low", receivedAt: "2026-04-24T00:00:00.000Z" }),
      relevance: { score: 5, matchedFields: [], bookingTokens: [], confirmationTokens: [], currencyTokens: [] },
    }
    const newerHigh = {
      document: doc({ messageId: "newer_high", receivedAt: "2026-04-24T00:00:00.000Z" }),
      relevance: { score: 30, matchedFields: [], bookingTokens: [], confirmationTokens: [], currencyTokens: [] },
    }
    const sorted = [newerLow, olderHigh, newerHigh].sort(compareByRelevanceThenRecency)
    expect(sorted.map((entry) => entry.document.messageId)).toEqual([
      "newer_high", // highest score, newest
      "older_high", // tied score with newer_high but older
      "newer_low",  // lowest score
    ])
  })
})

describe("formatRelevanceHint", () => {
  it("returns empty string when score is zero", () => {
    expect(formatRelevanceHint({
      score: 0,
      matchedFields: [],
      bookingTokens: [],
      confirmationTokens: [],
      currencyTokens: [],
    })).toBe("")
  })

  it("renders fields, booking tokens, and conf+amount+sender in one line", () => {
    const hint = formatRelevanceHint({
      score: 20,
      matchedFields: ["subject", "from"],
      bookingTokens: ["confirmation", "your stay"],
      confirmationTokens: ["BSL47291"],
      currencyTokens: ["$420.00"],
      travelSenderHint: "booking.com",
    })
    expect(hint).toContain("fields: subject+from")
    expect(hint).toContain("booking signals: confirmation, your stay")
    expect(hint).toContain("conf token: BSL47291")
    expect(hint).toContain("amount: $420.00")
    expect(hint).toContain("sender: booking.com")
  })
})
