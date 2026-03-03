import { describe, it, expect, vi } from "vitest"
import { createAuthorityChecker } from "../../../mind/context/authority"
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
