import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock child_process for CLI fallback
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}))

import { execFile } from "child_process"

// Track nerves events
const nervesEvents: Array<Record<string, unknown>> = []
vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn((event: Record<string, unknown>) => {
    nervesEvents.push(event)
  }),
}))

import {
  BitwardenClient,
  getBitwardenClient,
  resetBitwardenClient,
} from "../../repertoire/bitwarden-client"
import type { VaultConfig, VaultItem, VaultItemHandle, AacVaultConfig } from "../../repertoire/bitwarden-client"

// Helper to make execFile resolve with stdout
function mockExecFileSuccess(stdout: string): void {
  vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
    // execFile(cmd, args, opts, callback) or execFile(cmd, args, callback)
    const cb = typeof _opts === "function" ? _opts : callback
    cb(null, stdout, "")
    return {} as any
  })
}

function mockExecFileError(errorMessage: string, exitCode = 1): void {
  vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
    const cb = typeof _opts === "function" ? _opts : callback
    const err = Object.assign(new Error(errorMessage), { code: exitCode })
    cb(err, "", errorMessage)
    return {} as any
  })
}

/**
 * Mock execFile per-command: routes aac calls to aacStdout, bw calls to bwStdout.
 */
function mockExecFileByCommand(responses: { aac?: string; bw?: string; aacError?: string; bwError?: string }): void {
  vi.mocked(execFile).mockImplementation((cmd: any, _args: any, _opts: any, callback: any) => {
    const cb = typeof _opts === "function" ? _opts : callback
    if (cmd === "aac") {
      if (responses.aacError) {
        cb(new Error(responses.aacError), "", responses.aacError)
      } else {
        cb(null, responses.aac ?? "", "")
      }
    } else {
      if (responses.bwError) {
        cb(new Error(responses.bwError), "", responses.bwError)
      } else {
        cb(null, responses.bw ?? "", "")
      }
    }
    return {} as any
  })
}

