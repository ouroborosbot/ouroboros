import { describe, it, expect, vi } from "vitest"
import type { CollectionStore } from "../../../mind/context/store"
import type { FriendMemory, FriendIdentity } from "../../../mind/context/types"

import { resolveMemory } from "../../../mind/context/memory"

describe("resolveMemory", () => {
  function makeMockMemoryStore(): CollectionStore<FriendMemory> {
    const items = new Map<string, FriendMemory>()
    return {
      get: vi.fn(async (id: string) => items.get(id) ?? null),
      put: vi.fn(async (id: string, value: FriendMemory) => { items.set(id, value) }),
      delete: vi.fn(async (id: string) => { items.delete(id) }),
      find: vi.fn(async (predicate: (value: FriendMemory) => boolean) => {
        for (const value of items.values()) {
          if (predicate(value)) return value
        }
        return null
      }),
    }
  }

  function makeIdentity(id = "uuid-1"): FriendIdentity {
    return {
      id,
      displayName: "Jordan",
      externalIds: [],
      tenantMemberships: [],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      schemaVersion: 1,
    }
  }

  it("returns existing FriendMemory when found for identity", async () => {
    const store = makeMockMemoryStore()
    const memory: FriendMemory = {
      id: "uuid-1",
      toolPreferences: { ado: "Prefers flat backlog view" },
      schemaVersion: 1,
    }
    await store.put("uuid-1", memory)

    const result = await resolveMemory(store, makeIdentity("uuid-1"))
    expect(result).toEqual(memory)
    expect(store.get).toHaveBeenCalledWith("uuid-1")
  })

  it("returns null when no memory exists for identity", async () => {
    const store = makeMockMemoryStore()
    const result = await resolveMemory(store, makeIdentity("uuid-999"))
    expect(result).toBeNull()
  })

  it("returns null on store read error (D16 graceful handling)", async () => {
    const store = makeMockMemoryStore()
    vi.mocked(store.get).mockRejectedValue(new Error("disk failure"))

    const result = await resolveMemory(store, makeIdentity("uuid-1"))
    expect(result).toBeNull()
  })

  it("returns null on non-Error thrown from store", async () => {
    const store = makeMockMemoryStore()
    vi.mocked(store.get).mockRejectedValue("string error")

    const result = await resolveMemory(store, makeIdentity("uuid-1"))
    expect(result).toBeNull()
  })

  it("validates FriendMemory has id, toolPreferences, and schemaVersion", async () => {
    const store = makeMockMemoryStore()
    const memory: FriendMemory = {
      id: "uuid-1",
      toolPreferences: {},
      schemaVersion: 1,
    }
    await store.put("uuid-1", memory)

    const result = await resolveMemory(store, makeIdentity("uuid-1"))
    expect(result).not.toBeNull()
    expect(result!.id).toBe("uuid-1")
    expect(result!.toolPreferences).toEqual({})
    expect(result!.schemaVersion).toBe(1)
  })
})
