import { describe, it, expect, vi } from "vitest"
import { ContextResolver } from "../../../mind/context/resolver"
import type { CollectionStore, ContextStore } from "../../../mind/context/store"
import type { FriendIdentity, FriendMemory } from "../../../mind/context/types"

function createMockStore(): ContextStore {
  const identityItems = new Map<string, FriendIdentity>()
  const identity: CollectionStore<FriendIdentity> = {
    get: vi.fn(async (id: string) => identityItems.get(id) ?? null),
    put: vi.fn(async (id: string, value: FriendIdentity) => { identityItems.set(id, value) }),
    delete: vi.fn(async (id: string) => { identityItems.delete(id) }),
    find: vi.fn(async (predicate: (value: FriendIdentity) => boolean) => {
      for (const value of identityItems.values()) {
        if (predicate(value)) return value
      }
      return null
    }),
  }

  const memoryItems = new Map<string, FriendMemory>()
  const memory: CollectionStore<FriendMemory> = {
    get: vi.fn(async (id: string) => memoryItems.get(id) ?? null),
    put: vi.fn(async (id: string, value: FriendMemory) => { memoryItems.set(id, value) }),
    delete: vi.fn(async (id: string) => { memoryItems.delete(id) }),
    find: vi.fn(async (predicate: (value: FriendMemory) => boolean) => {
      for (const value of memoryItems.values()) {
        if (predicate(value)) return value
      }
      return null
    }),
  }

  return { identity, memory }
}

