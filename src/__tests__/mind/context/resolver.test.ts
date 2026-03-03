import { describe, it, expect, vi } from "vitest"
import { ContextResolver } from "../../../mind/context/resolver"
import type { CollectionStore, ContextStore } from "../../../mind/context/store"
import type { FriendIdentity } from "../../../mind/context/types"

function createMockStore(): ContextStore {
  const items = new Map<string, FriendIdentity>()
  const identity: CollectionStore<FriendIdentity> = {
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
  return { identity }
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
})
