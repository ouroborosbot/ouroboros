import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the bitwarden client module
const mockGetItem = vi.fn()
const mockCreateItem = vi.fn()
const mockListItems = vi.fn()
const mockDeleteItem = vi.fn()
const mockIsConnected = vi.fn().mockReturnValue(true)
const mockGetMode = vi.fn().mockReturnValue("cli")
const mockGetCredentialByDomain = vi.fn()
const mockPair = vi.fn()

vi.mock("../../repertoire/bitwarden-client", () => ({
  getBitwardenClient: vi.fn(() => ({
    getItem: mockGetItem,
    createItem: mockCreateItem,
    listItems: mockListItems,
    deleteItem: mockDeleteItem,
    isConnected: mockIsConnected,
    getMode: mockGetMode,
    getCredentialByDomain: mockGetCredentialByDomain,
    pair: mockPair,
  })),
}))

// Track nerves events
const nervesEvents: Array<Record<string, unknown>> = []
vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn((event: Record<string, unknown>) => {
    nervesEvents.push(event)
  }),
}))

import { vaultToolDefinitions } from "../../repertoire/tools-vault"

function findTool(name: string) {
  const def = vaultToolDefinitions.find((d) => d.tool.function.name === name)
  if (!def) throw new Error(`Tool ${name} not found in vaultToolDefinitions`)
  return def
}

describe("vaultToolDefinitions", () => {
  it("exports an array of 5 tool definitions", () => {
    expect(vaultToolDefinitions).toHaveLength(5)
  })

  it("contains vault_get, vault_store, vault_list, vault_delete, vault_pair", () => {
    const names = vaultToolDefinitions.map((d) => d.tool.function.name)
    expect(names).toContain("vault_get")
    expect(names).toContain("vault_store")
    expect(names).toContain("vault_list")
    expect(names).toContain("vault_delete")
    expect(names).toContain("vault_pair")
  })

  it("vault_store has confirmationRequired true", () => {
    expect(findTool("vault_store").confirmationRequired).toBe(true)
  })

  it("vault_delete has confirmationRequired true", () => {
    expect(findTool("vault_delete").confirmationRequired).toBe(true)
  })

  it("vault_pair has confirmationRequired true", () => {
    expect(findTool("vault_pair").confirmationRequired).toBe(true)
  })

  it("vault_get does not have confirmationRequired", () => {
    expect(findTool("vault_get").confirmationRequired).toBeFalsy()
  })

  it("vault_list does not have confirmationRequired", () => {
    expect(findTool("vault_list").confirmationRequired).toBeFalsy()
  })

  it("no tools have integration gate (they are base tools)", () => {
    for (const def of vaultToolDefinitions) {
      expect(def.integration).toBeUndefined()
    }
  })
})

