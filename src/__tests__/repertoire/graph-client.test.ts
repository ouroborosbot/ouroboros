import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { getProfile, graphRequest } from "../../repertoire/graph-client"

describe("getProfile", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("returns formatted profile on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        displayName: "Jane Doe",
        mail: "jane@contoso.com",
        jobTitle: "Engineer",
        department: "Platform",
        officeLocation: "Building 42",
      }),
    })

    const result = await getProfile("test-token")

    expect(result).toContain("Jane Doe")
    expect(result).toContain("jane@contoso.com")
    expect(result).toContain("Engineer")
    expect(result).toContain("Platform")
    expect(result).toContain("Building 42")

    expect(mockFetch).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: "Bearer test-token" },
    })
  })

  it("handles missing optional fields gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        displayName: "Jane Doe",
        mail: null,
        jobTitle: null,
        department: null,
        officeLocation: null,
      }),
    })

    const result = await getProfile("test-token")
    expect(result).toContain("Jane Doe")
    // Should not crash with null fields
    expect(typeof result).toBe("string")
  })

  it("returns AUTH_REQUIRED on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })

    const result = await getProfile("bad-token")
    expect(result).toBe("AUTH_REQUIRED:graph")
  })

  it("returns PERMISSION_DENIED on 403", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    })

    const result = await getProfile("token")
    expect(result).toContain("PERMISSION_DENIED")
  })

  it("returns THROTTLED on 429", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    })

    const result = await getProfile("token")
    expect(result).toContain("THROTTLED")
  })

  it("returns SERVICE_ERROR on 500", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })

    const result = await getProfile("token")
    expect(result).toContain("SERVICE_ERROR")
  })

  it("returns NETWORK_ERROR on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("fetch failed"))

    const result = await getProfile("token")
    expect(result).toContain("NETWORK_ERROR")
  })

  it("returns NETWORK_ERROR on non-Error fetch failure", async () => {
    mockFetch.mockRejectedValue("fetch failed as string")

    const result = await getProfile("token")
    expect(result).toContain("NETWORK_ERROR")
  })
})

describe("graphRequest", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("makes GET request and returns formatted JSON string", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ displayName: "Jane", mail: "jane@contoso.com" }),
    })

    const result = await graphRequest("test-token", "GET", "/me")

    expect(mockFetch).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
    })
    const parsed = JSON.parse(result)
    expect(parsed.displayName).toBe("Jane")
    expect(parsed.mail).toBe("jane@contoso.com")
  })

  it("makes POST request with body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "msg-123", subject: "Hello" }),
    })

    const body = JSON.stringify({ subject: "Hello", body: { content: "Hi" } })
    const result = await graphRequest("test-token", "POST", "/me/messages", body)

    expect(mockFetch).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body,
    })
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe("msg-123")
  })

  it("makes PATCH request with body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "event-1", subject: "Updated" }),
    })

    const body = JSON.stringify({ subject: "Updated" })
    const result = await graphRequest("test-token", "PATCH", "/me/events/event-1", body)

    expect(mockFetch).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me/events/event-1", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body,
    })
    const parsed = JSON.parse(result)
    expect(parsed.subject).toBe("Updated")
  })

  it("makes DELETE request without body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await graphRequest("test-token", "DELETE", "/me/messages/msg-123")

    expect(mockFetch).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me/messages/msg-123", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
    })
  })

  it("handles paths with query parameters", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ value: [] }),
    })

    await graphRequest("test-token", "GET", "/me/messages?$top=5&$select=subject")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/messages?$top=5&$select=subject",
      expect.any(Object),
    )
  })

  it("returns formatted JSON (pretty printed)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ key: "value" }),
    })

    const result = await graphRequest("test-token", "GET", "/me")
    // Should be pretty-printed JSON
    expect(result).toContain("\n")
    expect(JSON.parse(result)).toEqual({ key: "value" })
  })

  it("returns error string on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })

    const result = await graphRequest("bad-token", "GET", "/me")
    expect(result).toBe("AUTH_REQUIRED:graph")
  })

  it("returns error string on 403", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    })

    const result = await graphRequest("token", "GET", "/me")
    expect(result).toContain("PERMISSION_DENIED")
  })

  it("returns error string on 429", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    })

    const result = await graphRequest("token", "GET", "/me")
    expect(result).toContain("THROTTLED")
  })

  it("returns error string on 500", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })

    const result = await graphRequest("token", "GET", "/me")
    expect(result).toContain("SERVICE_ERROR")
  })

  it("returns NETWORK_ERROR on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("network error"))

    const result = await graphRequest("token", "GET", "/me")
    expect(result).toContain("NETWORK_ERROR")
  })

  it("returns NETWORK_ERROR on non-Error fetch failure", async () => {
    mockFetch.mockRejectedValue("network failure string")

    const result = await graphRequest("token", "GET", "/me")
    expect(result).toContain("NETWORK_ERROR")
  })

  it("returns error string on generic 4xx", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    })

    const result = await graphRequest("token", "POST", "/me/messages", "{bad json")
    expect(result).toContain("ERROR")
    expect(result).toContain("400")
  })
})

describe("graph-client observability contract", () => {
  it("emits client.request_start event for Graph requests", async () => {
    vi.resetModules()
    const emitObservabilityEvent = vi.fn()
    vi.doMock("../../nerves/runtime", () => ({
      emitObservabilityEvent,
    }))
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ displayName: "Jane" }),
    })

    const { getProfile } = await import("../../repertoire/graph-client")
    await getProfile("test-token")

    expect(emitObservabilityEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "client.request_start",
      component: "clients",
    }))
  })
})
