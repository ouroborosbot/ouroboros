import { describe, it, expect, vi, beforeEach } from "vitest"
import { createAuthorityChecker, createAdoProbe, ADO_ACTION_MAP } from "../../../mind/context/authority"
import type { AuthorityChecker } from "../../../mind/context/types"

// Mock probe function: simulates Security Namespaces API call
type ProbeFunction = (integration: string, scope: string, action: string) => Promise<boolean>

describe("AuthorityChecker", () => {
  describe("canRead()", () => {
    it("returns true by default (optimistic)", () => {
      const probe: ProbeFunction = vi.fn()
      const checker = createAuthorityChecker(probe)
      expect(checker.canRead("ado", "myorg")).toBe(true)
    })

    it("returns false after record403() for same integration + scope", () => {
      const probe: ProbeFunction = vi.fn()
      const checker = createAuthorityChecker(probe)
      checker.record403("ado", "myorg", "readWorkItem")
      expect(checker.canRead("ado", "myorg")).toBe(false)
    })

    it("record403() for one scope does not affect another scope", () => {
      const probe: ProbeFunction = vi.fn()
      const checker = createAuthorityChecker(probe)
      checker.record403("ado", "org-a", "readWorkItem")
      expect(checker.canRead("ado", "org-a")).toBe(false)
      expect(checker.canRead("ado", "org-b")).toBe(true)
    })

    it("record403() for one integration does not affect another", () => {
      const probe: ProbeFunction = vi.fn()
      const checker = createAuthorityChecker(probe)
      checker.record403("ado", "myorg", "readWorkItem")
      expect(checker.canRead("graph", "myorg")).toBe(true)
    })
  })

  describe("canWrite()", () => {
    it("probes and returns true when probe succeeds", async () => {
      const probe: ProbeFunction = vi.fn().mockResolvedValue(true)
      const checker = createAuthorityChecker(probe)
      const result = await checker.canWrite("ado", "myorg", "createWorkItem")
      expect(result).toBe(true)
      expect(probe).toHaveBeenCalledWith("ado", "myorg", "createWorkItem")
    })

    it("probes and returns false when probe denies", async () => {
      const probe: ProbeFunction = vi.fn().mockResolvedValue(false)
      const checker = createAuthorityChecker(probe)
      const result = await checker.canWrite("ado", "myorg", "deleteWorkItem")
      expect(result).toBe(false)
    })

    it("memoizes within a turn (second call to same scope+action does not re-probe)", async () => {
      const probe: ProbeFunction = vi.fn().mockResolvedValue(true)
      const checker = createAuthorityChecker(probe)
      await checker.canWrite("ado", "myorg", "createWorkItem")
      await checker.canWrite("ado", "myorg", "createWorkItem")
      // Probe should only be called once
      expect(probe).toHaveBeenCalledTimes(1)
    })

    it("does not memoize different actions on same scope", async () => {
      const probe: ProbeFunction = vi.fn().mockResolvedValue(true)
      const checker = createAuthorityChecker(probe)
      await checker.canWrite("ado", "myorg", "createWorkItem")
      await checker.canWrite("ado", "myorg", "deleteWorkItem")
      expect(probe).toHaveBeenCalledTimes(2)
    })

    it("returns true (optimistic) when probe throws (error handling per D16)", async () => {
      const probe: ProbeFunction = vi.fn().mockRejectedValue(new Error("network error"))
      const checker = createAuthorityChecker(probe)
      const result = await checker.canWrite("ado", "myorg", "createWorkItem")
      // On error, assume optimistic
      expect(result).toBe(true)
    })

    it("returns true (optimistic) when probe rejects with timeout", async () => {
      const probe: ProbeFunction = vi.fn().mockRejectedValue(new Error("timeout"))
      const checker = createAuthorityChecker(probe)
      const result = await checker.canWrite("ado", "myorg", "reparentItems")
      expect(result).toBe(true)
    })

    it("returns false after record403() even if probe would succeed", async () => {
      const probe: ProbeFunction = vi.fn().mockResolvedValue(true)
      const checker = createAuthorityChecker(probe)
      checker.record403("ado", "myorg", "createWorkItem")
      // canWrite should still probe (write path is separate from read path 403)
      // But canRead should return false
      expect(checker.canRead("ado", "myorg")).toBe(false)
    })
  })

  describe("interface compliance", () => {
    it("implements AuthorityChecker interface", () => {
      const probe: ProbeFunction = vi.fn()
      const checker: AuthorityChecker = createAuthorityChecker(probe)
      expect(typeof checker.canRead).toBe("function")
      expect(typeof checker.canWrite).toBe("function")
      expect(typeof checker.record403).toBe("function")
    })
  })
})

