import { describe, it, expect, vi, beforeEach } from "vitest"

// Track nerves events
const nervesEvents: Array<Record<string, unknown>> = []
vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn((event: Record<string, unknown>) => {
    nervesEvents.push(event)
  }),
}))

// Mock stripe-client
const mockCreateVirtualCard = vi.fn()
const mockDeactivateCard = vi.fn()
const mockListCards = vi.fn()

vi.mock("../../repertoire/stripe-client", () => ({
  createStripeClient: vi.fn().mockResolvedValue({
    createVirtualCard: (...args: unknown[]) => mockCreateVirtualCard(...args),
    deactivateCard: (...args: unknown[]) => mockDeactivateCard(...args),
    listCards: (...args: unknown[]) => mockListCards(...args),
  }),
}))

// Mock duffel-client
const mockSearchFlights = vi.fn()

vi.mock("../../repertoire/duffel-client", () => ({
  createDuffelClient: vi.fn().mockResolvedValue({
    searchFlights: (...args: unknown[]) => mockSearchFlights(...args),
  }),
}))

// Mock credential store
const mockGetRawSecret = vi.fn()
vi.mock("../../repertoire/credential-access", () => ({
  getCredentialStore: () => ({
    getRawSecret: mockGetRawSecret,
    isReady: () => true,
  }),
}))

import { commerceSelfTest, type SelfTestResult } from "../../repertoire/commerce-self-test"

describe("commerceSelfTest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nervesEvents.length = 0
  })

  it("reports all services healthy when everything works", async () => {
    mockGetRawSecret.mockResolvedValue("test-key")
    mockCreateVirtualCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "active" })
    mockDeactivateCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "canceled" })
    mockSearchFlights.mockResolvedValue([{ id: "off_test" }])

    const result = await commerceSelfTest()

    expect(result.overall).toBe("healthy")
    expect(result.services.stripe.status).toBe("ok")
    expect(result.services.duffel.status).toBe("ok")
    expect(result.services.liteapi.status).toBe("ok")
  })

  it("reports Stripe unhealthy with actionable error", async () => {
    mockGetRawSecret.mockImplementation((domain: string) => {
      if (domain === "stripe.com") return Promise.reject(new Error("no credential found"))
      return Promise.resolve("test-key")
    })
    mockSearchFlights.mockResolvedValue([])

    const result = await commerceSelfTest()

    expect(result.services.stripe.status).toBe("error")
    expect(result.services.stripe.message).toContain("dashboard.stripe.com")
    expect(result.overall).toBe("partial")
  })

  it("reports Duffel unhealthy with 401 error", async () => {
    mockGetRawSecret.mockResolvedValue("test-key")
    mockCreateVirtualCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "active" })
    mockDeactivateCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "canceled" })
    mockSearchFlights.mockRejectedValue(new Error("401 Unauthorized"))

    const result = await commerceSelfTest()

    expect(result.services.duffel.status).toBe("error")
    expect(result.services.duffel.message).toContain("app.duffel.com")
  })

  it("reports partial success correctly", async () => {
    // Stripe works, Duffel fails, LiteAPI not configured
    mockGetRawSecret.mockImplementation((domain: string) => {
      if (domain === "stripe.com") return Promise.resolve("rk_test_key")
      if (domain === "duffel.com") return Promise.resolve("bad-key")
      if (domain === "liteapi.travel") return Promise.reject(new Error("no credential found"))
      return Promise.reject(new Error("unknown"))
    })
    mockCreateVirtualCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "active" })
    mockDeactivateCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "canceled" })
    mockSearchFlights.mockRejectedValue(new Error("Invalid API key"))

    const result = await commerceSelfTest()

    expect(result.overall).toBe("partial")
    expect(result.services.stripe.status).toBe("ok")
    expect(result.services.duffel.status).toBe("error")
    expect(result.summary).toContain("Stripe")
  })

  it("generates human-readable summary", async () => {
    mockGetRawSecret.mockResolvedValue("test-key")
    mockCreateVirtualCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "active" })
    mockDeactivateCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "canceled" })
    mockSearchFlights.mockResolvedValue([{ id: "off_test" }])

    const result = await commerceSelfTest()

    expect(typeof result.summary).toBe("string")
    expect(result.summary.length).toBeGreaterThan(0)
  })

  it("handles all services down", async () => {
    mockGetRawSecret.mockRejectedValue(new Error("vault unreachable"))

    const result = await commerceSelfTest()

    expect(result.overall).toBe("unhealthy")
    expect(result.services.stripe.status).toBe("error")
    expect(result.services.duffel.status).toBe("error")
    expect(result.services.liteapi.status).toBe("error")
  })

  it("emits nerves events during self-test", async () => {
    mockGetRawSecret.mockResolvedValue("test-key")
    mockCreateVirtualCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "active" })
    mockDeactivateCard.mockResolvedValue({ cardId: "ic_test", last4: "4242", status: "canceled" })
    mockSearchFlights.mockResolvedValue([])

    await commerceSelfTest()

    expect(nervesEvents.some((e) => e.event === "repertoire.commerce_self_test_start")).toBe(true)
    expect(nervesEvents.some((e) => e.event === "repertoire.commerce_self_test_end")).toBe(true)
  })
})
