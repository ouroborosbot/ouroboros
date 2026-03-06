import { describe, expect, it } from "vitest"

import {
  GOVERNANCE_CHECK_RESULTS,
  HARNESS_BOOTSTRAP_PHASES,
  isGovernanceCheckResult,
} from "../../harness"
import type { HarnessToolCall } from "../../harness"

describe("harness primitives contract", () => {
  it("exports bootstrap and governance scaffolding constants", () => {
    expect(HARNESS_BOOTSTRAP_PHASES).toEqual(["bundle", "governance", "psyche", "inner-dialog"])
    expect(GOVERNANCE_CHECK_RESULTS).toEqual(["within-bounds", "requires-review"])
  })

  it("exposes governance result guard", () => {
    expect(isGovernanceCheckResult("within-bounds")).toBe(true)
    expect(isGovernanceCheckResult("requires-review")).toBe(true)
    expect(isGovernanceCheckResult("other")).toBe(false)
  })

  it("provides a typed tool-call surface", () => {
    const call: HarnessToolCall = {
      tool: "shell",
      input: { cmd: "pwd" },
      rationale: "inspect cwd",
    }

    expect(call.tool).toBe("shell")
    expect(call.input).toEqual({ cmd: "pwd" })
  })
})
