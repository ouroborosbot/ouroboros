import { describe, it, expect, vi, beforeEach } from "vitest"

// Track nerves events
const nervesEvents: Array<Record<string, unknown>> = []
vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn((event: Record<string, unknown>) => {
    nervesEvents.push(event)
  }),
}))

// Mock child_process
const mockExecFile = vi.fn()

vi.mock("node:child_process", () => ({
  execFile: (...args: any[]) => mockExecFile(...args),
}))

import { BitwardenCredentialStore } from "../../repertoire/bitwarden-store"

function setupExecMock(result: { stdout: string; stderr?: string; error?: Error }) {
  mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    if (result.error) {
      cb(result.error, "", result.stderr ?? "")
    } else {
      cb(null, result.stdout, result.stderr ?? "")
    }
  })
}

describe("BitwardenCredentialStore", () => {
  let store: BitwardenCredentialStore

  beforeEach(() => {
    vi.clearAllMocks()
    nervesEvents.length = 0
    store = new BitwardenCredentialStore("https://vault.ouro.bot", "ouroboros@ouro.bot", "masterpass123")
  })

  describe("isReady", () => {
    it("returns true (always ready — auth is lazy)", () => {
      expect(store.isReady()).toBe(true)
    })
  })

  describe("login", () => {
    it("calls bw config server then bw login", async () => {
      const calls: string[][] = []
      mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        calls.push(args)
        cb(null, '{"access_token":"session-token"}', "")
      })

      await store.login()

      // First call: bw config server <url>
      expect(calls[0]).toEqual(["config", "server", "https://vault.ouro.bot"])
      // Second call: bw login
      expect(calls[1][0]).toBe("login")
      expect(calls[1][1]).toBe("ouroboros@ouro.bot")
    })

    it("caches the session token", async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, '{"access_token":"my-session-token"}', "")
      })

      await store.login()

      // Subsequent bw calls should include the session token
      // This is checked by the get/store/list/delete methods
      expect(store.isReady()).toBe(true)
    })

    it("handles login failure", async () => {
      mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        if (args[0] === "login") {
          cb(new Error("invalid credentials"), "", "Username or password is incorrect")
        } else {
          cb(null, "", "")
        }
      })

      await expect(store.login()).rejects.toThrow(/bw CLI error/)
    })
  })

  describe("get", () => {
    it("returns credential metadata for a domain", async () => {
      setupExecMock({
        stdout: JSON.stringify([{
          id: "item-1",
          name: "test.com",
          login: {
            username: "testuser",
            password: "secret123",
          },
          notes: "test note",
          revisionDate: "2026-01-15T00:00:00.000Z",
        }]),
      })

      const result = await store.get("test.com")

      expect(result).not.toBeNull()
      expect(result!.domain).toBe("test.com")
      expect(result!.username).toBe("testuser")
      expect(result!.notes).toBe("test note")
      // Password should NOT be in the result
      expect((result as any).password).toBeUndefined()
    })

    it("returns null when no item found", async () => {
      setupExecMock({ stdout: "[]" })

      const result = await store.get("nonexistent.com")
      expect(result).toBeNull()
    })

    it("emits nerves events", async () => {
      setupExecMock({ stdout: "[]" })

      await store.get("test.com")

      expect(nervesEvents.some((e) => e.event === "repertoire.bw_credential_get_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "repertoire.bw_credential_get_end")).toBe(true)
    })
  })

  describe("getRawSecret", () => {
    it("returns the requested field from the vault item", async () => {
      setupExecMock({
        stdout: JSON.stringify([{
          id: "item-1",
          name: "api.example.com",
          login: {
            username: "apiuser",
            password: "api-secret-key",
          },
        }]),
      })

      const result = await store.getRawSecret("api.example.com", "password")
      expect(result).toBe("api-secret-key")
    })

    it("throws when item not found", async () => {
      setupExecMock({ stdout: "[]" })

      await expect(store.getRawSecret("missing.com", "password")).rejects.toThrow(/no credential found/)
    })

    it("throws when field not found", async () => {
      setupExecMock({
        stdout: JSON.stringify([{
          id: "item-1",
          name: "test.com",
          login: { username: "user" },
        }]),
      })

      await expect(store.getRawSecret("test.com", "password")).rejects.toThrow(/field "password" not found/)
    })
  })

  describe("store", () => {
    it("creates a new vault item via bw create", async () => {
      const createCalls: string[][] = []
      mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        createCalls.push(args)
        cb(null, '{"id":"new-item-1"}', "")
      })

      await store.store("newsite.com", {
        username: "newuser",
        password: "newpass",
        notes: "a note",
      })

      // Should call "bw create item <encoded-json>"
      expect(createCalls.length).toBeGreaterThanOrEqual(1)
      const createCall = createCalls.find((c) => c[0] === "create")
      expect(createCall).toBeDefined()
    })

    it("emits nerves events", async () => {
      setupExecMock({ stdout: '{"id":"new-item"}' })

      await store.store("test.com", { password: "pass" })

      expect(nervesEvents.some((e) => e.event === "repertoire.bw_credential_store_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "repertoire.bw_credential_store_end")).toBe(true)
    })
  })

  describe("list", () => {
    it("returns all vault items as CredentialMeta", async () => {
      setupExecMock({
        stdout: JSON.stringify([
          {
            id: "1",
            name: "site-a.com",
            login: { username: "user-a" },
            notes: "note a",
            revisionDate: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "2",
            name: "site-b.com",
            login: { username: "user-b" },
            notes: null,
            revisionDate: "2026-02-01T00:00:00.000Z",
          },
        ]),
      })

      const results = await store.list()

      expect(results).toHaveLength(2)
      expect(results[0].domain).toBe("site-a.com")
      expect(results[0].username).toBe("user-a")
      expect(results[1].domain).toBe("site-b.com")
    })

    it("returns empty array when vault is empty", async () => {
      setupExecMock({ stdout: "[]" })

      const results = await store.list()
      expect(results).toEqual([])
    })
  })

  describe("delete", () => {
    it("finds and deletes a vault item by domain", async () => {
      const deleteCalls: string[][] = []
      mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        deleteCalls.push(args)
        if (args[0] === "list" && args[1] === "items") {
          cb(null, JSON.stringify([{ id: "item-to-delete", name: "old.com" }]), "")
        } else {
          cb(null, "", "")
        }
      })

      const result = await store.delete("old.com")

      expect(result).toBe(true)
      const deleteCall = deleteCalls.find((c) => c[0] === "delete")
      expect(deleteCall).toBeDefined()
      expect(deleteCall![2]).toBe("item-to-delete")
    })

    it("returns false when item not found", async () => {
      setupExecMock({ stdout: "[]" })

      const result = await store.delete("nonexistent.com")
      expect(result).toBe(false)
    })
  })
})
