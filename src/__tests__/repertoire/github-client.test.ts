import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { githubRequest } from "../../repertoire/github-client"

describe("githubRequest", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("makes GET request without body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, title: "Issue #1" }),
    })

    const result = await githubRequest("test-token", "GET", "/repos/owner/repo/issues")

    expect(mockFetch).toHaveBeenCalledWith("https://api.github.com/repos/owner/repo/issues", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-token",
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
    })
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe(1)
    expect(parsed.title).toBe("Issue #1")
  })

  it("makes POST request with JSON body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, title: "New Issue", html_url: "https://github.com/o/r/issues/42" }),
    })

    const body = JSON.stringify({ title: "New Issue", body: "Description" })
    const result = await githubRequest("test-token", "POST", "/repos/owner/repo/issues", body)

    expect(mockFetch).toHaveBeenCalledWith("https://api.github.com/repos/owner/repo/issues", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body,
    })
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe(42)
  })

  it("returns pretty-printed JSON on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ key: "value" }),
    })

    const result = await githubRequest("test-token", "GET", "/repos/o/r")
    expect(result).toContain("\n")
    expect(JSON.parse(result)).toEqual({ key: "value" })
  })

  it("returns AUTH_REQUIRED:github on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })

    const result = await githubRequest("bad-token", "GET", "/user")
    expect(result).toBe("AUTH_REQUIRED:github")
  })

  it("returns PERMISSION_DENIED on 403", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    })

    const result = await githubRequest("token", "GET", "/repos/private/repo")
    expect(result).toContain("PERMISSION_DENIED")
  })

  it("returns THROTTLED on 429", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    })

    const result = await githubRequest("token", "GET", "/repos/o/r")
    expect(result).toContain("THROTTLED")
  })

  it("returns SERVICE_ERROR on 5xx", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })

    const result = await githubRequest("token", "GET", "/repos/o/r")
    expect(result).toContain("SERVICE_ERROR")
  })

  it("returns NETWORK_ERROR on fetch failure (Error)", async () => {
    mockFetch.mockRejectedValue(new Error("fetch failed"))

    const result = await githubRequest("token", "GET", "/repos/o/r")
    expect(result).toContain("NETWORK_ERROR")
  })

  it("returns NETWORK_ERROR on fetch failure (non-Error)", async () => {
    mockFetch.mockRejectedValue("fetch failed as string")

    const result = await githubRequest("token", "GET", "/repos/o/r")
    expect(result).toContain("NETWORK_ERROR")
  })

  it("returns generic ERROR on other 4xx", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    })

    const result = await githubRequest("token", "POST", "/repos/o/r/issues", "{bad")
    expect(result).toContain("ERROR")
    expect(result).toContain("400")
  })
})

describe("github-client observability contract", () => {
  it("emits client.request_start and client.request_end events", async () => {
    vi.resetModules()
    const emitNervesEvent = vi.fn()
    vi.doMock("../../nerves/runtime", () => ({
      emitNervesEvent,
    }))
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1 }),
    })

    const { githubRequest: ghReq } = await import("../../repertoire/github-client")
    await ghReq("test-token", "GET", "/repos/o/r")

    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "client.request_start",
      component: "clients",
    }))
    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "client.request_end",
      component: "clients",
    }))
    // Verify meta includes client: "github"
    const startCall = emitNervesEvent.mock.calls.find(
      (c: unknown[]) => (c[0] as { event: string }).event === "client.request_start",
    )
    expect(startCall![0].meta.client).toBe("github")
  })

  it("emits client.error event on failure", async () => {
    vi.resetModules()
    const emitNervesEvent = vi.fn()
    vi.doMock("../../nerves/runtime", () => ({
      emitNervesEvent,
    }))
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })

    const { githubRequest: ghReq } = await import("../../repertoire/github-client")
    await ghReq("token", "GET", "/repos/o/r")

    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "client.error",
      component: "clients",
      level: "error",
    }))
  })

  it("emits client.error event on fetch exception", async () => {
    vi.resetModules()
    const emitNervesEvent = vi.fn()
    vi.doMock("../../nerves/runtime", () => ({
      emitNervesEvent,
    }))
    mockFetch.mockReset()
    mockFetch.mockRejectedValue(new Error("network down"))

    const { githubRequest: ghReq } = await import("../../repertoire/github-client")
    await ghReq("token", "GET", "/repos/o/r")

    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "client.error",
      component: "clients",
      level: "error",
    }))
  })
})
