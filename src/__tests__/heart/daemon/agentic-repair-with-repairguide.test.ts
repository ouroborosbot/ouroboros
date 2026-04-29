import { describe, expect, it, vi } from "vitest"

import {
  runAgenticRepair,
  shouldFireRepairGuide,
  type AgenticRepairDeps,
} from "../../../heart/daemon/agentic-repair"
import type { DegradedAgent } from "../../../heart/daemon/interactive-repair"
import type { DiscoverWorkingProviderResult } from "../../../heart/daemon/provider-discovery"

vi.mock("../../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

vi.mock("../../../heart/provider-ping", () => ({
  createProviderRuntimeForConfig: vi.fn(() => ({
    streamTurn: vi.fn(async () => ({ content: "", toolCalls: [], outputItems: [] })),
  })),
}))

function makeDiscoverResult(): DiscoverWorkingProviderResult {
  return {
    provider: "anthropic",
    credentials: { setupToken: "sk-test" },
    providerConfig: { model: "claude-opus-4-6" },
  }
}

function makeDeps(overrides: Partial<AgenticRepairDeps> = {}): AgenticRepairDeps {
  return {
    discoverWorkingProvider: vi.fn(async () => makeDiscoverResult()),
    runInteractiveRepair: vi.fn(async () => ({ repairsAttempted: false })),
    promptInput: vi.fn(async () => "y"),
    writeStdout: vi.fn(),
    createProviderRuntime: vi.fn(() => ({
      streamTurn: vi.fn(async () => ({
        content: "diagnosis text",
        toolCalls: [],
        outputItems: [],
      })),
    })),
    readDaemonLogsTail: vi.fn(() => "(no logs)"),
    ...overrides,
  }
}

/**
 * Layer 3 — RepairGuide wiring.
 *
 * The integration boundary tested here is the contract between
 * `shouldFireRepairGuide` (the gate function) and `runAgenticRepair` (the
 * existing flow it gates). The full slugger compound fixture in
 * `slugger-compound.test.ts` covers the end-to-end path through the cli-exec
 * call site; this file covers the unit-level wiring that the call site
 * relies on.
 */
describe("RepairGuide gate wiring (cli-exec.ts call site)", () => {
  it("cli-exec.ts uses shouldFireRepairGuide at the agentic-repair gate", async () => {
    // Static check: the call site must use the new contract function.
    // Writing this as a source-level check guards against a refactor that
    // accidentally reverts the gate to the bare `if (untypedDegraded.length > 0)`.
    const fs = await import("fs")
    const path = await import("path")
    const cliExecPath = path.resolve(__dirname, "../../../heart/daemon/cli-exec.ts")
    const source = fs.readFileSync(cliExecPath, "utf-8")
    expect(source).toContain("shouldFireRepairGuide")
  })

  it("cli-exec.ts no longer uses the bare untyped-only gate", async () => {
    // The bare `if (untypedDegraded.length > 0) {` block ending in
    // runAgenticRepair must be gone. If a future refactor reverts to the
    // bare gate, this test catches it. (The literal substring exists once
    // earlier in cli-exec.ts as a filter result label, not as a gate.)
    const fs = await import("fs")
    const path = await import("path")
    const cliExecPath = path.resolve(__dirname, "../../../heart/daemon/cli-exec.ts")
    const source = fs.readFileSync(cliExecPath, "utf-8")
    // The exact pre-PR gate line was:
    //   if (untypedDegraded.length > 0) {  // followed by runAgenticRepair
    // Replace with shouldFireRepairGuide(...). The new gate is the only
    // place where runAgenticRepair is called from cli-exec.ts; verify
    // runAgenticRepair appears under the new gate, not the old one.
    expect(source).not.toMatch(/if\s*\(\s*untypedDegraded\.length\s*>\s*0\s*\)\s*\{[\s\S]{0,300}runAgenticRepair/)
  })
})

describe("RepairGuide gate wiring (function-level)", () => {
  it("shouldFireRepairGuide false → caller skips runAgenticRepair entirely", async () => {
    // When the gate decides NOT to fire, the caller must not even build the
    // deps for runAgenticRepair. Verifying via direct gate inspection.
    const decision = shouldFireRepairGuide({
      untypedDegraded: [],
      typedDegraded: [],
      noRepair: false,
    })
    expect(decision).toBe(false)
  })

  it("shouldFireRepairGuide true on untyped degraded → runAgenticRepair is the right next step", async () => {
    const untyped: DegradedAgent[] = [
      { agent: "slugger", errorReason: "weird", fixHint: "" },
    ]
    expect(
      shouldFireRepairGuide({ untypedDegraded: untyped, typedDegraded: [], noRepair: false }),
    ).toBe(true)

    // Verify runAgenticRepair still operates on this input shape unchanged
    // (no behavioral regression from layer 1/2/4 baseline).
    const deps = makeDeps({
      promptInput: vi.fn(async () => "n"),
      runInteractiveRepair: vi.fn(async () => ({ repairsAttempted: true })),
    })
    const result = await runAgenticRepair(untyped, deps)
    expect(result.repairsAttempted).toBe(true)
  })

  it("shouldFireRepairGuide true on stacked typed degraded → runAgenticRepair receives the typed entries", async () => {
    const typed: DegradedAgent[] = [
      { agent: "slugger", errorReason: "vault locked", fixHint: "", issue: { kind: "vault-locked", severity: "blocked", actor: "human-required", summary: "", actions: [] } },
      { agent: "slugger", errorReason: "auth missing", fixHint: "", issue: { kind: "provider-credentials-missing", severity: "blocked", actor: "human-required", summary: "", actions: [] } },
      { agent: "slugger", errorReason: "drift", fixHint: "", issue: { kind: "generic", severity: "degraded", actor: "human-required", summary: "", actions: [] } },
    ]
    expect(
      shouldFireRepairGuide({ untypedDegraded: [], typedDegraded: typed, noRepair: false }),
    ).toBe(true)

    // The call site at cli-exec.ts will pass the COMBINED set into
    // runAgenticRepair when the new path fires. Verify runAgenticRepair
    // accepts a degraded list with all-typed entries without throwing
    // (the existing implementation already returns early on hasKnownTypedRepair).
    const deps = makeDeps({
      runInteractiveRepair: vi.fn(async () => ({ repairsAttempted: false })),
    })
    const result = await runAgenticRepair(typed, deps)
    // hasKnownTypedRepair short-circuits when no local interactive repair is
    // runnable; verify the function returns the expected shape.
    expect(result).toHaveProperty("repairsAttempted")
    expect(result).toHaveProperty("usedAgentic")
  })

  it("--no-repair shortcuts: shouldFireRepairGuide returns false even when typedDegraded >= 3", () => {
    const typed: DegradedAgent[] = [
      { agent: "a", errorReason: "1", fixHint: "" },
      { agent: "a", errorReason: "2", fixHint: "" },
      { agent: "a", errorReason: "3", fixHint: "" },
    ]
    expect(
      shouldFireRepairGuide({ untypedDegraded: [], typedDegraded: typed, noRepair: true }),
    ).toBe(false)
  })

  it("--no-repair shortcuts: shouldFireRepairGuide returns false even when untypedDegraded > 0", () => {
    const untyped: DegradedAgent[] = [
      { agent: "a", errorReason: "weird", fixHint: "" },
    ]
    expect(
      shouldFireRepairGuide({ untypedDegraded: untyped, typedDegraded: [], noRepair: true }),
    ).toBe(false)
  })
})
