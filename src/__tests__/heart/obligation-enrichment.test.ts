import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import {
  createObligation,
  enrichObligation,
  type Obligation,
  type ObligationMeaning,
} from "../../heart/obligations"

describe("obligation enrichment", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-enrichment-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const sampleOrigin = { friendId: "friend-1", channel: "cli", key: "session" }

  describe("ObligationMeaning interface", () => {
    it("enrichObligation adds meaning to existing obligation", () => {
      const ob = createObligation(tmpDir, {
        origin: sampleOrigin,
        content: "research architecture options",
      })

      const meaning: ObligationMeaning = {
        salience: 8,
        careReason: "this affects the core harness stability",
        waitingOn: "PR review from Ari",
        stalenessClass: "fresh",
        resumeHint: "start by reading the PR comments",
      }

      const enriched = enrichObligation(tmpDir, ob.id, meaning)

      expect(enriched.meaning).toBeDefined()
      expect(enriched.meaning!.salience).toBe(8)
      expect(enriched.meaning!.careReason).toBe("this affects the core harness stability")
      expect(enriched.meaning!.waitingOn).toBe("PR review from Ari")
      expect(enriched.meaning!.stalenessClass).toBe("fresh")
      expect(enriched.meaning!.resumeHint).toBe("start by reading the PR comments")
    })

    it("meaning fields are all present in ObligationMeaning", () => {
      const ob = createObligation(tmpDir, {
        origin: sampleOrigin,
        content: "test meaning fields",
      })

      const meaning: ObligationMeaning = {
        salience: 5,
        stalenessClass: "aging",
      }

      const enriched = enrichObligation(tmpDir, ob.id, meaning)
      expect(enriched.meaning!.salience).toBe(5)
      expect(enriched.meaning!.stalenessClass).toBe("aging")
      expect(enriched.meaning!.careReason).toBeUndefined()
      expect(enriched.meaning!.waitingOn).toBeUndefined()
      expect(enriched.meaning!.resumeHint).toBeUndefined()
    })
  })

  describe("backward compatibility", () => {
    it("existing obligations without meaning parse correctly", () => {
      const ob = createObligation(tmpDir, {
        origin: sampleOrigin,
        content: "plain obligation",
      })

      // Read the obligation back - should have no meaning field
      const filePath = path.join(tmpDir, "state", "obligations", `${ob.id}.json`)
      const stored = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Obligation
      expect(stored.meaning).toBeUndefined()
      expect(stored.content).toBe("plain obligation")
    })
  })

  describe("enrichObligation", () => {
    it("persists meaning to disk", () => {
      const ob = createObligation(tmpDir, {
        origin: sampleOrigin,
        content: "test persistence",
      })

      const meaning: ObligationMeaning = {
        salience: 7,
        stalenessClass: "stale",
        resumeHint: "check if blocker is resolved",
      }

      enrichObligation(tmpDir, ob.id, meaning)

      const filePath = path.join(tmpDir, "state", "obligations", `${ob.id}.json`)
      const stored = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Obligation
      expect(stored.meaning).toBeDefined()
      expect(stored.meaning!.salience).toBe(7)
      expect(stored.meaning!.stalenessClass).toBe("stale")
      expect(stored.meaning!.resumeHint).toBe("check if blocker is resolved")
    })

    it("preserves original obligation fields", () => {
      const ob = createObligation(tmpDir, {
        origin: sampleOrigin,
        content: "preserve fields test",
      })

      enrichObligation(tmpDir, ob.id, {
        salience: 9,
        stalenessClass: "ancient",
      })

      const filePath = path.join(tmpDir, "state", "obligations", `${ob.id}.json`)
      const stored = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Obligation
      expect(stored.id).toBe(ob.id)
      expect(stored.content).toBe("preserve fields test")
      expect(stored.origin).toEqual(sampleOrigin)
      expect(stored.status).toBe("pending")
    })

    it("throws when obligation does not exist", () => {
      expect(() =>
        enrichObligation(tmpDir, "nonexistent-id", {
          salience: 5,
          stalenessClass: "fresh",
        }),
      ).toThrow()
    })

    it("overwrites previous meaning on re-enrichment", () => {
      const ob = createObligation(tmpDir, {
        origin: sampleOrigin,
        content: "re-enrich test",
      })

      enrichObligation(tmpDir, ob.id, {
        salience: 3,
        stalenessClass: "fresh",
      })

      const updated = enrichObligation(tmpDir, ob.id, {
        salience: 9,
        stalenessClass: "stale",
        careReason: "escalated priority",
      })

      expect(updated.meaning!.salience).toBe(9)
      expect(updated.meaning!.stalenessClass).toBe("stale")
      expect(updated.meaning!.careReason).toBe("escalated priority")
    })

    it("supports all stalenessClass values", () => {
      const ob = createObligation(tmpDir, {
        origin: sampleOrigin,
        content: "staleness test",
      })

      for (const stalenessClass of ["fresh", "aging", "stale", "ancient"] as const) {
        const enriched = enrichObligation(tmpDir, ob.id, {
          salience: 5,
          stalenessClass,
        })
        expect(enriched.meaning!.stalenessClass).toBe(stalenessClass)
      }
    })
  })
})