describe("BitwardenClient", () => {
  let client: BitwardenClient

  beforeEach(() => {
    vi.clearAllMocks()
    nervesEvents.length = 0
    client = new BitwardenClient()
  })

  afterEach(() => {
    resetBitwardenClient()
  })

  describe("connect()", () => {
    it("connects via CLI when SDK is not available", async () => {
      // Mock bw status to return unlocked status
      mockExecFileSuccess(JSON.stringify({
        status: { data: { template: { status: "unlocked" } } },
      }))

      const config: VaultConfig = {
        accessToken: "test-session-key",
        mode: "cli",
      }
      await client.connect(config)
      expect(client.isConnected()).toBe(true)
    })

    it("stores session key as private state, not as env var", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))

      const config: VaultConfig = {
        accessToken: "secret-session-key",
        mode: "cli",
      }
      await client.connect(config)

      // Verify session key is not in process.env
      expect(process.env.BW_SESSION).toBeUndefined()
      expect(client.isConnected()).toBe(true)
    })

    it("throws descriptive error on bad credentials", async () => {
      mockExecFileError("Invalid master password.")

      const config: VaultConfig = {
        accessToken: "bad-key",
        mode: "cli",
      }
      await expect(client.connect(config)).rejects.toThrow(/Invalid master password/)
    })

    it("emits nerves events for connect start and end", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))

      await client.connect({ accessToken: "key", mode: "cli" })

      const startEvents = nervesEvents.filter((e) => e.event === "client.vault_connect_start")
      const endEvents = nervesEvents.filter((e) => e.event === "client.vault_connect_end")
      expect(startEvents.length).toBeGreaterThanOrEqual(1)
      expect(endEvents.length).toBeGreaterThanOrEqual(1)
    })

    it("emits nerves error event on connect failure", async () => {
      mockExecFileError("CLI not found")

      await expect(client.connect({ accessToken: "key", mode: "cli" })).rejects.toThrow()

      const errorEvents = nervesEvents.filter((e) => e.event === "client.vault_connect_error")
      expect(errorEvents.length).toBeGreaterThanOrEqual(1)
      expect(errorEvents[0].meta).toBeDefined()
    })

    it("handles non-Error thrown during connect", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        const cb = typeof _opts === "function" ? _opts : callback
        cb("string-error", "", "")
        return {} as any
      })

      await expect(client.connect({ accessToken: "key", mode: "cli" })).rejects.toThrow()

      const errorEvents = nervesEvents.filter((e) => e.event === "client.vault_connect_error")
      expect(errorEvents.length).toBeGreaterThanOrEqual(1)
    })

    it("falls back to CLI when SDK dynamic import fails", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))

      // mode: undefined triggers SDK-first attempt
      await client.connect({ accessToken: "key" })
      expect(client.isConnected()).toBe(true)
    })
  })

  describe("connectAuto()", () => {
    it("connects via aac when aac has cached sessions", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify([{ domain: "example.com", created: "2026-01-01" }]),
      })

      await client.connectAuto({ mode: "aac" })
      expect(client.isConnected()).toBe(true)
      expect(client.getMode()).toBe("aac")
    })

    it("throws when aac has no cached sessions", async () => {
      mockExecFileByCommand({ aac: JSON.stringify([]) })

      await expect(client.connectAuto({ mode: "aac" })).rejects.toThrow(/no cached sessions/)
    })

    it("throws when aac returns non-array", async () => {
      mockExecFileByCommand({ aac: JSON.stringify({ status: "ok" }) })

      await expect(client.connectAuto({ mode: "aac" })).rejects.toThrow(/no cached sessions/)
    })

    it("falls back to bw when aac is not available in auto mode", async () => {
      mockExecFileByCommand({
        aacError: "aac: command not found",
        bw: JSON.stringify({ success: true }),
      })

      await client.connectAuto({ accessToken: "key" })
      expect(client.isConnected()).toBe(true)
      expect(client.getMode()).toBe("cli")

      const fallbackEvents = nervesEvents.filter((e) => e.event === "client.vault_aac_fallback")
      expect(fallbackEvents.length).toBe(1)
    })

    it("throws when aac fails in auto mode and no accessToken for bw fallback", async () => {
      mockExecFileByCommand({ aacError: "aac: command not found" })

      await expect(client.connectAuto()).rejects.toThrow(/no accessToken provided/)
    })

    it("connects directly to bw when mode is bw", async () => {
      mockExecFileByCommand({ bw: JSON.stringify({ success: true }) })

      await client.connectAuto({ mode: "bw", accessToken: "key" })
      expect(client.isConnected()).toBe(true)
      expect(client.getMode()).toBe("cli")
    })

    it("throws when mode is bw but no accessToken", async () => {
      await expect(client.connectAuto({ mode: "bw" })).rejects.toThrow(/accessToken is required/)
    })

    it("prefers aac over bw in auto mode", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify([{ domain: "example.com" }]),
        bw: JSON.stringify({ success: true }),
      })

      await client.connectAuto({ accessToken: "key" })
      expect(client.getMode()).toBe("aac")
    })

    it("emits nerves events for connect start and end", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify([{ domain: "example.com" }]),
      })

      await client.connectAuto({ mode: "aac" })

      expect(nervesEvents.some((e) => e.event === "client.vault_connect_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "client.vault_connect_end")).toBe(true)
    })

    it("emits nerves error event on connect failure", async () => {
      mockExecFileByCommand({ aacError: "fail" })

      await expect(client.connectAuto({ mode: "aac" })).rejects.toThrow()

      expect(nervesEvents.some((e) => e.event === "client.vault_connect_error")).toBe(true)
    })

    it("handles non-Error thrown during connectAuto", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        const cb = typeof _opts === "function" ? _opts : callback
        cb("string-error", "", "")
        return {} as any
      })

      await expect(client.connectAuto({ mode: "aac" })).rejects.toThrow()

      const errorEvents = nervesEvents.filter((e) => e.event === "client.vault_connect_error")
      expect(errorEvents.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("getMode()", () => {
    it("returns null before connect", () => {
      expect(client.getMode()).toBeNull()
    })

    it("returns 'cli' after bw connect", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "key", mode: "cli" })
      expect(client.getMode()).toBe("cli")
    })

    it("returns 'aac' after aac connect", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify([{ domain: "example.com" }]),
      })
      await client.connectAuto({ mode: "aac" })
      expect(client.getMode()).toBe("aac")
    })

    it("returns null after disconnect", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "key", mode: "cli" })
      await client.disconnect()
      expect(client.getMode()).toBeNull()
    })
  })

  describe("getCredentialByDomain()", () => {
    beforeEach(async () => {
      mockExecFileByCommand({
        aac: JSON.stringify([{ domain: "example.com" }]),
      })
      await client.connectAuto({ mode: "aac" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("returns credential for a domain", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          domain: "example.com",
          credential: {
            username: "user@example.com",
            password: "secret123",
            totp: "123456",
            uri: "https://example.com",
            notes: "test notes",
          },
        }),
      })

      const cred = await client.getCredentialByDomain("example.com")
      expect(cred.username).toBe("user@example.com")
      expect(cred.password).toBe("secret123")
      expect(cred.totp).toBe("123456")
      expect(cred.uri).toBe("https://example.com")
      expect(cred.notes).toBe("test notes")
    })

    it("passes correct args to aac CLI", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { username: "u", password: "p" },
        }),
      })

      await client.getCredentialByDomain("api.example.com")

      const callArgs = vi.mocked(execFile).mock.calls[0]
      expect(callArgs[0]).toBe("aac")
      expect(callArgs[1]).toContain("--domain")
      expect(callArgs[1]).toContain("api.example.com")
      expect(callArgs[1]).toContain("--output")
      expect(callArgs[1]).toContain("json")
    })

    it("throws when aac returns success: false", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: false,
          error: "no credential found",
        }),
      })

      await expect(client.getCredentialByDomain("missing.com")).rejects.toThrow(/aac lookup failed/)
    })

    it("throws when aac returns success: false with no error field", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({ success: false }),
      })

      await expect(client.getCredentialByDomain("missing.com")).rejects.toThrow(/unknown error/)
    })

    it("throws when not connected", async () => {
      const dc = new BitwardenClient()
      await expect(dc.getCredentialByDomain("x.com")).rejects.toThrow(/vault not connected/)
    })

    it("throws when in bw mode", async () => {
      const bwClient = new BitwardenClient()
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await bwClient.connect({ accessToken: "key", mode: "cli" })

      await expect(bwClient.getCredentialByDomain("x.com")).rejects.toThrow(/requires aac mode/)
    })

    it("emits nerves events for getCredentialByDomain", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { username: "u" },
        }),
      })

      await client.getCredentialByDomain("example.com")

      expect(nervesEvents.some((e) => e.event === "client.request_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "client.request_end")).toBe(true)
    })

    it("emits error event when getCredentialByDomain fails", async () => {
      mockExecFileByCommand({ aacError: "connection refused" })

      await expect(client.getCredentialByDomain("fail.com")).rejects.toThrow()

      expect(nervesEvents.some((e) => e.event === "client.error")).toBe(true)
    })
  })

  describe("getRawSecretByDomain()", () => {
    beforeEach(async () => {
      mockExecFileByCommand({
        aac: JSON.stringify([{ domain: "example.com" }]),
      })
      await client.connectAuto({ mode: "aac" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("returns specific field from domain credential", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { username: "user", password: "secret", totp: "123456" },
        }),
      })

      const secret = await client.getRawSecretByDomain("example.com", "password")
      expect(secret).toBe("secret")
    })

    it("returns totp field", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { totp: "654321" },
        }),
      })

      const totp = await client.getRawSecretByDomain("example.com", "totp")
      expect(totp).toBe("654321")
    })

    it("throws when field is not found on credential", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { username: "user" },
        }),
      })

      await expect(client.getRawSecretByDomain("example.com", "password")).rejects.toThrow(
        /field "password" not found for domain "example.com"/,
      )
    })

    it("throws when not connected", async () => {
      const dc = new BitwardenClient()
      await expect(dc.getRawSecretByDomain("x.com", "password")).rejects.toThrow(/vault not connected/)
    })

    it("throws when in bw mode", async () => {
      const bwClient = new BitwardenClient()
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await bwClient.connect({ accessToken: "key", mode: "cli" })

      await expect(bwClient.getRawSecretByDomain("x.com", "password")).rejects.toThrow(/requires aac mode/)
    })

    it("emits nerves events for getRawSecretByDomain", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { password: "s" },
        }),
      })

      await client.getRawSecretByDomain("example.com", "password")

      expect(nervesEvents.some((e) => e.event === "client.request_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "client.request_end")).toBe(true)
    })
  })

  describe("getRawSecret() in aac mode", () => {
    beforeEach(async () => {
      mockExecFileByCommand({
        aac: JSON.stringify([{ domain: "example.com" }]),
      })
      await client.connectAuto({ mode: "aac" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("delegates to getRawSecretByDomain when in aac mode", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { password: "domain-secret" },
        }),
      })

      // In aac mode, itemId is treated as domain
      const secret = await client.getRawSecret("api.example.com", "password")
      expect(secret).toBe("domain-secret")
    })

    it("emits nerves events when delegating to aac", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { password: "s" },
        }),
      })

      await client.getRawSecret("example.com", "password")

      expect(nervesEvents.some((e) => e.event === "client.request_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "client.request_end")).toBe(true)
    })
  })

  describe("pair()", () => {
    beforeEach(async () => {
      mockExecFileByCommand({
        aac: JSON.stringify([{ domain: "example.com" }]),
      })
      await client.connectAuto({ mode: "aac" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("pairs with a domain using a token", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { username: "user", password: "pass" },
        }),
      })

      const cred = await client.pair("new-site.com", "abc123")
      expect(cred.username).toBe("user")
      expect(cred.password).toBe("pass")
    })

    it("passes correct args including --token", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { username: "u" },
        }),
      })

      await client.pair("new-site.com", "token-xyz")

      const callArgs = vi.mocked(execFile).mock.calls[0]
      expect(callArgs[0]).toBe("aac")
      expect(callArgs[1]).toContain("--domain")
      expect(callArgs[1]).toContain("new-site.com")
      expect(callArgs[1]).toContain("--token")
      expect(callArgs[1]).toContain("token-xyz")
      expect(callArgs[1]).toContain("--output")
      expect(callArgs[1]).toContain("json")
    })

    it("throws when pairing fails", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: false,
          error: "invalid token",
        }),
      })

      await expect(client.pair("site.com", "bad-token")).rejects.toThrow(/pairing failed/)
    })

    it("throws when pairing fails with no error field", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({ success: false }),
      })

      await expect(client.pair("site.com", "bad-token")).rejects.toThrow(/unknown error/)
    })

    it("throws when not connected", async () => {
      const dc = new BitwardenClient()
      await expect(dc.pair("x.com", "t")).rejects.toThrow(/vault not connected/)
    })

    it("throws when in bw mode", async () => {
      const bwClient = new BitwardenClient()
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await bwClient.connect({ accessToken: "key", mode: "cli" })

      await expect(bwClient.pair("x.com", "t")).rejects.toThrow(/requires aac mode/)
    })

    it("emits nerves events for pair", async () => {
      mockExecFileByCommand({
        aac: JSON.stringify({
          success: true,
          credential: { username: "u" },
        }),
      })

      await client.pair("site.com", "token")

      expect(nervesEvents.some((e) => e.event === "client.request_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "client.request_end")).toBe(true)
    })

    it("emits error event when pair fails", async () => {
      mockExecFileByCommand({ aacError: "timeout" })

      await expect(client.pair("site.com", "t")).rejects.toThrow()

      expect(nervesEvents.some((e) => e.event === "client.error")).toBe(true)
    })
  })

  describe("getItem()", () => {
    beforeEach(async () => {
      // Connect first
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "session-key", mode: "cli" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("returns parsed item without raw password fields", async () => {
      const cliResponse = JSON.stringify({
        success: true,
        data: {
          id: "item-123",
          name: "Test Login",
          type: 1,
          notes: "some notes",
          login: {
            username: "user@test.com",
            password: "secret-password-should-be-stripped",
            uris: [{ uri: "https://example.com" }],
          },
          fields: [{ name: "apiKey", value: "key-123" }],
        },
      })
      mockExecFileSuccess(cliResponse)

      const item = await client.getItem("item-123")

      expect(item.id).toBe("item-123")
      expect(item.name).toBe("Test Login")
      expect(item.type).toBe(1)
      expect(item.login?.username).toBe("user@test.com")
      expect(item.login?.uris).toEqual([{ uri: "https://example.com" }])
      // Password should be stripped
      expect((item.login as any)?.password).toBeUndefined()
    })

    it("strips secrets from item with login that has no username or uris", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: {
          id: "item-minimal",
          name: "Minimal Login",
          type: 1,
          login: { password: "secret" },
        },
      }))

      const item = await client.getItem("item-minimal")
      expect(item.login).toBeDefined()
      expect(item.login?.username).toBeUndefined()
      expect(item.login?.uris).toBeUndefined()
      expect((item.login as any)?.password).toBeUndefined()
    })

    it("handles item with no login, no notes, no fields", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: {
          id: "bare-item",
          name: "Bare",
          type: 2,
        },
      }))

      const item = await client.getItem("bare-item")
      expect(item.id).toBe("bare-item")
      expect(item.notes).toBeUndefined()
      expect(item.fields).toBeUndefined()
      expect(item.login).toBeUndefined()
    })

    it("throws 'vault not connected' when not connected", async () => {
      const disconnectedClient = new BitwardenClient()
      await expect(disconnectedClient.getItem("id")).rejects.toThrow(/vault not connected/)
    })

    it("emits nerves events for getItem start and end", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: { id: "x", name: "X", type: 1 },
      }))

      await client.getItem("x")

      const starts = nervesEvents.filter((e) => e.event === "client.request_start")
      const ends = nervesEvents.filter((e) => e.event === "client.request_end")
      expect(starts.length).toBeGreaterThanOrEqual(1)
      expect(ends.length).toBeGreaterThanOrEqual(1)
    })

    it("emits nerves error event when getItem fails", async () => {
      mockExecFileError("Item not found")

      await expect(client.getItem("missing")).rejects.toThrow()

      const errors = nervesEvents.filter((e) => e.event === "client.error")
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })

    it("handles non-Error thrown during getItem for error meta", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        const cb = typeof _opts === "function" ? _opts : callback
        cb("string-error", "", "")
        return {} as any
      })

      await expect(client.getItem("x")).rejects.toThrow()

      const errors = nervesEvents.filter((e) => e.event === "client.error")
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("createItem()", () => {
    beforeEach(async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "session-key", mode: "cli" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("creates item with structured fields and returns handle", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: { id: "new-item-1", name: "API Key", type: 1 },
      }))

      const handle = await client.createItem("API Key", { apiKey: "secret123", service: "weather" })

      expect(handle.id).toBe("new-item-1")
      expect(handle.name).toBe("API Key")
      expect(handle.type).toBe(1)
    })

    it("emits nerves events for create", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: { id: "new", name: "Test", type: 1 },
      }))

      await client.createItem("Test", { key: "val" })

      expect(nervesEvents.some((e) => e.event === "client.request_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "client.request_end")).toBe(true)
    })
  })

  describe("listItems()", () => {
    beforeEach(async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "session-key", mode: "cli" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("returns matching items with search filter", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: {
          data: [
            { id: "1", name: "Weather API", type: 1 },
            { id: "2", name: "Weather Backup", type: 1 },
          ],
        },
      }))

      const items = await client.listItems("Weather")

      expect(items).toHaveLength(2)
      expect(items[0].id).toBe("1")
      expect(items[0].name).toBe("Weather API")
    })

    it("returns all items with no search filter", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: {
          data: [
            { id: "1", name: "Item A", type: 1 },
          ],
        },
      }))

      const items = await client.listItems()

      expect(items).toHaveLength(1)
    })

    it("handles direct array response from CLI", async () => {
      // Some bw list commands return arrays directly
      mockExecFileSuccess(JSON.stringify([
        { id: "1", name: "Direct Array Item", type: 1 },
      ]))

      const items = await client.listItems()
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe("Direct Array Item")
    })

    it("returns empty array for non-array response", async () => {
      // Edge case: neither data.data nor direct array
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: { count: 0 },
      }))

      const items = await client.listItems()
      expect(items).toHaveLength(0)
    })

    it("emits nerves events for list", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: { data: [] },
      }))

      await client.listItems()

      expect(nervesEvents.some((e) => e.event === "client.request_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "client.request_end")).toBe(true)
    })
  })

  describe("deleteItem()", () => {
    beforeEach(async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "session-key", mode: "cli" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("removes item by ID", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))

      await client.deleteItem("item-to-delete")

      expect(execFile).toHaveBeenCalled()
      const callArgs = vi.mocked(execFile).mock.calls[0]
      expect(callArgs[1]).toContain("item-to-delete")
    })

    it("emits nerves events for delete", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))

      await client.deleteItem("id")

      expect(nervesEvents.some((e) => e.event === "client.request_start")).toBe(true)
      expect(nervesEvents.some((e) => e.event === "client.request_end")).toBe(true)
    })

    it("emits error event when delete fails", async () => {
      mockExecFileError("Delete failed")

      await expect(client.deleteItem("id")).rejects.toThrow()

      expect(nervesEvents.some((e) => e.event === "client.error")).toBe(true)
    })
  })

  describe("disconnect()", () => {
    it("sets connected to false and clears session key", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "key", mode: "cli" })
      expect(client.isConnected()).toBe(true)

      await client.disconnect()
      expect(client.isConnected()).toBe(false)
    })

    it("emits nerves event for disconnect", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "key", mode: "cli" })
      nervesEvents.length = 0

      await client.disconnect()

      expect(nervesEvents.some((e) => e.event === "client.vault_disconnect")).toBe(true)
    })
  })

  describe("isConnected()", () => {
    it("returns false before connect", () => {
      expect(client.isConnected()).toBe(false)
    })

    it("returns true after connect", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "key", mode: "cli" })
      expect(client.isConnected()).toBe(true)
    })

    it("returns false after disconnect", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "key", mode: "cli" })
      await client.disconnect()
      expect(client.isConnected()).toBe(false)
    })
  })

  describe("getRawSecret()", () => {
    beforeEach(async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "session-key", mode: "cli" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("returns raw secret value for a specific field", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: {
          id: "item-123",
          name: "Weather API",
          type: 1,
          fields: [
            { name: "apiKey", value: "raw-secret-value" },
            { name: "other", value: "other-val" },
          ],
          login: { password: "pass123" },
        },
      }))

      const secret = await client.getRawSecret("item-123", "apiKey")
      expect(secret).toBe("raw-secret-value")
    })

    it("returns login password when fieldName is 'password'", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: {
          id: "item-123",
          name: "Login",
          type: 1,
          login: { password: "my-password" },
          fields: [],
        },
      }))

      const secret = await client.getRawSecret("item-123", "password")
      expect(secret).toBe("my-password")
    })

    it("throws when item has no fields array and field is not password", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: {
          id: "item-no-fields",
          name: "No Fields",
          type: 2,
          login: {},
        },
      }))

      await expect(client.getRawSecret("item-no-fields", "apiKey")).rejects.toThrow(/field "apiKey" not found/)
    })

    it("throws when field not found", async () => {
      mockExecFileSuccess(JSON.stringify({
        success: true,
        data: {
          id: "item-123",
          name: "Test",
          type: 1,
          fields: [{ name: "other", value: "val" }],
          login: {},
        },
      }))

      await expect(client.getRawSecret("item-123", "missing")).rejects.toThrow(/field "missing" not found/)
    })

    it("throws when not connected", async () => {
      const disconnectedClient = new BitwardenClient()
      await expect(disconnectedClient.getRawSecret("id", "field")).rejects.toThrow(/vault not connected/)
    })
  })

  describe("SDK fallback behavior", () => {
    it("falls back to CLI when SDK import fails and logs helpful message", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))

      // Default mode (undefined) tries SDK first, falls back to CLI
      await client.connect({ accessToken: "key" })

      expect(client.isConnected()).toBe(true)
      // Should have emitted a fallback info event
      const fallbackEvents = nervesEvents.filter(
        (e) => e.event === "client.vault_sdk_fallback",
      )
      expect(fallbackEvents.length).toBeGreaterThanOrEqual(1)
    })

    it("uses CLI mode when explicitly set to cli", async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "key", mode: "cli" })
      expect(client.isConnected()).toBe(true)
      // No SDK fallback event since we went straight to CLI
      const fallbackEvents = nervesEvents.filter(
        (e) => e.event === "client.vault_sdk_fallback",
      )
      expect(fallbackEvents.length).toBe(0)
    })
  })

  describe("parseCliResponse edge cases", () => {
    beforeEach(async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "key", mode: "cli" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("handles CLI response without success/data wrapper", async () => {
      // Some bw commands return raw JSON without the success/data wrapper
      const rawResponse = JSON.stringify({
        id: "raw-item",
        name: "Raw Response",
        type: 1,
        login: { username: "user" },
      })
      mockExecFileSuccess(rawResponse)

      const item = await client.getItem("raw-item")
      expect(item.id).toBe("raw-item")
      expect(item.name).toBe("Raw Response")
    })
  })

  describe("CLI fallback getItem", () => {
    beforeEach(async () => {
      mockExecFileSuccess(JSON.stringify({ success: true }))
      await client.connect({ accessToken: "test-session", mode: "cli" })
      vi.clearAllMocks()
      nervesEvents.length = 0
    })

    it("calls bw get item with --session flag and parses JSON", async () => {
      const itemData = {
        success: true,
        data: {
          id: "cli-item",
          name: "CLI Test",
          type: 1,
          login: { username: "user" },
        },
      }
      mockExecFileSuccess(JSON.stringify(itemData))

      const item = await client.getItem("cli-item")

      expect(item.id).toBe("cli-item")
      // Verify --session flag is used (not env var)
      const callArgs = vi.mocked(execFile).mock.calls[0]
      expect(callArgs[1]).toContain("--session")
    })
  })
})

describe("getBitwardenClient()", () => {
  beforeEach(() => {
    resetBitwardenClient()
  })

  it("returns a singleton BitwardenClient instance", () => {
    const a = getBitwardenClient()
    const b = getBitwardenClient()
    expect(a).toBe(b)
  })

  it("returns a new instance after reset", () => {
    const a = getBitwardenClient()
    resetBitwardenClient()
    const b = getBitwardenClient()
    expect(a).not.toBe(b)
  })
})
