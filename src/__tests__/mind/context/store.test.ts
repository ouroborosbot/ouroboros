import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { CollectionStore, ContextStore } from "../../../mind/context/store"
import type { FriendIdentity } from "../../../mind/context/types"
import * as os from "os"
import * as path from "path"
import * as fs from "fs/promises"
import { FileContextStore } from "../../../mind/context/store-file"

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

describe("FileContextStore -- non-ENOENT error paths", () => {
  let tmpDir: string
  let store: FileContextStore

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `store-test-${crypto.randomUUID()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    store = new FileContextStore(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("get() returns null on non-ENOENT error (e.g. readFile on a directory)", async () => {
    // Create a directory where a file is expected -- reading a dir throws EISDIR, not ENOENT
    const identityDir = path.join(tmpDir, "identity")
    await fs.mkdir(identityDir, { recursive: true })
    await fs.mkdir(path.join(identityDir, "bad-id.json"), { recursive: true })

    const result = await store.identity.get("bad-id")
    expect(result).toBeNull()
  })

  it("delete() throws on non-ENOENT error", async () => {
    // Make the identity directory read-only so unlink fails with EACCES/EPERM
    const identityDir = path.join(tmpDir, "identity")
    await fs.mkdir(identityDir, { recursive: true })
    // Write a valid file first
    await fs.writeFile(path.join(identityDir, "test-id.json"), "{}", "utf-8")
    // Make directory non-writable
    await fs.chmod(identityDir, 0o444)

    try {
      await expect(store.identity.delete("test-id")).rejects.toThrow()
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(identityDir, 0o755)
    }
  })

  it("find() returns null on non-ENOENT error (e.g. readdir on a file)", async () => {
    // Create a file where directory is expected -- readdir on a file throws ENOTDIR
    const identityDir = path.join(tmpDir, "identity")
    await fs.writeFile(identityDir, "not a directory", "utf-8")

    const result = await store.identity.find(() => true)
    expect(result).toBeNull()
  })

  it("get() returns null on corrupted JSON", async () => {
    const identityDir = path.join(tmpDir, "identity")
    await fs.mkdir(identityDir, { recursive: true })
    await fs.writeFile(path.join(identityDir, "corrupt.json"), "not valid json", "utf-8")

    const result = await store.identity.get("corrupt")
    expect(result).toBeNull()
  })

  it("put then get round-trips correctly", async () => {
    const identity: FriendIdentity = {
      id: "uuid-1",
      displayName: "Jordan",
      externalIds: [],
      tenantMemberships: [],
      createdAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
      schemaVersion: 1,
    }
    await store.identity.put("uuid-1", identity)
    const result = await store.identity.get("uuid-1")
    expect(result).toEqual(identity)
  })

  it("delete on non-existent file is silent (ENOENT)", async () => {
    await expect(store.identity.delete("nonexistent")).resolves.toBeUndefined()
  })

  it("find on non-existent dir returns null (ENOENT)", async () => {
    const result = await store.identity.find(() => true)
    expect(result).toBeNull()
  })

  it("schema migration is applied when data version is lower", async () => {
    const migratingStore = new FileContextStore(tmpDir, {
      identity: {
        currentVersion: 2,
        migrate: (data: any, _fromVersion: number) => ({ ...data, schemaVersion: 2, migrated: true }),
      },
    })

    // Write v1 data directly
    const identityDir = path.join(tmpDir, "identity")
    await fs.mkdir(identityDir, { recursive: true })
    const v1Data = {
      id: "uuid-1",
      displayName: "Jordan",
      externalIds: [],
      tenantMemberships: [],
      createdAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
      schemaVersion: 1,
    }
    await fs.writeFile(path.join(identityDir, "uuid-1.json"), JSON.stringify(v1Data), "utf-8")

    const result = await migratingStore.identity.get("uuid-1")
    expect(result).not.toBeNull()
    expect((result as any).schemaVersion).toBe(2)
    expect((result as any).migrated).toBe(true)
  })
})