describe("vault_get handler", () => {
  const handler = findTool("vault_get").handler

  beforeEach(() => {
    vi.clearAllMocks()
    nervesEvents.length = 0
    mockIsConnected.mockReturnValue(true)
    mockGetMode.mockReturnValue("cli")
  })

  it("with id calls client.getItem(id)", async () => {
    mockGetItem.mockResolvedValue({
      id: "item-1",
      name: "Test",
      type: 1,
      login: { username: "user" },
    })

    const result = await handler({ id: "item-1" })

    expect(mockGetItem).toHaveBeenCalledWith("item-1")
    expect(result).toContain("item-1")
    expect(result).toContain("Test")
  })

  it("with name calls client.listItems(name) then client.getItem(first.id)", async () => {
    mockListItems.mockResolvedValue([
      { id: "found-1", name: "My API Key", type: 1 },
    ])
    mockGetItem.mockResolvedValue({
      id: "found-1",
      name: "My API Key",
      type: 1,
    })

    const result = await handler({ name: "My API Key" })

    expect(mockListItems).toHaveBeenCalledWith("My API Key")
    expect(mockGetItem).toHaveBeenCalledWith("found-1")
    expect(result).toContain("found-1")
  })

  it("with neither id, name, nor domain returns error message", async () => {
    const result = await handler({})

    expect(result).toContain("id")
    expect(result).toContain("name")
    expect(result).toContain("domain")
    expect(mockGetItem).not.toHaveBeenCalled()
  })

  it("with name but no matching items returns error", async () => {
    mockListItems.mockResolvedValue([])

    const result = await handler({ name: "nonexistent" })

    expect(result).toContain("No vault item found")
  })

  it("emits nerves events", async () => {
    mockGetItem.mockResolvedValue({ id: "x", name: "X", type: 1 })

    await handler({ id: "x" })

    expect(nervesEvents.some((e) => e.event === "repertoire.vault_tool_call")).toBe(true)
  })

  it("returns error when vault is locked", async () => {
    mockGetItem.mockRejectedValue(new Error("vault not connected"))

    const result = await handler({ id: "x" })

    expect(result).toContain("vault")
  })

  describe("domain-based lookup (aac mode)", () => {
    beforeEach(() => {
      mockGetMode.mockReturnValue("aac")
    })

    it("with domain calls client.getCredentialByDomain(domain)", async () => {
      mockGetCredentialByDomain.mockResolvedValue({
        username: "user@example.com",
        password: "secret",
        uri: "https://example.com",
      })

      const result = await handler({ domain: "example.com" })

      expect(mockGetCredentialByDomain).toHaveBeenCalledWith("example.com")
      expect(result).toContain("user@example.com")
      // Password should be redacted
      expect(result).toContain("[REDACTED]")
      expect(result).not.toContain("secret")
    })

    it("with domain shows credential without password when password is absent", async () => {
      mockGetCredentialByDomain.mockResolvedValue({
        username: "user@example.com",
        uri: "https://example.com",
      })

      const result = await handler({ domain: "example.com" })
      expect(result).toContain("user@example.com")
      expect(result).not.toContain("[REDACTED]")
    })

    it("with domain returns error when not in aac mode", async () => {
      mockGetMode.mockReturnValue("cli")

      const result = await handler({ domain: "example.com" })

      expect(result).toContain("aac mode")
      expect(mockGetCredentialByDomain).not.toHaveBeenCalled()
    })

    it("with domain returns error when credential lookup fails", async () => {
      mockGetCredentialByDomain.mockRejectedValue(new Error("aac lookup failed"))

      const result = await handler({ domain: "fail.com" })

      expect(result).toContain("aac lookup failed")
    })
  })
})

describe("vault_store handler", () => {
  const handler = findTool("vault_store").handler

  beforeEach(() => {
    vi.clearAllMocks()
    nervesEvents.length = 0
  })

  it("calls client.createItem() with correct args", async () => {
    mockCreateItem.mockResolvedValue({ id: "new-1", name: "Test Cred", type: 1 })

    const result = await handler({
      name: "Test Cred",
      username: "user@test.com",
      password: "secret",
      uri: "https://test.com",
      notes: "test notes",
    })

    expect(mockCreateItem).toHaveBeenCalled()
    const callArgs = mockCreateItem.mock.calls[0]
    expect(callArgs[0]).toBe("Test Cred")
    expect(result).toContain("new-1")
  })

  it("handles fields as JSON string", async () => {
    mockCreateItem.mockResolvedValue({ id: "new-2", name: "With Fields", type: 1 })

    await handler({
      name: "With Fields",
      fields: JSON.stringify({ apiKey: "key123", region: "us-east" }),
    })

    expect(mockCreateItem).toHaveBeenCalled()
  })

  it("emits nerves events", async () => {
    mockCreateItem.mockResolvedValue({ id: "x", name: "X", type: 1 })

    await handler({ name: "X" })

    expect(nervesEvents.some((e) => e.event === "repertoire.vault_tool_call")).toBe(true)
  })

  it("returns error when create fails", async () => {
    mockCreateItem.mockRejectedValue(new Error("Create failed"))

    const result = await handler({ name: "Bad Cred" })

    expect(result).toContain("Vault error")
    expect(result).toContain("Create failed")
  })
})

