import { describe, expect, it, vi } from "vitest"

import {
  createAgentSupervisors,
  parseSupervisorAgents,
  startSupervisors,
  stopSupervisors,
} from "../../supervisor-entry-core"

describe("parseSupervisorAgents", () => {
  it("parses --agents comma list for multi-agent supervision", () => {
    expect(parseSupervisorAgents(["node", "entry", "--agents", "ouroboros,slugger"]))
      .toEqual(["ouroboros", "slugger"])
  })

  it("deduplicates and trims --agents values", () => {
    expect(parseSupervisorAgents(["node", "entry", "--agents", " slugger,ouroboros,slugger "]))
      .toEqual(["slugger", "ouroboros"])
  })

  it("parses single --agent fallback", () => {
    expect(parseSupervisorAgents(["node", "entry", "--agent", "slugger"]))
      .toEqual(["slugger"])
  })

  it("throws when --agents is missing a usable value", () => {
    expect(() => parseSupervisorAgents(["node", "entry", "--agents"]))
      .toThrow("Missing required --agents value.")
    expect(() => parseSupervisorAgents(["node", "entry", "--agents", " , "]))
      .toThrow("Missing required --agents value.")
  })

  it("throws when --agent is missing a value", () => {
    expect(() => parseSupervisorAgents(["node", "entry", "--agent"]))
      .toThrow("Missing required --agent value.")
  })

  it("throws when no agent argument is present", () => {
    expect(() => parseSupervisorAgents(["node", "entry"]))
      .toThrow("Missing required --agent or --agents argument")
  })
})

describe("multi-supervisor lifecycle", () => {
  it("creates one AgentSupervisor per requested agent", () => {
    const supervisors = createAgentSupervisors(["ouroboros", "slugger"])
    expect(supervisors).toHaveLength(2)
    for (const supervisor of supervisors) {
      expect(typeof supervisor.start).toBe("function")
      expect(typeof supervisor.stop).toBe("function")
    }
  })

  it("starts and stops all supervisors", async () => {
    const order: string[] = []
    const one = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) }
    const two = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) }
    one.start.mockImplementation(async () => {
      order.push("start-one")
    })
    two.start.mockImplementation(async () => {
      order.push("start-two")
    })
    one.stop.mockImplementation(async () => {
      order.push("stop-one")
    })
    two.stop.mockImplementation(async () => {
      order.push("stop-two")
    })

    await startSupervisors([one, two])
    await stopSupervisors([one, two])

    expect(one.start).toHaveBeenCalledTimes(1)
    expect(two.start).toHaveBeenCalledTimes(1)
    expect(one.stop).toHaveBeenCalledTimes(1)
    expect(two.stop).toHaveBeenCalledTimes(1)
    expect(order).toEqual(["start-one", "start-two", "stop-two", "stop-one"])
  })
})
