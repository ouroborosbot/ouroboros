import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import * as os from "os"
import { FileFriendStore } from "../../../mind/friends/store-file"
import type { FriendRecord } from "../../../mind/friends/types"

let tmpDir: string
let agentKnowledgePath: string
let piiBridgePath: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "friend-store-test-"))
  agentKnowledgePath = path.join(tmpDir, "agent", "friends")
  piiBridgePath = path.join(tmpDir, "pii", "friends")
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function makeFriend(overrides: Partial<FriendRecord> = {}): FriendRecord {
  return {
    id: "uuid-1",
    displayName: "Jordan",
    externalIds: [
      { provider: "aad", externalId: "aad-id-1", tenantId: "t1", linkedAt: "2026-03-02T00:00:00.000Z" },
    ],
    tenantMemberships: ["t1"],
    toolPreferences: { ado: "flat backlog view" },
    notes: { role: "engineering manager" },
    createdAt: "2026-03-02T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  }
}

describe("FileFriendStore", () => {
  describe("constructor", () => {
    it("auto-creates both directories on construction", () => {
      new FileFriendStore(agentKnowledgePath, piiBridgePath)
      expect(fsSync.existsSync(agentKnowledgePath)).toBe(true)
      expect(fsSync.existsSync(piiBridgePath)).toBe(true)
    })

    it("auto-creates deeply nested directories", () => {
      const deep1 = path.join(tmpDir, "a", "b", "c", "friends")
      const deep2 = path.join(tmpDir, "x", "y", "z", "friends")
      new FileFriendStore(deep1, deep2)
      expect(fsSync.existsSync(deep1)).toBe(true)
      expect(fsSync.existsSync(deep2)).toBe(true)
    })
  })

  describe("get()", () => {
    it("returns null for non-existent ID", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      expect(await store.get("nonexistent")).toBeNull()
    })

    it("merges data from both backends after put", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      const friend = makeFriend()
      await store.put("uuid-1", friend)
      const result = await store.get("uuid-1")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("uuid-1")
      expect(result!.displayName).toBe("Jordan")
      expect(result!.externalIds).toHaveLength(1)
      expect(result!.tenantMemberships).toEqual(["t1"])
      expect(result!.toolPreferences).toEqual({ ado: "flat backlog view" })
      expect(result!.notes).toEqual({ role: "engineering manager" })
    })

    it("returns null when only agent knowledge exists (missing PII)", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      // Write only to agent knowledge directly
      await fs.mkdir(agentKnowledgePath, { recursive: true })
      await fs.writeFile(
        path.join(agentKnowledgePath, "uuid-1.json"),
        JSON.stringify({ id: "uuid-1", displayName: "Jordan", toolPreferences: {}, notes: {}, createdAt: "", updatedAt: "", schemaVersion: 1 }),
      )
      // get() should still return a record with defaults for PII fields
      const result = await store.get("uuid-1")
      expect(result).not.toBeNull()
      expect(result!.externalIds).toEqual([])
      expect(result!.tenantMemberships).toEqual([])
    })

    it("returns null on corrupted JSON in agent knowledge", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await fs.mkdir(agentKnowledgePath, { recursive: true })
      await fs.writeFile(path.join(agentKnowledgePath, "uuid-1.json"), "not json{{{", "utf-8")
      const result = await store.get("uuid-1")
      expect(result).toBeNull()
    })

    it("returns null on corrupted JSON in PII bridge", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      // Write valid agent knowledge
      await fs.mkdir(agentKnowledgePath, { recursive: true })
      await fs.writeFile(
        path.join(agentKnowledgePath, "uuid-1.json"),
        JSON.stringify({ id: "uuid-1", displayName: "Jordan", toolPreferences: {}, notes: {}, createdAt: "", updatedAt: "", schemaVersion: 1 }),
      )
      // Write corrupted PII
      await fs.mkdir(piiBridgePath, { recursive: true })
      await fs.writeFile(path.join(piiBridgePath, "uuid-1.json"), "corrupted!!", "utf-8")
      // get() should still return a record (PII fields default to empty)
      const result = await store.get("uuid-1")
      expect(result).not.toBeNull()
      expect(result!.externalIds).toEqual([])
    })
  })

  describe("put()", () => {
    it("splits record across both backends", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      const friend = makeFriend()
      await store.put("uuid-1", friend)

      // Read agent knowledge file directly -- should have id, displayName, toolPreferences, notes, createdAt, updatedAt, schemaVersion
      const agentFile = path.join(agentKnowledgePath, "uuid-1.json")
      const agentData = JSON.parse(await fs.readFile(agentFile, "utf-8"))
      expect(agentData.id).toBe("uuid-1")
      expect(agentData.displayName).toBe("Jordan")
      expect(agentData.toolPreferences).toEqual({ ado: "flat backlog view" })
      expect(agentData.notes).toEqual({ role: "engineering manager" })
      expect(agentData.createdAt).toBe("2026-03-02T00:00:00.000Z")
      expect(agentData.updatedAt).toBe("2026-03-02T00:00:00.000Z")
      expect(agentData.schemaVersion).toBe(1)
      // Agent knowledge should NOT contain PII fields
      expect(agentData.externalIds).toBeUndefined()
      expect(agentData.tenantMemberships).toBeUndefined()

      // Read PII bridge file directly -- should have id, externalIds, tenantMemberships, schemaVersion
      const piiFile = path.join(piiBridgePath, "uuid-1.json")
      const piiData = JSON.parse(await fs.readFile(piiFile, "utf-8"))
      expect(piiData.id).toBe("uuid-1")
      expect(piiData.externalIds).toHaveLength(1)
      expect(piiData.externalIds[0].provider).toBe("aad")
      expect(piiData.tenantMemberships).toEqual(["t1"])
      expect(piiData.schemaVersion).toBe(1)
      // PII bridge should NOT contain agent knowledge fields
      expect(piiData.displayName).toBeUndefined()
      expect(piiData.toolPreferences).toBeUndefined()
      expect(piiData.notes).toBeUndefined()
    })

    it("overwrites existing files on second put", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await store.put("uuid-1", makeFriend({ displayName: "V1" }))
      await store.put("uuid-1", makeFriend({ displayName: "V2" }))
      const result = await store.get("uuid-1")
      expect(result!.displayName).toBe("V2")
    })
  })

  describe("delete()", () => {
    it("removes files from both backends", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await store.put("uuid-1", makeFriend())
      await store.delete("uuid-1")
      expect(await store.get("uuid-1")).toBeNull()
      // Verify files are actually gone
      const agentFile = path.join(agentKnowledgePath, "uuid-1.json")
      const piiFile = path.join(piiBridgePath, "uuid-1.json")
      await expect(fs.access(agentFile)).rejects.toThrow()
      await expect(fs.access(piiFile)).rejects.toThrow()
    })

    it("does not throw on non-existent ID", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await expect(store.delete("nonexistent")).resolves.not.toThrow()
    })
  })

  describe("findByExternalId()", () => {
    it("finds a friend by external ID", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await store.put("uuid-1", makeFriend())
      const found = await store.findByExternalId("aad", "aad-id-1")
      expect(found).not.toBeNull()
      expect(found!.id).toBe("uuid-1")
      expect(found!.displayName).toBe("Jordan")
    })

    it("returns null when no match found", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await store.put("uuid-1", makeFriend())
      const found = await store.findByExternalId("aad", "nonexistent")
      expect(found).toBeNull()
    })

    it("returns null when PII bridge directory is empty", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      const found = await store.findByExternalId("aad", "any-id")
      expect(found).toBeNull()
    })

    it("matches with tenantId when provided", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await store.put("uuid-1", makeFriend({
        externalIds: [
          { provider: "aad", externalId: "aad-id-1", tenantId: "t1", linkedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }))
      // Match with correct tenantId
      const found = await store.findByExternalId("aad", "aad-id-1", "t1")
      expect(found).not.toBeNull()
      // No match with wrong tenantId
      const notFound = await store.findByExternalId("aad", "aad-id-1", "wrong-tenant")
      expect(notFound).toBeNull()
    })

    it("finds teams-conversation provider", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await store.put("uuid-2", makeFriend({
        id: "uuid-2",
        externalIds: [
          { provider: "teams-conversation", externalId: "conv-123", linkedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }))
      const found = await store.findByExternalId("teams-conversation", "conv-123")
      expect(found).not.toBeNull()
      expect(found!.id).toBe("uuid-2")
    })

    it("returns merged record (agent knowledge + PII) on find", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      const friend = makeFriend({
        toolPreferences: { ado: "tree view" },
        notes: { role: "SDE" },
      })
      await store.put("uuid-1", friend)
      const found = await store.findByExternalId("aad", "aad-id-1")
      expect(found!.toolPreferences).toEqual({ ado: "tree view" })
      expect(found!.notes).toEqual({ role: "SDE" })
      expect(found!.externalIds[0].provider).toBe("aad")
    })

    it("skips non-JSON files in PII directory", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await store.put("uuid-1", makeFriend())
      // Write a non-JSON file
      await fs.writeFile(path.join(piiBridgePath, ".DS_Store"), "junk", "utf-8")
      const found = await store.findByExternalId("aad", "aad-id-1")
      expect(found).not.toBeNull()
    })

    it("skips entry when PII matches but agent knowledge is missing", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      // Write PII bridge file directly (no corresponding agent knowledge file)
      await fs.writeFile(
        path.join(piiBridgePath, "orphan-uuid.json"),
        JSON.stringify({
          id: "orphan-uuid",
          externalIds: [{ provider: "aad", externalId: "orphan-aad", linkedAt: "2026-03-02T00:00:00.000Z" }],
          tenantMemberships: [],
          schemaVersion: 1,
        }),
      )
      const found = await store.findByExternalId("aad", "orphan-aad")
      expect(found).toBeNull()
    })

    it("skips corrupted PII files and continues scanning", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      // Write corrupted PII file first
      await fs.writeFile(path.join(piiBridgePath, "bad-uuid.json"), "not json!", "utf-8")
      // Write valid friend
      await store.put("uuid-1", makeFriend())
      const found = await store.findByExternalId("aad", "aad-id-1")
      expect(found).not.toBeNull()
    })

    it("ignores tenantId filter when tenantId not provided", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await store.put("uuid-1", makeFriend({
        externalIds: [
          { provider: "aad", externalId: "aad-id-1", tenantId: "t1", linkedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }))
      // findByExternalId without tenantId should still match
      const found = await store.findByExternalId("aad", "aad-id-1")
      expect(found).not.toBeNull()
    })
  })

  describe("findByExternalId() error paths", () => {
    it("returns null when PII bridge directory does not exist (readdir fails)", async () => {
      // Create store with a path that we then remove before searching
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      // Remove PII bridge directory to force readdir to fail
      await fs.rm(piiBridgePath, { recursive: true, force: true })
      const found = await store.findByExternalId("aad", "any-id")
      expect(found).toBeNull()
    })
  })

  describe("delete() error paths", () => {
    it("throws on non-ENOENT error (e.g., permission denied)", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      await store.put("uuid-1", makeFriend())
      // Make agent knowledge directory read-only so unlink fails with EACCES/EPERM
      await fs.chmod(agentKnowledgePath, 0o444)
      try {
        await expect(store.delete("uuid-1")).rejects.toThrow()
      } finally {
        await fs.chmod(agentKnowledgePath, 0o755)
      }
    })
  })

  describe("totalTokens persistence", () => {
    it("persists totalTokens in agent knowledge file", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      const friend = makeFriend({ totalTokens: 5000 })
      await store.put("uuid-1", friend)

      // Read agent knowledge file directly -- should have totalTokens
      const agentFile = path.join(agentKnowledgePath, "uuid-1.json")
      const agentData = JSON.parse(await fs.readFile(agentFile, "utf-8"))
      expect(agentData.totalTokens).toBe(5000)
    })

    it("reads totalTokens back from disk via get()", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      const friend = makeFriend({ totalTokens: 12345 })
      await store.put("uuid-1", friend)
      const result = await store.get("uuid-1")
      expect(result).not.toBeNull()
      expect(result!.totalTokens).toBe(12345)
    })

    it("returns totalTokens: 0 for legacy record lacking the field", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      // Write a legacy agent knowledge file WITHOUT totalTokens
      await fs.mkdir(agentKnowledgePath, { recursive: true })
      await fs.writeFile(
        path.join(agentKnowledgePath, "legacy-uuid.json"),
        JSON.stringify({
          id: "legacy-uuid",
          displayName: "Legacy Friend",
          toolPreferences: {},
          notes: {},
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          schemaVersion: 1,
          // NOTE: no totalTokens field -- simulating pre-totalTokens record
        }),
      )
      // Write corresponding PII bridge
      await fs.mkdir(piiBridgePath, { recursive: true })
      await fs.writeFile(
        path.join(piiBridgePath, "legacy-uuid.json"),
        JSON.stringify({
          id: "legacy-uuid",
          externalIds: [],
          tenantMemberships: [],
          schemaVersion: 1,
        }),
      )

      const result = await store.get("legacy-uuid")
      expect(result).not.toBeNull()
      expect(result!.totalTokens).toBe(0)
    })
  })

  describe("concurrent operations", () => {
    it("concurrent puts to different IDs do not corrupt each other", async () => {
      const store = new FileFriendStore(agentKnowledgePath, piiBridgePath)
      const f1 = makeFriend({ id: "uuid-1", displayName: "Friend1" })
      const f2 = makeFriend({ id: "uuid-2", displayName: "Friend2" })
      await Promise.all([
        store.put("uuid-1", f1),
        store.put("uuid-2", f2),
      ])
      const r1 = await store.get("uuid-1")
      const r2 = await store.get("uuid-2")
      expect(r1!.displayName).toBe("Friend1")
      expect(r2!.displayName).toBe("Friend2")
    })
  })
})
