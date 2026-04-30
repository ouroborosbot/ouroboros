import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { BlueBubblesNormalizedMessage } from "../../../senses/bluebubbles/model"

describe("BlueBubbles active turn markers", () => {
  let tmpRoot = ""
  const originalHome = process.env.HOME

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bb-active-turns-"))
    process.env.HOME = tmpRoot
  })

  afterEach(() => {
    process.env.HOME = originalHome
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  function markerDir(): string {
    return path.join(tmpRoot, "AgentBundles", "slugger.ouro", "state", "senses", "bluebubbles", "active-turns")
  }

  function event(messageGuid: string): BlueBubblesNormalizedMessage {
    return {
      kind: "message",
      messageGuid,
      textForAgent: "hello",
      sender: {
        provider: "imessage-handle",
        rawId: "ari@example.com",
        externalId: "ari@example.com",
      },
      chat: {
        sessionKey: "chat:ari",
        chatGuid: "chat-guid",
        chatIdentifier: "ari@example.com",
        isGroup: false,
        participantHandles: [],
      },
      createdAt: "2026-04-30T00:00:00.000Z",
    }
  }

  it("records, snapshots, and removes markers around a live turn", async () => {
    const {
      beginBlueBubblesActiveTurn,
      finishBlueBubblesActiveTurn,
      noteBlueBubblesActiveTurnVisibleActivity,
      snapshotBlueBubblesActiveTurns,
    } = await import("../../../senses/bluebubbles/active-turns")

    const turnId = beginBlueBubblesActiveTurn("slugger", event("msg-1"))
    noteBlueBubblesActiveTurnVisibleActivity("slugger", turnId)

    expect(snapshotBlueBubblesActiveTurns("slugger", 90_000, Date.now() + 120_000)).toEqual(
      expect.objectContaining({
        activeTurnCount: 1,
        stalledTurnCount: 1,
      }),
    )

    finishBlueBubblesActiveTurn("slugger", turnId)

    expect(snapshotBlueBubblesActiveTurns("slugger", 90_000, Date.now() + 120_000)).toEqual({
      activeTurnCount: 0,
      stalledTurnCount: 0,
      oldestActiveTurnStartedAt: undefined,
      oldestActiveTurnAgeMs: undefined,
    })
  })

  it("prunes corrupt and dead-process markers instead of treating them as active turns", async () => {
    const { snapshotBlueBubblesActiveTurns } = await import("../../../senses/bluebubbles/active-turns")

    fs.mkdirSync(markerDir(), { recursive: true })
    fs.writeFileSync(path.join(markerDir(), "corrupt.json"), "{", "utf-8")
    fs.writeFileSync(
      path.join(markerDir(), "dead-process.json"),
      JSON.stringify({
        turnId: "dead-process",
        pid: 99_999_999,
        startedAt: "2026-04-30T00:00:00.000Z",
        messageGuid: "msg-dead",
        sessionKey: "chat:ari",
        chatGuid: "chat-guid",
        chatIdentifier: "ari@example.com",
      }, null, 2) + "\n",
      "utf-8",
    )

    expect(snapshotBlueBubblesActiveTurns("slugger", 90_000, Date.parse("2026-04-30T00:05:00.000Z"))).toEqual({
      activeTurnCount: 0,
      stalledTurnCount: 0,
      oldestActiveTurnStartedAt: undefined,
      oldestActiveTurnAgeMs: undefined,
    })
    expect(fs.readdirSync(markerDir())).toEqual([])
  })
})
