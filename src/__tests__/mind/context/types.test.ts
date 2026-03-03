import { describe, it, expect } from "vitest"
import {
  isIdentityProvider,
  isIntegration,
  type IdentityProvider,
  type Integration,
  type ExternalId,
  type FriendIdentity,
  type ChannelCapabilities,
  type ResolvedContext,
} from "../../../mind/context/types"

describe("IdentityProvider type guard", () => {
  it("accepts 'aad'", () => {
    expect(isIdentityProvider("aad")).toBe(true)
  })

  it("accepts 'local'", () => {
    expect(isIdentityProvider("local")).toBe(true)
  })

  it("rejects invalid strings", () => {
    expect(isIdentityProvider("google")).toBe(false)
    expect(isIdentityProvider("")).toBe(false)
    expect(isIdentityProvider("AAD")).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(isIdentityProvider(42)).toBe(false)
    expect(isIdentityProvider(null)).toBe(false)
    expect(isIdentityProvider(undefined)).toBe(false)
  })
})

describe("Integration type guard", () => {
  it("accepts 'ado'", () => {
    expect(isIntegration("ado")).toBe(true)
  })

  it("accepts 'github'", () => {
    expect(isIntegration("github")).toBe(true)
  })

  it("accepts 'graph'", () => {
    expect(isIntegration("graph")).toBe(true)
  })

  it("rejects invalid strings", () => {
    expect(isIntegration("slack")).toBe(false)
    expect(isIntegration("")).toBe(false)
    expect(isIntegration("ADO")).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(isIntegration(123)).toBe(false)
    expect(isIntegration(null)).toBe(false)
    expect(isIntegration(undefined)).toBe(false)
  })
})

describe("ExternalId type", () => {
  it("constructs with all required fields", () => {
    const id: ExternalId = {
      provider: "aad",
      externalId: "abc-123",
      linkedAt: "2026-03-02T00:00:00.000Z",
    }
    expect(id.provider).toBe("aad")
    expect(id.externalId).toBe("abc-123")
    expect(id.linkedAt).toBe("2026-03-02T00:00:00.000Z")
    expect(id.tenantId).toBeUndefined()
  })

  it("constructs with optional tenantId", () => {
    const id: ExternalId = {
      provider: "aad",
      externalId: "abc-123",
      tenantId: "tenant-456",
      linkedAt: "2026-03-02T00:00:00.000Z",
    }
    expect(id.tenantId).toBe("tenant-456")
  })
})

describe("FriendIdentity type", () => {
  it("constructs with all required fields", () => {
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
    expect(identity.id).toBe("uuid-1")
    expect(identity.displayName).toBe("Jordan")
    expect(identity.externalIds).toHaveLength(1)
    expect(identity.tenantMemberships).toEqual(["t1"])
    expect(identity.schemaVersion).toBe(1)
  })
})

describe("ChannelCapabilities type", () => {
  it("constructs CLI capabilities", () => {
    const caps: ChannelCapabilities = {
      channel: "cli",
      availableIntegrations: [],
      supportsMarkdown: false,
      supportsStreaming: true,
      supportsRichCards: false,
      maxMessageLength: Infinity,
    }
    expect(caps.channel).toBe("cli")
    expect(caps.availableIntegrations).toEqual([])
    expect(caps.supportsStreaming).toBe(true)
    expect(caps.maxMessageLength).toBe(Infinity)
  })

  it("constructs Teams capabilities", () => {
    const caps: ChannelCapabilities = {
      channel: "teams",
      availableIntegrations: ["ado", "graph"],
      supportsMarkdown: true,
      supportsStreaming: false,
      supportsRichCards: true,
      maxMessageLength: 4000,
    }
    expect(caps.channel).toBe("teams")
    expect(caps.availableIntegrations).toEqual(["ado", "graph"])
    expect(caps.supportsRichCards).toBe(true)
    expect(caps.maxMessageLength).toBe(4000)
  })
})

describe("ResolvedContext type", () => {
  it("constructs with identity and channel", () => {
    const identity: FriendIdentity = {
      id: "uuid-1",
      displayName: "Jordan",
      externalIds: [],
      tenantMemberships: [],
      createdAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
      schemaVersion: 1,
    }
    const channel: ChannelCapabilities = {
      channel: "cli",
      availableIntegrations: [],
      supportsMarkdown: false,
      supportsStreaming: true,
      supportsRichCards: false,
      maxMessageLength: Infinity,
    }
    const ctx: ResolvedContext = { identity, channel }
    expect(ctx.identity).toBe(identity)
    expect(ctx.channel).toBe(channel)
  })
})
