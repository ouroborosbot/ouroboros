import { describe, it, expect, vi, beforeAll } from "vitest"

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

import { emitNervesEvent } from "../../nerves/runtime"
import type { ActiveWorkFrame } from "../../heart/active-work"
import type { InnerJob } from "../../heart/daemon/thoughts"

function makeIdleJob(overrides: Partial<InnerJob> = {}): InnerJob {
  return {
    status: "idle",
    content: null,
    origin: null,
    mode: "reflect",
    obligationStatus: null,
    surfacedResult: null,
    queuedAt: null,
    startedAt: null,
    surfacedAt: null,
    ...overrides,
  }
}

function makeFrame(overrides: Partial<ActiveWorkFrame> = {}): ActiveWorkFrame {
  return {
    currentSession: null,
    currentObligation: null,
    mustResolveBeforeHandoff: false,
    centerOfGravity: "local-turn",
    inner: { status: "idle", hasPending: false, job: makeIdleJob() },
    bridges: [],
    taskPressure: { compactBoard: "", liveTaskNames: [], activeBridges: [] },
    friendActivity: { freshestForCurrentFriend: null, otherLiveSessionsForCurrentFriend: [] },
    bridgeSuggestion: null,
    ...overrides,
  }
}

describe("deriveCommitments", () => {
  let deriveCommitments: typeof import("../../heart/commitments").deriveCommitments

  beforeAll(async () => {
    const mod = await import("../../heart/commitments")
    deriveCommitments = mod.deriveCommitments
  })

  it("returns empty committedTo for minimal frame", () => {
    const result = deriveCommitments(makeFrame(), makeIdleJob())
    expect(result.committedTo).toEqual([])
    expect(result.completionCriteria).toEqual(["just be present in this conversation"])
    expect(result.safeToIgnore).toContain("no private thinking in progress")
    expect(result.safeToIgnore).toContain("no shared work to coordinate")
    expect(result.safeToIgnore).toContain("no active tasks to track")
  })

  it("includes obligation in committedTo", () => {
    const result = deriveCommitments(
      makeFrame({ currentObligation: "think about naming" }),
      makeIdleJob(),
    )
    expect(result.committedTo).toContain("i told them i'd think about naming")
  })

  it("includes running inner job in committedTo", () => {
    const result = deriveCommitments(
      makeFrame(),
      makeIdleJob({ status: "running", content: "naming conventions" }),
    )
    expect(result.committedTo).toContain("i'm thinking through something privately -- naming conventions")
  })

  it("includes surfaced inner job in committedTo", () => {
    const result = deriveCommitments(
      makeFrame(),
      makeIdleJob({ status: "surfaced" }),
    )
    expect(result.committedTo).toContain("i finished thinking about something and need to bring it back")
  })

  it("includes mustResolveBeforeHandoff in committedTo and completionCriteria", () => {
    const result = deriveCommitments(
      makeFrame({ mustResolveBeforeHandoff: true }),
      makeIdleJob(),
    )
    expect(result.committedTo).toContain("i need to finish what i started before moving on")
    expect(result.completionCriteria).toContain("resolve the current thread before moving on")
  })

  it("includes bridges in committedTo", () => {
    const result = deriveCommitments(
      makeFrame({
        bridges: [{
          id: "bridge-1",
          objective: "keep aligned",
          summary: "same work",
          lifecycle: "active",
          runtime: "idle",
          createdAt: "",
          updatedAt: "",
          attachedSessions: [],
        }],
      }),
      makeIdleJob(),
    )
    expect(result.committedTo).toContain("i have shared work: same work")
    expect(result.completionCriteria).toContain("keep shared work aligned across sessions")
  })

  it("includes live tasks in committedTo", () => {
    const result = deriveCommitments(
      makeFrame({ taskPressure: { compactBoard: "", liveTaskNames: ["daily-standup"], activeBridges: [] } }),
      makeIdleJob(),
    )
    expect(result.committedTo).toContain("i'm tracking: daily-standup")
  })

  it("includes pending obligation in completionCriteria with origin name", () => {
    const result = deriveCommitments(
      makeFrame(),
      makeIdleJob({ obligationStatus: "pending", origin: { friendId: "alex", channel: "teams", key: "s1", friendName: "Alex" } }),
    )
    expect(result.completionCriteria).toContain("bring my answer back to Alex")
  })

  it("combined: all entries present", () => {
    const result = deriveCommitments(
      makeFrame({
        currentObligation: "naming",
        mustResolveBeforeHandoff: true,
        bridges: [{
          id: "b1",
          objective: "aligned",
          summary: "shared",
          lifecycle: "active",
          runtime: "idle",
          createdAt: "",
          updatedAt: "",
          attachedSessions: [],
        }],
        taskPressure: { compactBoard: "", liveTaskNames: ["task-1"], activeBridges: [] },
      }),
      makeIdleJob({ status: "running", content: "thinking" }),
    )
    expect(result.committedTo.length).toBeGreaterThanOrEqual(4)
    expect(result.completionCriteria.length).toBeGreaterThanOrEqual(2)
  })

  it("emits nerves event reference", () => {
    expect(emitNervesEvent).toBeDefined()
  })
})
