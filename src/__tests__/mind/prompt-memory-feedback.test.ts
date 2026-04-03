/**
 * Memory feedback loop tests — Unit 3.5
 *
 * Verifies that memory guidance in the prompt discourages noise and
 * encourages saving only durable knowledge. This is the lightweight
 * feedback loop: the prompt itself teaches the agent when to save.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock("../../heart/core", () => ({
  getProviderDisplayLabel: () => "minimax",
}))

const mockGetBoard = vi.fn()
vi.mock("../../repertoire/tasks", () => ({
  getTaskModule: () => ({
    getBoard: mockGetBoard,
  }),
}))

vi.mock("../../heart/identity", () => {
  const DEFAULT_AGENT_CONTEXT = {
    maxTokens: 80000,
    contextMargin: 20,
  }
  return {
    DEFAULT_AGENT_CONTEXT,
    loadAgentConfig: vi.fn(() => ({
      name: "testagent",
      configPath: "~/.agentsecrets/testagent/secrets.json",
      provider: "minimax",
      context: { ...DEFAULT_AGENT_CONTEXT },
    })),
    getAgentName: vi.fn(() => "testagent"),
    getAgentSecretsPath: vi.fn(() => "/tmp/.agentsecrets/testagent/secrets.json"),
    getAgentRoot: vi.fn(() => "/mock/repo/testagent"),
    getRepoRoot: vi.fn(() => "/mock/repo"),
    resetIdentity: vi.fn(),
  }
})

import * as fs from "fs"

function setupReadFileSync() {
  vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
    const p = String(filePath)
    if (p.endsWith("SOUL.md")) return "soul"
    if (p.endsWith("IDENTITY.md")) return "identity"
    if (p.endsWith("LORE.md")) return "lore"
    if (p.endsWith("TACIT.md")) return "tacit"
    if (p.endsWith("ASPIRATIONS.md")) return "aspirations"
    if (p.endsWith("secrets.json")) return JSON.stringify({})
    if (p.endsWith("package.json")) return JSON.stringify({ version: "0.1.0-alpha.20" })
    return ""
  })
}

describe("memory feedback loop — noise prevention", () => {
  beforeEach(() => {
    vi.resetModules()
    setupReadFileSync()
    mockGetBoard.mockReset().mockReturnValue({
      compact: "",
      full: "",
      byStatus: {
        drafting: [],
        processing: [],
        validating: [],
        collaborating: [],
        paused: [],
        blocked: [],
        done: [],
        cancelled: [],
      },
      actionRequired: [],
      unresolvedDependencies: [],
      activeSessions: [],
    })
  })

  it("prompt includes explicit noise-prevention guidance", async () => {
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const system = await buildSystem("cli")

    // The prompt should actively discourage saving noise
    expect(system).toContain("do not save noise")
    expect(system).toContain("if i am unlikely to reuse it, leave it in the session")
  })

  it("prompt includes re-derivation signal for when TO save", async () => {
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const system = await buildSystem("cli")

    // The key signal: if you keep re-deriving it, that's a sign to save
    expect(system).toContain("if i keep re-deriving it, save it")
  })

  it("diary_write tool description discourages noise", async () => {
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const system = await buildSystem("cli")

    // The tool contract should mention preferring durable conclusions
    expect(system).toContain("diary_write")
    // The heuristic section reinforces this
    expect(system).toContain("durable")
  })

  it("ephemeral examples specifically mention transient execution state", async () => {
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const system = await buildSystem("cli")

    // These are the specific noise examples that should NOT be saved
    expect(system).toContain("temporary branch names unless they matter beyond the task")
    expect(system).toContain("one-off shell output with no durable lesson")
    expect(system).toContain("transient emotional tone or conversational filler")
  })

  it("memory judgement section is separate from but complements tool contracts", async () => {
    const { buildSystem, resetPsycheCache } = await import("../../mind/prompt")
    resetPsycheCache()
    const system = await buildSystem("cli")

    // Both sections should exist
    const toolContractsIdx = system.indexOf("## tool contracts")
    const memoryJudgementIdx = system.indexOf("## memory judgement")

    expect(toolContractsIdx).toBeGreaterThan(-1)
    expect(memoryJudgementIdx).toBeGreaterThan(-1)
    // Memory judgement comes after tool contracts
    expect(memoryJudgementIdx).toBeGreaterThan(toolContractsIdx)
  })
})