describe("ContextResolver", () => {
  it("creates ResolvedContext with identity and channel", async () => {
    const store = createMockStore()
    const resolver = new ContextResolver(store, {
      provider: "aad",
      externalId: "aad-user-1",
      tenantId: "tenant-1",
      displayName: "Jordan",
      channel: "teams",
    })

    const ctx = await resolver.resolve()
    expect(ctx.identity.displayName).toBe("Jordan")
    expect(ctx.identity.externalIds[0].provider).toBe("aad")
    expect(ctx.channel.channel).toBe("teams")
    expect(ctx.channel.availableIntegrations).toEqual(["ado", "graph"])
  })

  it("resolves CLI identity with local provider and CLI capabilities", async () => {
    const store = createMockStore()
    const resolver = new ContextResolver(store, {
      provider: "local",
      externalId: "jsmith",
      displayName: "jsmith",
      channel: "cli",
    })

    const ctx = await resolver.resolve()
    expect(ctx.identity.externalIds[0].provider).toBe("local")
    expect(ctx.identity.externalIds[0].externalId).toBe("jsmith")
    expect(ctx.channel.channel).toBe("cli")
    expect(ctx.channel.availableIntegrations).toEqual([])
    expect(ctx.channel.supportsStreaming).toBe(true)
  })

  it("resolves Teams identity with AAD provider and Teams capabilities", async () => {
    const store = createMockStore()
    const resolver = new ContextResolver(store, {
      provider: "aad",
      externalId: "aad-obj-id",
      tenantId: "t1",
      displayName: "Teams User",
      channel: "teams",
    })

    const ctx = await resolver.resolve()
    expect(ctx.identity.externalIds[0].provider).toBe("aad")
    expect(ctx.identity.tenantMemberships).toContain("t1")
    expect(ctx.channel.channel).toBe("teams")
    expect(ctx.channel.supportsMarkdown).toBe(true)
  })

  it("handles unknown channel with default capabilities", async () => {
    const store = createMockStore()
    const resolver = new ContextResolver(store, {
      provider: "local",
      externalId: "user",
      displayName: "user",
      channel: "unknown" as any,
    })

    const ctx = await resolver.resolve()
    expect(ctx.channel.availableIntegrations).toEqual([])
    expect(ctx.channel.supportsStreaming).toBe(false)
  })

  it("handles identity resolution error gracefully (auto-create)", async () => {
    const store = createMockStore()
    // Make store.identity.find throw
    ;(store.identity.find as any).mockRejectedValue(new Error("disk error"))

    const resolver = new ContextResolver(store, {
      provider: "local",
      externalId: "user",
      displayName: "User",
      channel: "cli",
    })

    const ctx = await resolver.resolve()
    // Should still resolve (identity auto-created on failure)
    expect(ctx.identity.displayName).toBe("User")
    expect(ctx.channel.channel).toBe("cli")
  })

  it("returns readonly fields that reflect resolved data", async () => {
    const store = createMockStore()
    const resolver = new ContextResolver(store, {
      provider: "local",
      externalId: "user",
      displayName: "User",
      channel: "cli",
    })

    const ctx = await resolver.resolve()
    // The identity and channel fields exist and are populated
    expect(ctx.identity).toBeDefined()
    expect(ctx.channel).toBeDefined()
    expect(ctx.identity.id).toBeTruthy()
  })

  it("includes authority checker on ResolvedContext when availableIntegrations is non-empty (Teams)", async () => {
    const store = createMockStore()
    const resolver = new ContextResolver(store, {
      provider: "aad",
      externalId: "aad-user-1",
      tenantId: "tenant-1",
      displayName: "Jordan",
      channel: "teams",
    })

    const ctx = await resolver.resolve()
    // Teams has integrations, so authority checker should be present
    expect(ctx.checker).toBeDefined()
    expect(typeof ctx.checker!.canRead).toBe("function")
    expect(typeof ctx.checker!.canWrite).toBe("function")
    expect(typeof ctx.checker!.record403).toBe("function")
  })

  it("authority checker canWrite uses default probe (optimistic true)", async () => {
    const store = createMockStore()
    const resolver = new ContextResolver(store, {
      provider: "aad",
      externalId: "aad-user-1",
      tenantId: "tenant-1",
      displayName: "Jordan",
      channel: "teams",
    })

    const ctx = await resolver.resolve()
    // Default probe always returns true (optimistic)
    const result = await ctx.checker!.canWrite("ado", "myorg", "createWorkItem")
    expect(result).toBe(true)
  })

  it("skips authority when availableIntegrations is empty (CLI)", async () => {
    const store = createMockStore()
    const resolver = new ContextResolver(store, {
      provider: "local",
      externalId: "jsmith",
      displayName: "jsmith",
      channel: "cli",
    })

    const ctx = await resolver.resolve()
    // CLI has no integrations, so authority checker should be undefined
    expect(ctx.checker).toBeUndefined()
  })

  it("loads existing FriendMemory into ResolvedContext", async () => {
    const store = createMockStore()
    const memory: FriendMemory = {
      id: "placeholder", // will be replaced by actual resolved identity id
      toolPreferences: { ado: "flat backlog view" },
      schemaVersion: 1,
    }

    const resolver = new ContextResolver(store, {
      provider: "aad",
      externalId: "aad-user-1",
      tenantId: "tenant-1",
      displayName: "Jordan",
      channel: "teams",
    })

    // Resolve once to create the identity, then seed memory with correct id
    const firstCtx = await resolver.resolve()
    const friendId = firstCtx.identity.id
    memory.id = friendId
    await store.memory.put(friendId, memory)

    // Resolve again -- memory should be loaded
    const ctx = await resolver.resolve()
    expect(ctx.memory).not.toBeNull()
    expect(ctx.memory!.toolPreferences.ado).toBe("flat backlog view")
  })

  it("returns null memory for new friend with no stored memory", async () => {
    const store = createMockStore()
    const resolver = new ContextResolver(store, {
      provider: "aad",
      externalId: "aad-new-user",
      tenantId: "tenant-1",
      displayName: "New Person",
      channel: "teams",
    })

    const ctx = await resolver.resolve()
    expect(ctx.memory).toBeNull()
  })

  it("returns null memory on store read error (D16)", async () => {
    const store = createMockStore()
    // Seed an identity so we get a stable id
    const resolver = new ContextResolver(store, {
      provider: "local",
      externalId: "user",
      displayName: "User",
      channel: "cli",
    })

    // Make memory.get throw
    vi.mocked(store.memory.get).mockRejectedValue(new Error("disk error"))

    const ctx = await resolver.resolve()
    expect(ctx.memory).toBeNull()
  })
})