describe("vault_list handler", () => {
  const handler = findTool("vault_list").handler

  beforeEach(() => {
    vi.clearAllMocks()
    nervesEvents.length = 0
  })

  it("with search calls client.listItems(search)", async () => {
    mockListItems.mockResolvedValue([
      { id: "1", name: "Weather API", type: 1 },
    ])

    const result = await handler({ search: "Weather" })

    expect(mockListItems).toHaveBeenCalledWith("Weather")
    expect(result).toContain("Weather API")
  })

  it("without search calls client.listItems()", async () => {
    mockListItems.mockResolvedValue([])

    await handler({})

    expect(mockListItems).toHaveBeenCalledWith(undefined)
  })

  it("emits nerves events", async () => {
    mockListItems.mockResolvedValue([])

    await handler({})

    expect(nervesEvents.some((e) => e.event === "repertoire.vault_tool_call")).toBe(true)
  })

  it("returns error when list fails", async () => {
    mockListItems.mockRejectedValue(new Error("List failed"))

    const result = await handler({})

    expect(result).toContain("Vault error")
    expect(result).toContain("List failed")
  })
})

describe("vault_delete handler", () => {
  const handler = findTool("vault_delete").handler

  beforeEach(() => {
    vi.clearAllMocks()
    nervesEvents.length = 0
  })

  it("calls client.deleteItem(id)", async () => {
    mockDeleteItem.mockResolvedValue(undefined)

    const result = await handler({ id: "item-to-delete" })

    expect(mockDeleteItem).toHaveBeenCalledWith("item-to-delete")
    expect(result).toContain("deleted")
  })

  it("emits nerves events", async () => {
    mockDeleteItem.mockResolvedValue(undefined)

    await handler({ id: "x" })

    expect(nervesEvents.some((e) => e.event === "repertoire.vault_tool_call")).toBe(true)
  })

  it("returns error when delete fails", async () => {
    mockDeleteItem.mockRejectedValue(new Error("Delete failed"))

    const result = await handler({ id: "x" })

    expect(result).toContain("failed")
  })
})

describe("vault_pair handler", () => {
  const handler = findTool("vault_pair").handler

  beforeEach(() => {
    vi.clearAllMocks()
    nervesEvents.length = 0
    mockGetMode.mockReturnValue("aac")
  })

  it("calls client.pair(domain, token) and returns redacted credential", async () => {
    mockPair.mockResolvedValue({
      username: "user@site.com",
      password: "secret123",
      uri: "https://site.com",
    })

    const result = await handler({ domain: "site.com", token: "abc123" })

    expect(mockPair).toHaveBeenCalledWith("site.com", "abc123")
    expect(result).toContain("Paired successfully")
    expect(result).toContain("site.com")
    expect(result).toContain("[REDACTED]")
    expect(result).not.toContain("secret123")
  })

  it("shows credential without password when password is absent", async () => {
    mockPair.mockResolvedValue({
      username: "user@site.com",
    })

    const result = await handler({ domain: "site.com", token: "abc123" })

    expect(result).toContain("Paired successfully")
    expect(result).not.toContain("[REDACTED]")
  })

  it("returns error when not in aac mode", async () => {
    mockGetMode.mockReturnValue("cli")

    const result = await handler({ domain: "site.com", token: "abc123" })

    expect(result).toContain("aac mode")
    expect(mockPair).not.toHaveBeenCalled()
  })

  it("returns error when pair fails", async () => {
    mockPair.mockRejectedValue(new Error("invalid token"))

    const result = await handler({ domain: "site.com", token: "bad" })

    expect(result).toContain("Vault pair failed")
    expect(result).toContain("invalid token")
  })

  it("emits nerves events", async () => {
    mockPair.mockResolvedValue({ username: "u" })

    await handler({ domain: "site.com", token: "t" })

    expect(nervesEvents.some((e) => e.event === "repertoire.vault_tool_call")).toBe(true)
  })
})
