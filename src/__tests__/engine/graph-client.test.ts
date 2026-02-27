import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { getProfile } from "../../engine/graph-client"

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
})
