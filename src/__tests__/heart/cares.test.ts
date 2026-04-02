import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import {
  createCare,
  readCares,
  readActiveCares,
  updateCare,
  resolveCare,
  type CareRecord,
} from "../../heart/cares"

describe("care store", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cares-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("CareRecord interface compliance", () => {
    it("createCare returns a record with all required fields", () => {
      const care = createCare(tmpDir, {
        label: "harness reliability",
        why: "agents need to trust their tools",
        status: "active",
        salience: 8,
        stewardship: "mine",
        relatedEntities: ["ob-123"],
      })

      expect(care.id).toBeTruthy()
      expect(typeof care.id).toBe("string")
      expect(care.label).toBe("harness reliability")
      expect(care.why).toBe("agents need to trust their tools")
      expect(care.status).toBe("active")
      expect(care.salience).toBe(8)
      expect(care.stewardship).toBe("mine")
      expect(care.relatedEntities).toEqual(["ob-123"])
      expect(care.createdAt).toBeTruthy()
      expect(care.updatedAt).toBeTruthy()
      expect(care.resolvedAt).toBeUndefined()
    })
  })

  describe("createCare", () => {
    it("writes a JSON file under state/cares/", () => {
      const care = createCare(tmpDir, {
        label: "test care",
        why: "testing",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })

      const filePath = path.join(tmpDir, "state", "cares", `${care.id}.json`)
      expect(fs.existsSync(filePath)).toBe(true)

      const stored = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CareRecord
      expect(stored.id).toBe(care.id)
      expect(stored.label).toBe("test care")
    })

    it("generates unique IDs", () => {
      const c1 = createCare(tmpDir, {
        label: "first",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })
      const c2 = createCare(tmpDir, {
        label: "second",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })
      expect(c1.id).not.toBe(c2.id)
    })

    it("creates the cares directory if it does not exist", () => {
      const caresDir = path.join(tmpDir, "state", "cares")
      expect(fs.existsSync(caresDir)).toBe(false)

      createCare(tmpDir, {
        label: "test",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })

      expect(fs.existsSync(caresDir)).toBe(true)
    })

    it("supports all stewardship types", () => {
      for (const stewardship of ["mine", "shared", "delegated"] as const) {
        const care = createCare(tmpDir, {
          label: `${stewardship} care`,
          why: "test",
          status: "active",
          salience: 5,
          stewardship,
          relatedEntities: [],
        })
        expect(care.stewardship).toBe(stewardship)
      }
    })

    it("supports all status types on creation", () => {
      for (const status of ["active", "watching", "resolved", "dormant"] as const) {
        const care = createCare(tmpDir, {
          label: `${status} care`,
          why: "test",
          status,
          salience: 5,
          stewardship: "mine",
          relatedEntities: [],
        })
        expect(care.status).toBe(status)
      }
    })
  })

  describe("readCares", () => {
    it("returns empty array when directory does not exist", () => {
      expect(readCares(tmpDir)).toEqual([])
    })

    it("returns all cares", () => {
      createCare(tmpDir, {
        label: "first",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })
      createCare(tmpDir, {
        label: "second",
        why: "test",
        status: "resolved",
        salience: 3,
        stewardship: "shared",
        relatedEntities: [],
      })

      const all = readCares(tmpDir)
      expect(all).toHaveLength(2)
    })

    it("skips malformed JSON files", () => {
      createCare(tmpDir, {
        label: "valid",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })

      const caresDir = path.join(tmpDir, "state", "cares")
      fs.writeFileSync(path.join(caresDir, "bad.json"), "not valid json{{{", "utf-8")

      const cares = readCares(tmpDir)
      expect(cares).toHaveLength(1)
    })

    it("skips non-JSON files", () => {
      createCare(tmpDir, {
        label: "valid",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })

      const caresDir = path.join(tmpDir, "state", "cares")
      fs.writeFileSync(path.join(caresDir, "readme.txt"), "not a care", "utf-8")

      const cares = readCares(tmpDir)
      expect(cares).toHaveLength(1)
    })
  })

  describe("readActiveCares", () => {
    it("returns only active and watching cares", () => {
      createCare(tmpDir, {
        label: "active one",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })
      createCare(tmpDir, {
        label: "watching one",
        why: "test",
        status: "watching",
        salience: 3,
        stewardship: "mine",
        relatedEntities: [],
      })
      createCare(tmpDir, {
        label: "resolved one",
        why: "test",
        status: "resolved",
        salience: 7,
        stewardship: "mine",
        relatedEntities: [],
      })
      createCare(tmpDir, {
        label: "dormant one",
        why: "test",
        status: "dormant",
        salience: 2,
        stewardship: "mine",
        relatedEntities: [],
      })

      const active = readActiveCares(tmpDir)
      expect(active).toHaveLength(2)
      expect(active.every((c) => c.status === "active" || c.status === "watching")).toBe(true)
    })

    it("returns empty array when no cares exist", () => {
      expect(readActiveCares(tmpDir)).toEqual([])
    })
  })

  describe("updateCare", () => {
    it("updates fields and preserves unchanged ones", () => {
      const care = createCare(tmpDir, {
        label: "original",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })

      const updated = updateCare(tmpDir, care.id, {
        label: "updated label",
        salience: 9,
      })

      expect(updated.label).toBe("updated label")
      expect(updated.salience).toBe(9)
      expect(updated.why).toBe("test") // unchanged field preserved
      expect(updated.updatedAt).toBeTruthy()
      expect(updated.createdAt).toBe(care.createdAt) // createdAt never changes
    })

    it("persists changes to disk", () => {
      const care = createCare(tmpDir, {
        label: "original",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })

      updateCare(tmpDir, care.id, { label: "updated" })

      const filePath = path.join(tmpDir, "state", "cares", `${care.id}.json`)
      const stored = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CareRecord
      expect(stored.label).toBe("updated")
    })

    it("throws when care does not exist", () => {
      expect(() => updateCare(tmpDir, "nonexistent-id", { label: "nope" })).toThrow()
    })
  })

  describe("resolveCare", () => {
    it("sets status to resolved and adds resolvedAt", () => {
      const care = createCare(tmpDir, {
        label: "to resolve",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })

      const resolved = resolveCare(tmpDir, care.id)
      expect(resolved.status).toBe("resolved")
      expect(resolved.resolvedAt).toBeTruthy()
      expect(resolved.updatedAt).toBeTruthy()
      expect(resolved.createdAt).toBe(care.createdAt) // createdAt never changes
    })

    it("persists resolution to disk", () => {
      const care = createCare(tmpDir, {
        label: "to resolve",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        relatedEntities: [],
      })

      resolveCare(tmpDir, care.id)

      const filePath = path.join(tmpDir, "state", "cares", `${care.id}.json`)
      const stored = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CareRecord
      expect(stored.status).toBe("resolved")
      expect(stored.resolvedAt).toBeTruthy()
    })

    it("throws when care does not exist", () => {
      expect(() => resolveCare(tmpDir, "nonexistent-id")).toThrow()
    })
  })

  describe("backward compatibility", () => {
    it("handles care files with missing optional fields", () => {
      const caresDir = path.join(tmpDir, "state", "cares")
      fs.mkdirSync(caresDir, { recursive: true })

      // Write a minimal care file without optional fields
      const minimalCare = {
        id: "minimal-1",
        label: "minimal care",
        why: "test",
        status: "active",
        salience: 5,
        stewardship: "mine",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      }
      fs.writeFileSync(
        path.join(caresDir, "minimal-1.json"),
        JSON.stringify(minimalCare, null, 2),
        "utf-8",
      )

      const cares = readCares(tmpDir)
      expect(cares).toHaveLength(1)
      expect(cares[0].label).toBe("minimal care")
      expect(cares[0].relatedEntities).toBeUndefined()
    })
  })
})
