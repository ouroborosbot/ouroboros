import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { FileContextStore } from "../../../mind/context/store-file"
import type { FriendIdentity } from "../../../mind/context/types"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ctx-test-"))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function makeFriend(overrides: Partial<FriendIdentity> = {}): FriendIdentity {
  return {
    id: "uuid-1",
    displayName: "Jordan",
    externalIds: [],
    tenantMemberships: [],
    createdAt: "2026-03-02T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  }
}

describe("FileContextStore", () => {
  it("creates collection subdirectories on first write", async () => {
    const store = new FileContextStore(tmpDir)
    await store.identity.put("uuid-1", makeFriend())
    const identityDir = path.join(tmpDir, "identity")
    const stat = await fs.stat(identityDir)
    expect(stat.isDirectory()).toBe(true)
  })

  it("creates base path directory if it does not exist", async () => {
    const nested = path.join(tmpDir, "deep", "nested", "context")
    const store = new FileContextStore(nested)
    await store.identity.put("uuid-1", makeFriend())
    const stat = await fs.stat(nested)
    expect(stat.isDirectory()).toBe(true)
  })
})

describe("FileContextStore identity collection", () => {
  it("get returns null for non-existent ID", async () => {
    const store = new FileContextStore(tmpDir)
    expect(await store.identity.get("nonexistent")).toBeNull()
  })

  it("put writes JSON file, get reads it back correctly", async () => {
    const store = new FileContextStore(tmpDir)
    const friend = makeFriend()
    await store.identity.put("uuid-1", friend)
    const result = await store.identity.get("uuid-1")
    expect(result).toEqual(friend)
  })

  it("put overwrites existing file", async () => {
    const store = new FileContextStore(tmpDir)
    await store.identity.put("uuid-1", makeFriend({ displayName: "V1" }))
    await store.identity.put("uuid-1", makeFriend({ displayName: "V2" }))
    const result = await store.identity.get("uuid-1")
    expect(result?.displayName).toBe("V2")
  })

  it("delete removes the file, subsequent get returns null", async () => {
    const store = new FileContextStore(tmpDir)
    await store.identity.put("uuid-1", makeFriend())
    await store.identity.delete("uuid-1")
    expect(await store.identity.get("uuid-1")).toBeNull()
  })

  it("delete on non-existent ID does not throw", async () => {
    const store = new FileContextStore(tmpDir)
    await expect(store.identity.delete("nonexistent")).resolves.not.toThrow()
  })

  it("find with matching predicate returns the item", async () => {
    const store = new FileContextStore(tmpDir)
    const friend = makeFriend({
      id: "uuid-1",
      externalIds: [
        { provider: "aad", externalId: "aad-id", tenantId: "t1", linkedAt: "2026-03-02T00:00:00.000Z" },
      ],
    })
    await store.identity.put("uuid-1", friend)
    const found = await store.identity.find(
      (v) => v.externalIds.some((e) => e.externalId === "aad-id")
    )
    expect(found).toEqual(friend)
  })

  it("find with no match returns null", async () => {
    const store = new FileContextStore(tmpDir)
    await store.identity.put("uuid-1", makeFriend())
    const found = await store.identity.find((v) => v.displayName === "Nobody")
    expect(found).toBeNull()
  })

  it("find with empty collection returns null", async () => {
    const store = new FileContextStore(tmpDir)
    const found = await store.identity.find(() => true)
    expect(found).toBeNull()
  })

  it("handles JSON parsing error (corrupted file) by returning null", async () => {
    const store = new FileContextStore(tmpDir)
    // Write a valid file first, then corrupt it
    await store.identity.put("uuid-1", makeFriend())
    const filePath = path.join(tmpDir, "identity", "uuid-1.json")
    await fs.writeFile(filePath, "not valid json{{{", "utf-8")
    const result = await store.identity.get("uuid-1")
    expect(result).toBeNull()
  })

  it("concurrent puts to different IDs do not corrupt each other", async () => {
    const store = new FileContextStore(tmpDir)
    const f1 = makeFriend({ id: "uuid-1", displayName: "Friend1" })
    const f2 = makeFriend({ id: "uuid-2", displayName: "Friend2" })
    await Promise.all([
      store.identity.put("uuid-1", f1),
      store.identity.put("uuid-2", f2),
    ])
    expect(await store.identity.get("uuid-1")).toEqual(f1)
    expect(await store.identity.get("uuid-2")).toEqual(f2)
  })
})

describe("FileContextStore schema versioning", () => {
  it("runs migration when stored version is older than current", async () => {
    const store = new FileContextStore(tmpDir, {
      identity: {
        currentVersion: 2,
        migrate: (data: any, fromVersion: number) => {
          if (fromVersion === 1) {
            return { ...data, newField: "default", schemaVersion: 2 }
          }
          return data
        },
      },
    })

    // Write v1 data directly to disk
    const identityDir = path.join(tmpDir, "identity")
    await fs.mkdir(identityDir, { recursive: true })
    const v1Data = { ...makeFriend(), schemaVersion: 1 }
    await fs.writeFile(
      path.join(identityDir, "uuid-1.json"),
      JSON.stringify(v1Data),
      "utf-8"
    )

    const result = await store.identity.get("uuid-1")
    expect(result).not.toBeNull()
    expect((result as any).schemaVersion).toBe(2)
    expect((result as any).newField).toBe("default")

    // Verify migrated data was written back to disk
    const onDisk = JSON.parse(
      await fs.readFile(path.join(identityDir, "uuid-1.json"), "utf-8")
    )
    expect(onDisk.schemaVersion).toBe(2)
    expect(onDisk.newField).toBe("default")
  })

  it("does not migrate when version is current", async () => {
    const store = new FileContextStore(tmpDir, {
      identity: {
        currentVersion: 1,
        migrate: () => { throw new Error("should not be called") },
      },
    })
    await store.identity.put("uuid-1", makeFriend())
    const result = await store.identity.get("uuid-1")
    expect(result?.schemaVersion).toBe(1)
  })
})
