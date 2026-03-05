import { describe, it, expect, vi } from "vitest"
import { accumulateFriendTokens } from "../../../mind/friends/tokens"
import type { FriendStore } from "../../../mind/friends/store"
import type { FriendRecord } from "../../../mind/friends/types"

function makeFriend(overrides: Partial<FriendRecord> = {}): FriendRecord {
  return {
    id: "uuid-1",
    displayName: "Jordan",
    externalIds: [],
    tenantMemberships: [],
    toolPreferences: {},
    notes: {},
    totalTokens: 0,
    createdAt: "2026-03-02T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  }
}

function createMockStore(existing?: FriendRecord | null): FriendStore {
  return {
    get: vi.fn(async () => existing ?? null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    findByExternalId: vi.fn(async () => null),
  }
}

describe("accumulateFriendTokens", () => {
  it("adds usage.total_tokens to a record with totalTokens: 0", async () => {
    const friend = makeFriend({ totalTokens: 0 })
    const store = createMockStore(friend)

    await accumulateFriendTokens(store, "uuid-1", { input_tokens: 500, output_tokens: 800, reasoning_tokens: 200, total_tokens: 1500 })

    expect(store.get).toHaveBeenCalledWith("uuid-1")
    expect(store.put).toHaveBeenCalledWith("uuid-1", expect.objectContaining({ totalTokens: 1500 }))
    // updatedAt should be refreshed
    const putCall = (store.put as ReturnType<typeof vi.fn>).mock.calls[0][1] as FriendRecord
    expect(putCall.updatedAt).not.toBe("2026-03-02T00:00:00.000Z")
  })

  it("accumulates onto existing totalTokens", async () => {
    const friend = makeFriend({ totalTokens: 3000 })
    const store = createMockStore(friend)

    await accumulateFriendTokens(store, "uuid-1", { input_tokens: 1000, output_tokens: 800, reasoning_tokens: 200, total_tokens: 2000 })

    expect(store.put).toHaveBeenCalledWith("uuid-1", expect.objectContaining({ totalTokens: 5000 }))
  })

  it("is a no-op when usage is undefined", async () => {
    const store = createMockStore(makeFriend())

    await accumulateFriendTokens(store, "uuid-1", undefined)

    expect(store.get).not.toHaveBeenCalled()
    expect(store.put).not.toHaveBeenCalled()
  })

  it("is a no-op when usage.total_tokens is 0", async () => {
    const store = createMockStore(makeFriend())

    await accumulateFriendTokens(store, "uuid-1", { input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, total_tokens: 0 })

    expect(store.get).not.toHaveBeenCalled()
    expect(store.put).not.toHaveBeenCalled()
  })

  it("does not crash when record is not found (store.get returns null)", async () => {
    const store = createMockStore(null)

    await accumulateFriendTokens(store, "nonexistent", { input_tokens: 500, output_tokens: 800, reasoning_tokens: 200, total_tokens: 1500 })

    expect(store.get).toHaveBeenCalledWith("nonexistent")
    expect(store.put).not.toHaveBeenCalled()
  })

  it("treats undefined totalTokens on legacy records as 0 via ?? 0 fallback", async () => {
    // Simulate a legacy record with no totalTokens field
    const legacyFriend = makeFriend()
    ;(legacyFriend as any).totalTokens = undefined
    const store = createMockStore(legacyFriend)

    await accumulateFriendTokens(store, "uuid-1", { input_tokens: 500, output_tokens: 800, reasoning_tokens: 200, total_tokens: 1500 })

    expect(store.put).toHaveBeenCalledWith("uuid-1", expect.objectContaining({ totalTokens: 1500 }))
  })
})
