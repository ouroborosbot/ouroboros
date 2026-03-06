import { describe, expect, it, vi } from "vitest"

import {
  parseSupervisorAgents,
  startSupervisors,
  stopSupervisors,
} from "../../supervisor-entry-core"

describe("parseSupervisorAgents", () => {
  it("parses --agents comma list for multi-agent supervision", () => {
    expect(parseSupervisorAgents(["node", "entry", "--agents", "ouroboros,slugger"]))
      .toEqual(["ouroboros", "slugger"])
  })

  it("parses single --agent fallback", () => {
    expect(parseSupervisorAgents(["node", "entry", "--agent", "slugger"]))
      .toEqual(["slugger"])
  })

  it("throws when no agent argument is present", () => {
    expect(() => parseSupervisorAgents(["node", "entry"]))
      .toThrow("Missing required --agent or --agents argument")
  })
})

describe("multi-supervisor lifecycle", () => {
  it("starts and stops all supervisors", async () => {
    const one = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) }
    const two = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) }

    await startSupervisors([one, two])
    await stopSupervisors([one, two])

    expect(one.start).toHaveBeenCalledTimes(1)
    expect(two.start).toHaveBeenCalledTimes(1)
    expect(one.stop).toHaveBeenCalledTimes(1)
    expect(two.stop).toHaveBeenCalledTimes(1)
  })
})
