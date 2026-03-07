import { beforeEach, describe, expect, it, vi } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { enforceTrustGate, STRANGER_AUTO_REPLY } from "../../senses/trust-gate"
import type { FriendRecord } from "../../mind/friends/types"

function makeFriend(overrides: Partial<FriendRecord> = {}): FriendRecord {
  return {
    id: "friend-1",
    name: "Jordan",
    role: "friend",
    trustLevel: "friend",
    connections: [],
    externalIds: [],
    tenantMemberships: [],
    toolPreferences: {},
    notes: {},
    totalTokens: 0,
    createdAt: "2026-03-07T00:00:00.000Z",
    updatedAt: "2026-03-07T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  }
}

describe("trust gate", () => {
  let bundleRoot: string

  beforeEach(() => {
    bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trust-gate-test-"))
  })

  it("allows non-stranger traffic", () => {
    const result = enforceTrustGate({
      bundleRoot,
      provider: "aad",
      externalId: "aad-123",
      channel: "teams",
      friend: makeFriend({ trustLevel: "family" }),
      now: () => new Date("2026-03-07T01:00:00.000Z"),
    })

    expect(result).toEqual({ allowed: true })
  })

  it("returns one-time auto-reply for first stranger contact and persists state", () => {
    const result = enforceTrustGate({
      bundleRoot,
      provider: "aad",
      externalId: "aad-stranger-1",
      tenantId: "tenant-1",
      channel: "teams",
      friend: makeFriend({ trustLevel: "stranger" }),
      now: () => new Date("2026-03-07T01:01:00.000Z"),
    })

    expect(result.allowed).toBe(false)
    expect(result.autoReply).toBe(STRANGER_AUTO_REPLY)
    expect(result.reason).toBe("stranger_first_reply")

    const repliesPath = path.join(bundleRoot, "stranger-replies.json")
    const state = JSON.parse(fs.readFileSync(repliesPath, "utf8")) as Record<string, string>
    expect(Object.keys(state)).toHaveLength(1)

    const notificationsPath = path.join(bundleRoot, "inbox", "primary-notifications.jsonl")
    const notificationLines = fs.readFileSync(notificationsPath, "utf8").trim().split("\n")
    expect(notificationLines.length).toBe(1)
    expect(notificationLines[0]).toContain("Unknown contact tried to message me")
    expect(notificationLines[0]).toContain("ouro link")
  })

  it("silently drops subsequent messages from the same stranger identity", () => {
    const first = enforceTrustGate({
      bundleRoot,
      provider: "aad",
      externalId: "aad-stranger-2",
      tenantId: "tenant-1",
      channel: "teams",
      friend: makeFriend({ trustLevel: "stranger" }),
      now: () => new Date("2026-03-07T01:02:00.000Z"),
    })
    expect(first.reason).toBe("stranger_first_reply")

    const second = enforceTrustGate({
      bundleRoot,
      provider: "aad",
      externalId: "aad-stranger-2",
      tenantId: "tenant-1",
      channel: "teams",
      friend: makeFriend({ trustLevel: "stranger" }),
      now: () => new Date("2026-03-07T01:03:00.000Z"),
    })

    expect(second).toEqual({
      allowed: false,
      reason: "stranger_silent_drop",
    })

    const notificationsPath = path.join(bundleRoot, "inbox", "primary-notifications.jsonl")
    const notificationLines = fs.readFileSync(notificationsPath, "utf8").trim().split("\n")
    expect(notificationLines.length).toBe(1)
  })

  it("recovers from malformed stranger-replies.json", () => {
    fs.writeFileSync(path.join(bundleRoot, "stranger-replies.json"), "{bad-json", "utf8")

    const result = enforceTrustGate({
      bundleRoot,
      provider: "aad",
      externalId: "aad-stranger-3",
      channel: "teams",
      friend: makeFriend({ trustLevel: "stranger" }),
      now: () => new Date("2026-03-07T01:04:00.000Z"),
    })

    expect(result.reason).toBe("stranger_first_reply")
    const state = JSON.parse(fs.readFileSync(path.join(bundleRoot, "stranger-replies.json"), "utf8")) as Record<string, string>
    expect(Object.keys(state)).toHaveLength(1)
  })

  it("treats empty stranger-replies.json as an empty state", () => {
    fs.writeFileSync(path.join(bundleRoot, "stranger-replies.json"), "", "utf8")

    const result = enforceTrustGate({
      bundleRoot,
      provider: "aad",
      externalId: "aad-stranger-empty-state",
      channel: "teams",
      friend: makeFriend({ trustLevel: "stranger" }),
      now: () => new Date("2026-03-07T01:04:30.000Z"),
    })

    expect(result.reason).toBe("stranger_first_reply")
    const state = JSON.parse(fs.readFileSync(path.join(bundleRoot, "stranger-replies.json"), "utf8")) as Record<string, string>
    expect(Object.keys(state)).toHaveLength(1)
  })

  it("treats array stranger-replies payload as empty and uses default now timestamp", () => {
    fs.writeFileSync(path.join(bundleRoot, "stranger-replies.json"), "[]", "utf8")

    const result = enforceTrustGate({
      bundleRoot,
      provider: "aad",
      externalId: "aad-stranger-array-state",
      channel: "teams",
      friend: makeFriend({ trustLevel: "stranger" }),
    })

    expect(result.reason).toBe("stranger_first_reply")
    const state = JSON.parse(fs.readFileSync(path.join(bundleRoot, "stranger-replies.json"), "utf8")) as Record<string, string>
    const timestamps = Object.values(state)
    expect(timestamps).toHaveLength(1)
    expect(timestamps[0]).toMatch(/^20\d\d-/)
  })

  it("still blocks stranger input when bundleRoot points to an existing file", () => {
    const invalidBundleRoot = path.join(os.tmpdir(), `trust-gate-invalid-${Date.now()}.txt`)
    fs.writeFileSync(invalidBundleRoot, "occupied", "utf8")

    try {
      const result = enforceTrustGate({
        bundleRoot: invalidBundleRoot,
        provider: "aad",
        externalId: "aad-stranger-invalid-root",
        channel: "teams",
        friend: makeFriend({ trustLevel: "stranger" }),
      })

      expect(result).toEqual({
        allowed: false,
        reason: "stranger_first_reply",
        autoReply: STRANGER_AUTO_REPLY,
      })
    } finally {
      fs.unlinkSync(invalidBundleRoot)
    }
  })

})

describe("trust gate error branches (module mocks)", () => {
  it("still blocks stranger input when reply-state persistence fails", async () => {
    vi.resetModules()
    const emitNervesEvent = vi.fn()

    vi.doMock("fs", () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => ""),
      writeFileSync: vi.fn(() => {
        throw "disk full"
      }),
      mkdirSync: vi.fn(),
      appendFileSync: vi.fn(),
    }))
    vi.doMock("../../heart/identity", () => ({ getAgentRoot: () => "/mock/bundle" }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent }))

    const { enforceTrustGate: dynamicGate, STRANGER_AUTO_REPLY: dynamicReply } = await import("../../senses/trust-gate")
    const result = dynamicGate({
      provider: "aad",
      externalId: "aad-stranger-write-fail",
      channel: "teams",
      friend: makeFriend({ trustLevel: "stranger" }),
      now: () => new Date("2026-03-07T01:05:00.000Z"),
    })

    expect(result).toEqual({
      allowed: false,
      reason: "stranger_first_reply",
      autoReply: dynamicReply,
    })
    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "senses.trust_gate_error",
      message: "failed to persist stranger reply state",
      component: "senses",
    }))
  })

  it("still blocks stranger input when primary notification append fails", async () => {
    vi.resetModules()
    const emitNervesEvent = vi.fn()

    vi.doMock("fs", () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => ""),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      appendFileSync: vi.fn(() => {
        throw "append failed"
      }),
    }))
    vi.doMock("../../heart/identity", () => ({ getAgentRoot: () => "/mock/bundle" }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent }))

    const { enforceTrustGate: dynamicGate, STRANGER_AUTO_REPLY: dynamicReply } = await import("../../senses/trust-gate")
    const result = dynamicGate({
      provider: "aad",
      externalId: "aad-stranger-append-fail",
      channel: "teams",
      friend: makeFriend({ trustLevel: "stranger" }),
      now: () => new Date("2026-03-07T01:06:00.000Z"),
    })

    expect(result).toEqual({
      allowed: false,
      reason: "stranger_first_reply",
      autoReply: dynamicReply,
    })
    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "senses.trust_gate_error",
      message: "failed to persist primary stranger notification",
      component: "senses",
    }))
  })
})
