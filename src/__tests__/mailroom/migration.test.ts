import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { migrateLocalMailroomToPlaintext } from "../../mailroom/migration"

const tempRoots: string[] = []

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-migration-"))
  tempRoots.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

describe("migrateLocalMailroomToPlaintext", () => {
  it("is a no-op on an empty bundle and reports zeroed counts", () => {
    const mailroomRoot = tempDir()
    const searchCacheRoot = tempDir()
    const result = migrateLocalMailroomToPlaintext({
      agentId: "slugger",
      mailroomRoot,
      searchCacheRoot,
    })
    expect(result).toEqual({
      wipedEnvelopes: 0,
      wipedRaw: 0,
      wipedCoverageRecords: 0,
      wipedOrphanSearchDocs: 0,
    })
  })

  it("wipes pre-change message records, encrypted raw files, stale coverage, and orphan search docs while preserving current-shape data", () => {
    const mailroomRoot = tempDir()
    const searchCacheRoot = tempDir()

    // Pre-change message: has privateEnvelope, no bodyForm
    writeJson(path.join(mailroomRoot, "messages", "mail_legacy.json"), {
      schemaVersion: 1,
      id: "mail_legacy",
      agentId: "slugger",
      privateEnvelope: { algorithm: "RSA-OAEP-SHA256+A256GCM", keyId: "k", wrappedKey: "", iv: "", authTag: "", ciphertext: "" },
    })
    // Post-change message: has bodyForm + private inline
    writeJson(path.join(mailroomRoot, "messages", "mail_current.json"), {
      schemaVersion: 1,
      id: "mail_current",
      agentId: "slugger",
      bodyForm: "plaintext",
      private: { subject: "current" },
    })
    // Malformed message: missing required fields → wipe (we cannot tell what it is)
    fs.writeFileSync(path.join(mailroomRoot, "messages", "mail_bad.json"), "{not valid json")

    // Raw artifacts: legacy encrypted JSON should go; plaintext .eml stays
    fs.mkdirSync(path.join(mailroomRoot, "raw"), { recursive: true })
    fs.writeFileSync(
      path.join(mailroomRoot, "raw", "mail_legacy.json"),
      JSON.stringify({ algorithm: "RSA-OAEP-SHA256+A256GCM", keyId: "k", wrappedKey: "x", iv: "x", authTag: "x", ciphertext: "x" }) + "\n",
    )
    fs.writeFileSync(path.join(mailroomRoot, "raw", "mail_current.eml"), "From: x\r\n\r\nbody\r\n")
    // Non-EncryptedPayload JSON should remain (e.g., an unrelated artifact some future code wrote)
    fs.writeFileSync(path.join(mailroomRoot, "raw", "manifest.json"), JSON.stringify({ ok: true }) + "\n")

    // Search cache: orphan doc → wipe; current doc → preserved
    const cacheDir = path.join(searchCacheRoot)
    writeJson(path.join(cacheDir, "mail_legacy.json"), {
      schemaVersion: 1,
      messageId: "mail_legacy",
      agentId: "slugger",
      receivedAt: "2026-04-21T00:00:00.000Z",
      placement: "imbox",
      compartmentKind: "native",
      from: [],
      subject: "legacy",
      snippet: "legacy",
      textExcerpt: "legacy",
      untrustedContentWarning: "",
      searchText: "legacy",
    })
    writeJson(path.join(cacheDir, "mail_current.json"), {
      schemaVersion: 1,
      messageId: "mail_current",
      agentId: "slugger",
      receivedAt: "2026-04-21T00:00:00.000Z",
      placement: "imbox",
      compartmentKind: "native",
      from: [],
      subject: "current",
      snippet: "current",
      textExcerpt: "current",
      untrustedContentWarning: "",
      searchText: "current",
    })
    // Orphan doc for a different agent — must NOT be wiped (not our agent)
    writeJson(path.join(cacheDir, "mail_other_agent.json"), {
      schemaVersion: 1,
      messageId: "mail_other_agent",
      agentId: "other-agent",
      receivedAt: "2026-04-21T00:00:00.000Z",
      placement: "imbox",
      compartmentKind: "native",
      from: [],
      subject: "other",
      snippet: "other",
      textExcerpt: "other",
      untrustedContentWarning: "",
      searchText: "other",
    })

    // Coverage records: azure-blob stale, file kept
    const coverageDir = path.join(searchCacheRoot, "coverage")
    fs.mkdirSync(coverageDir, { recursive: true })
    writeJson(path.join(coverageDir, "azure.json"), {
      schemaVersion: 1,
      agentId: "slugger",
      storeKind: "azure-blob",
      placement: "imbox",
      compartmentKind: "delegated",
      source: "hey",
      indexedAt: "2026-04-21T00:00:00.000Z",
      visibleMessageCount: 1,
      cachedMessageCount: 1,
      decryptableMessageCount: 1,
      skippedMessageCount: 0,
    })
    writeJson(path.join(coverageDir, "file.json"), {
      schemaVersion: 1,
      agentId: "slugger",
      storeKind: "file",
      placement: "imbox",
      compartmentKind: "native",
      indexedAt: "2026-04-21T00:00:00.000Z",
      visibleMessageCount: 1,
      cachedMessageCount: 1,
      decryptableMessageCount: 1,
      skippedMessageCount: 0,
    })
    // Malformed coverage record → counted as wiped (defensive cleanup)
    fs.writeFileSync(path.join(coverageDir, "broken.json"), "not json")

    const result = migrateLocalMailroomToPlaintext({
      agentId: "slugger",
      mailroomRoot,
      searchCacheRoot,
    })

    expect(result.wipedEnvelopes).toBe(2) // legacy + bad
    expect(result.wipedRaw).toBe(1) // only the encrypted JSON
    expect(result.wipedCoverageRecords).toBe(2) // azure + broken
    expect(result.wipedOrphanSearchDocs).toBe(1) // legacy orphan

    // Current-shape data preserved
    expect(fs.existsSync(path.join(mailroomRoot, "messages", "mail_current.json"))).toBe(true)
    expect(fs.existsSync(path.join(mailroomRoot, "messages", "mail_legacy.json"))).toBe(false)
    expect(fs.existsSync(path.join(mailroomRoot, "messages", "mail_bad.json"))).toBe(false)
    expect(fs.existsSync(path.join(mailroomRoot, "raw", "mail_legacy.json"))).toBe(false)
    expect(fs.existsSync(path.join(mailroomRoot, "raw", "mail_current.eml"))).toBe(true)
    expect(fs.existsSync(path.join(mailroomRoot, "raw", "manifest.json"))).toBe(true)
    expect(fs.existsSync(path.join(cacheDir, "mail_legacy.json"))).toBe(false)
    expect(fs.existsSync(path.join(cacheDir, "mail_current.json"))).toBe(true)
    expect(fs.existsSync(path.join(cacheDir, "mail_other_agent.json"))).toBe(true)
    expect(fs.existsSync(path.join(coverageDir, "file.json"))).toBe(true)
    expect(fs.existsSync(path.join(coverageDir, "azure.json"))).toBe(false)
  })

  it("is idempotent on the second run", () => {
    const mailroomRoot = tempDir()
    const searchCacheRoot = tempDir()
    writeJson(path.join(mailroomRoot, "messages", "mail_current.json"), {
      schemaVersion: 1,
      id: "mail_current",
      agentId: "slugger",
      bodyForm: "plaintext",
      private: { subject: "current" },
    })
    writeJson(path.join(searchCacheRoot, "mail_current.json"), {
      schemaVersion: 1,
      messageId: "mail_current",
      agentId: "slugger",
      receivedAt: "2026-04-21T00:00:00.000Z",
      placement: "imbox",
      compartmentKind: "native",
      from: [],
      subject: "current",
      snippet: "current",
      textExcerpt: "current",
      untrustedContentWarning: "",
      searchText: "current",
    })
    migrateLocalMailroomToPlaintext({ agentId: "slugger", mailroomRoot, searchCacheRoot })
    const second = migrateLocalMailroomToPlaintext({ agentId: "slugger", mailroomRoot, searchCacheRoot })
    expect(second).toEqual({
      wipedEnvelopes: 0,
      wipedRaw: 0,
      wipedCoverageRecords: 0,
      wipedOrphanSearchDocs: 0,
    })
  })
})
