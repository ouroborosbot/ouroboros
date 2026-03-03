import { describe, it, expect } from "vitest"
import type { CollectionStore, ContextStore } from "../../../mind/context/store"
import type { FriendIdentity } from "../../../mind/context/types"

// Mock in-memory implementation for interface contract tests
function createMockCollection<T>(): CollectionStore<T> {
  const items = new Map<string, T>()
  return {
    get: async (id: string) => items.get(id) ?? null,
    put: async (id: string, value: T) => { items.set(id, value) },
    delete: async (id: string) => { items.delete(id) },
    find: async (predicate: (value: T) => boolean) => {
      for (const value of items.values()) {
        if (predicate(value)) return value
      }
      return null
    },
  }
}

describe("CollectionStore interface contract", () => {
  it("get returns null for missing id", async () => {
    const store = createMockCollection<FriendIdentity>()
    expect(await store.get("nonexistent")).toBeNull()
  })

  it("put then get returns the stored value", async () => {
    const store = createMockCollection<FriendIdentity>()
    const identity: FriendIdentity = {
      id: "uuid-1",
      displayName: "Jordan",
      externalIds: [],
      tenantMemberships: [],
      createdAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
      schemaVersion: 1,
    }
    await store.put("uuid-1", identity)
    expect(await store.get("uuid-1")).toEqual(identity)
  })

  it("delete then get returns null", async () => {
    const store = createMockCollection<FriendIdentity>()
    const identity: FriendIdentity = {
      id: "uuid-1",
      displayName: "Jordan",
      externalIds: [],
      tenantMemberships: [],
      createdAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
      schemaVersion: 1,
    }
    await store.put("uuid-1", identity)
    await store.delete("uuid-1")
    expect(await store.get("uuid-1")).toBeNull()
  })

  it("find with matching predicate returns item", async () => {
    const store = createMockCollection<FriendIdentity>()
    const identity: FriendIdentity = {
      id: "uuid-1",
      displayName: "Jordan",
      externalIds: [
        { provider: "aad", externalId: "aad-id", tenantId: "t1", linkedAt: "2026-03-02T00:00:00.000Z" },
      ],
      tenantMemberships: ["t1"],
      createdAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
      schemaVersion: 1,
    }
    await store.put("uuid-1", identity)
    const found = await store.find(
      (v) => v.externalIds.some((e) => e.externalId === "aad-id")
    )
    expect(found).toEqual(identity)
  })

  it("find with no match returns null", async () => {
    const store = createMockCollection<FriendIdentity>()
    const identity: FriendIdentity = {
      id: "uuid-1",
      displayName: "Jordan",
      externalIds: [],
      tenantMemberships: [],
      createdAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
      schemaVersion: 1,
    }
    await store.put("uuid-1", identity)
    const found = await store.find((v) => v.displayName === "Nobody")
    expect(found).toBeNull()
  })
})

describe("ContextStore interface contract", () => {
  it("has identity collection typed as CollectionStore<FriendIdentity>", () => {
    const mockIdentity = createMockCollection<FriendIdentity>()
    const store: ContextStore = { identity: mockIdentity }
    expect(store.identity).toBe(mockIdentity)
  })
})
