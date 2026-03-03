import { describe, it, expect, vi, beforeEach } from "vitest"
import { resolveIdentity } from "../../../mind/context/identity"
import type { CollectionStore } from "../../../mind/context/store"
import type { FriendIdentity } from "../../../mind/context/types"

function createMockCollection(): CollectionStore<FriendIdentity> & {
  _items: Map<string, FriendIdentity>
} {
  const items = new Map<string, FriendIdentity>()
  return {
    _items: items,
    get: vi.fn(async (id: string) => items.get(id) ?? null),
    put: vi.fn(async (id: string, value: FriendIdentity) => { items.set(id, value) }),
    delete: vi.fn(async (id: string) => { items.delete(id) }),
    find: vi.fn(async (predicate: (value: FriendIdentity) => boolean) => {
      for (const value of items.values()) {
        if (predicate(value)) return value
      }
      return null
    }),
  }
}

describe("resolveIdentity", () => {
  let store: ReturnType<typeof createMockCollection>

  beforeEach(() => {
    store = createMockCollection()
  })

  it("creates new identity on first resolution", async () => {
    const result = await resolveIdentity(store, {
      provider: "aad",
      externalId: "aad-user-1",
      tenantId: "tenant-1",
      displayName: "Jordan Smith",
    })

    expect(result.displayName).toBe("Jordan Smith")
    expect(result.externalIds).toHaveLength(1)
    expect(result.externalIds[0].provider).toBe("aad")
    expect(result.externalIds[0].externalId).toBe("aad-user-1")
    expect(result.externalIds[0].tenantId).toBe("tenant-1")
    expect(result.id).toBeTruthy()
    expect(result.schemaVersion).toBe(1)
    expect(result.createdAt).toBeTruthy()
    expect(result.updatedAt).toBeTruthy()
    // Should have been persisted
    expect(store.put).toHaveBeenCalledWith(result.id, result)
  })

  it("returns existing identity on repeat resolution", async () => {
    const first = await resolveIdentity(store, {
      provider: "aad",
      externalId: "aad-user-1",
      tenantId: "tenant-1",
      displayName: "Jordan Smith",
    })
    const second = await resolveIdentity(store, {
      provider: "aad",
      externalId: "aad-user-1",
      tenantId: "tenant-1",
      displayName: "Jordan Smith",
    })

    expect(second.id).toBe(first.id)
    // find was called, not a new put for a new identity
    expect(store.find).toHaveBeenCalled()
  })

  it("resolves Teams identity with AAD provider", async () => {
    const result = await resolveIdentity(store, {
      provider: "aad",
      externalId: "aad-object-id",
      tenantId: "tenant-id",
      displayName: "Teams User",
    })

    expect(result.externalIds[0].provider).toBe("aad")
    expect(result.externalIds[0].externalId).toBe("aad-object-id")
    expect(result.externalIds[0].tenantId).toBe("tenant-id")
    expect(result.tenantMemberships).toContain("tenant-id")
  })

  it("resolves CLI identity with local provider", async () => {
    const result = await resolveIdentity(store, {
      provider: "local",
      externalId: "jsmith",
      displayName: "jsmith",
    })

    expect(result.externalIds[0].provider).toBe("local")
    expect(result.externalIds[0].externalId).toBe("jsmith")
    expect(result.externalIds[0].tenantId).toBeUndefined()
    expect(result.tenantMemberships).toEqual([])
  })

  it("sets createdAt and updatedAt as ISO date strings", async () => {
    const result = await resolveIdentity(store, {
      provider: "local",
      externalId: "jsmith",
      displayName: "jsmith",
    })

    // ISO date strings should be parseable
    expect(() => new Date(result.createdAt)).not.toThrow()
    expect(() => new Date(result.updatedAt)).not.toThrow()
    expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt)
  })

  it("generates a UUID for the internal id", async () => {
    const result = await resolveIdentity(store, {
      provider: "local",
      externalId: "user1",
      displayName: "User 1",
    })

    // UUID v4 pattern: 8-4-4-4-12 hex chars
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it("populates tenantMemberships for AAD identities", async () => {
    const result = await resolveIdentity(store, {
      provider: "aad",
      externalId: "aad-id",
      tenantId: "tenant-abc",
      displayName: "User",
    })

    expect(result.tenantMemberships).toEqual(["tenant-abc"])
  })

  it("does not populate tenantMemberships for local identities", async () => {
    const result = await resolveIdentity(store, {
      provider: "local",
      externalId: "jsmith",
      displayName: "jsmith",
    })

    expect(result.tenantMemberships).toEqual([])
  })

  it("handles store read failure by creating new identity", async () => {
    // Make find throw
    store.find = vi.fn(async () => { throw new Error("disk failure") })

    const result = await resolveIdentity(store, {
      provider: "local",
      externalId: "user1",
      displayName: "User 1",
    })

    // Should still return an identity (auto-create fallback)
    expect(result.displayName).toBe("User 1")
    expect(result.id).toBeTruthy()
  })

  it("handles store write failure gracefully (logs and continues)", async () => {
    store.put = vi.fn(async () => { throw new Error("disk failure") })
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await resolveIdentity(store, {
      provider: "local",
      externalId: "user1",
      displayName: "User 1",
    })

    // Should still return the identity even though write failed
    expect(result.displayName).toBe("User 1")
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
