import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import {
  buildTemporalView,
  type TemporalView,
} from "../../heart/temporal-view"
import { emitEpisode } from "../../mind/episodes"
import { createObligation } from "../../heart/obligations"
import { createCare } from "../../heart/cares"
import { captureIntention } from "../../heart/intentions"

describe("temporal view", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "temporal-view-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("TemporalView interface", () => {
    it("buildTemporalView returns all required fields", () => {
      const view = buildTemporalView(tmpDir)

      expect(view.recentEpisodes).toBeDefined()
      expect(Array.isArray(view.recentEpisodes)).toBe(true)
      expect(view.activeObligations).toBeDefined()
      expect(Array.isArray(view.activeObligations)).toBe(true)
      expect(view.activeCares).toBeDefined()
      expect(Array.isArray(view.activeCares)).toBe(true)
      expect(view.openIntentions).toBeDefined()
      expect(Array.isArray(view.openIntentions)).toBe(true)
      expect(view.peerPresence).toBeDefined()
      expect(Array.isArray(view.peerPresence)).toBe(true)
      expect(view.tempo).toBeDefined()
      expect(view.assembledAt).toBeTruthy()
    })
  })

  describe("buildTemporalView", () => {
    it("assembles recent episodes from store", () => {
      emitEpisode(tmpDir, {
        kind: "obligation_shift",
        summary: "obligation fulfilled",
        whyItMattered: "completed commitment",
        relatedEntities: [],
        salience: "medium",
      })
      emitEpisode(tmpDir, {
        kind: "coding_milestone",
        summary: "PR merged",
        whyItMattered: "shipped feature",
        relatedEntities: [],
        salience: "high",
      })

      const view = buildTemporalView(tmpDir)
      expect(view.recentEpisodes).toHaveLength(2)
    })

    it("respects episodeLimit option", () => {
      for (let i = 0; i < 5; i++) {
        emitEpisode(tmpDir, {
          kind: "turning_point",
          summary: `episode ${i}`,
          whyItMattered: "testing",
          relatedEntities: [],
          salience: "low",
        })
      }

      const view = buildTemporalView(tmpDir, { episodeLimit: 3 })
      expect(view.recentEpisodes).toHaveLength(3)
    })

    it("includes pending obligations", () => {
      createObligation(tmpDir, {
        origin: { friendId: "f1", channel: "cli", key: "s1" },
        content: "research architecture",
      })

      const view = buildTemporalView(tmpDir)
      expect(view.activeObligations).toHaveLength(1)
      expect(view.activeObligations[0].content).toBe("research architecture")
    })

    it("includes active cares", () => {
      createCare(tmpDir, {
        label: "harness stability",
        why: "core mission",
        kind: "project",
        status: "active",
        salience: "high",
        steward: "mine",
        relatedFriendIds: [],
        relatedAgentIds: [],
        relatedObligationIds: [],
        relatedEpisodeIds: [],
        currentRisk: null,
        nextCheckAt: null,
      })

      const view = buildTemporalView(tmpDir)
      expect(view.activeCares).toHaveLength(1)
      expect(view.activeCares[0].label).toBe("harness stability")
    })

    it("includes open intentions", () => {
      captureIntention(tmpDir, {
        content: "revisit the context kernel",
        salience: "medium",
        source: "thought",
      })

      const view = buildTemporalView(tmpDir)
      expect(view.openIntentions).toHaveLength(1)
      expect(view.openIntentions[0].content).toBe("revisit the context kernel")
    })

    it("accepts optional tempo override", () => {
      const view = buildTemporalView(tmpDir, { tempo: "crisis" })
      expect(view.tempo).toBe("crisis")
    })

    it("defaults to brief tempo when no activity", () => {
      const view = buildTemporalView(tmpDir)
      expect(view.tempo).toBe("brief")
    })

    it("empty inputs produce empty view", () => {
      const view = buildTemporalView(tmpDir)
      expect(view.recentEpisodes).toEqual([])
      expect(view.activeObligations).toEqual([])
      expect(view.activeCares).toEqual([])
      expect(view.openIntentions).toEqual([])
      expect(view.peerPresence).toEqual([])
    })

    it("peer presence array starts empty when no relationships exist", () => {
      const view = buildTemporalView(tmpDir)
      expect(view.peerPresence).toEqual([])
    })

    it("default episodeLimit is 20", () => {
      for (let i = 0; i < 25; i++) {
        emitEpisode(tmpDir, {
          kind: "turning_point",
          summary: `episode ${i}`,
          whyItMattered: "testing",
          relatedEntities: [],
          salience: "low",
        })
      }

      const view = buildTemporalView(tmpDir)
      expect(view.recentEpisodes).toHaveLength(20)
    })
  })
})