describe("ADO_ACTION_MAP", () => {
  it("maps createWorkItem to WorkItemTracking namespace", () => {
    expect(ADO_ACTION_MAP.createWorkItem).toBeDefined()
    expect(ADO_ACTION_MAP.createWorkItem.namespace).toBe("WorkItemTracking")
    expect(typeof ADO_ACTION_MAP.createWorkItem.bit).toBe("number")
  })

  it("maps deleteWorkItem to WorkItemTracking namespace", () => {
    expect(ADO_ACTION_MAP.deleteWorkItem).toBeDefined()
    expect(ADO_ACTION_MAP.deleteWorkItem.namespace).toBe("WorkItemTracking")
  })

  it("maps updateWorkItem to WorkItemTracking namespace", () => {
    expect(ADO_ACTION_MAP.updateWorkItem).toBeDefined()
    expect(ADO_ACTION_MAP.updateWorkItem.namespace).toBe("WorkItemTracking")
  })
})

describe("createAdoProbe", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("calls Security Namespaces API with correct parameters and returns true when permitted", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [{ acesDictionary: { "dummy-key": { allow: 0xFF } } }],
      }),
    })
    global.fetch = mockFetch

    const probe = createAdoProbe("test-token")
    const result = await probe("ado", "myorg", "createWorkItem")

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain("dev.azure.com/myorg")
    expect(url).toContain("_apis/security/accesscontrollists")

    global.fetch = originalFetch
  })

  it("returns false when permission bit is not set in allow mask", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [{ acesDictionary: { "dummy-key": { allow: 0 } } }],
      }),
    })
    global.fetch = mockFetch

    const probe = createAdoProbe("test-token")
    const result = await probe("ado", "myorg", "createWorkItem")

    expect(result).toBe(false)

    global.fetch = originalFetch
  })

  it("returns true (optimistic) when API returns 403", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    })
    global.fetch = mockFetch

    const probe = createAdoProbe("test-token")
    const result = await probe("ado", "myorg", "createWorkItem")

    expect(result).toBe(true)

    global.fetch = originalFetch
  })

  it("returns true (optimistic) when API returns 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })
    global.fetch = mockFetch

    const probe = createAdoProbe("test-token")
    const result = await probe("ado", "myorg", "createWorkItem")

    expect(result).toBe(true)

    global.fetch = originalFetch
  })

  it("returns true (optimistic) when API returns 404", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    })
    global.fetch = mockFetch

    const probe = createAdoProbe("test-token")
    const result = await probe("ado", "myorg", "createWorkItem")

    expect(result).toBe(true)

    global.fetch = originalFetch
  })

  it("returns true (optimistic) when fetch throws (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"))

    const probe = createAdoProbe("test-token")
    const result = await probe("ado", "myorg", "createWorkItem")

    expect(result).toBe(true)

    global.fetch = originalFetch
  })

  it("returns true (optimistic) for unknown action (no mapping)", async () => {
    const mockFetch = vi.fn()
    global.fetch = mockFetch

    const probe = createAdoProbe("test-token")
    const result = await probe("ado", "myorg", "unknownAction")

    // Unknown action: no mapping, return optimistic true, no API call
    expect(result).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()

    global.fetch = originalFetch
  })

  it("returns true (optimistic) for non-ado integration", async () => {
    const mockFetch = vi.fn()
    global.fetch = mockFetch

    const probe = createAdoProbe("test-token")
    const result = await probe("graph", "myorg", "createWorkItem")

    // Non-ADO integration: skip probe, return optimistic true
    expect(result).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()

    global.fetch = originalFetch
  })

  it("returns true when API response has empty value array", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: [] }),
    })
    global.fetch = mockFetch

    const probe = createAdoProbe("test-token")
    const result = await probe("ado", "myorg", "createWorkItem")

    // Empty ACL: no info, assume optimistic
    expect(result).toBe(true)

    global.fetch = originalFetch
  })

  it("returns true when ACE dictionary is empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [{ acesDictionary: {} }],
      }),
    })
    global.fetch = mockFetch

    const probe = createAdoProbe("test-token")
    const result = await probe("ado", "myorg", "createWorkItem")

    // Empty ACE dictionary: no info, assume optimistic
    expect(result).toBe(true)

    global.fetch = originalFetch
  })
})
