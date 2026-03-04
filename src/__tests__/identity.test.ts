import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as path from "path"

// Mock fs before importing identity
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

import * as fs from "fs"

// Save and restore process.argv between tests
let savedArgv: string[]

beforeEach(() => {
  savedArgv = [...process.argv]
  vi.mocked(fs.readFileSync).mockReset()
  vi.mocked(fs.writeFileSync as ReturnType<typeof vi.fn>).mockReset()
  vi.mocked(fs.existsSync).mockReset()
})

afterEach(() => {
  process.argv = savedArgv
})

describe("getAgentName", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("parses --agent <name> from process.argv", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const { getAgentName, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(getAgentName()).toBe("ouroboros")
  })

  it("parses --agent <name> when other args are present", async () => {
    process.argv = ["node", "cli-entry.js", "--disable-streaming", "--agent", "slugger", "--verbose"]
    const { getAgentName, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(getAgentName()).toBe("slugger")
  })

  it("throws when --agent is missing from process.argv", async () => {
    process.argv = ["node", "cli-entry.js"]
    const { getAgentName, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => getAgentName()).toThrow("--agent")
  })

  it("throws when --agent is present but no value follows", async () => {
    process.argv = ["node", "cli-entry.js", "--agent"]
    const { getAgentName, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => getAgentName()).toThrow("--agent")
  })

  it("caches the agent name after first parse", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const { getAgentName, resetIdentity } = await import("../identity")
    resetIdentity()
    const first = getAgentName()
    // Change argv -- should still return cached value
    process.argv = ["node", "cli-entry.js", "--agent", "other"]
    expect(getAgentName()).toBe(first)
  })
})

describe("getRepoRoot", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("resolves repo root from src/ directory (dev via tsx)", async () => {
    const { getRepoRoot } = await import("../identity")
    const root = getRepoRoot()
    // In test, __dirname is src/__tests__, so repo root is two levels up from identity.ts location (src/)
    // The identity module's __dirname is src/, so repo root is one level up
    expect(root).toBe(path.resolve(__dirname, "..", ".."))
  })

  it("returns a directory that exists", async () => {
    const { getRepoRoot } = await import("../identity")
    const root = getRepoRoot()
    expect(typeof root).toBe("string")
    expect(root.length).toBeGreaterThan(0)
  })
})

describe("getAgentRoot", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns path.join(repoRoot, agentName)", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const { getAgentRoot, getRepoRoot, resetIdentity } = await import("../identity")
    resetIdentity()
    const root = getRepoRoot()
    expect(getAgentRoot()).toBe(path.join(root, "ouroboros"))
  })

  it("uses a different name for a different agent", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "slugger"]
    const { getAgentRoot, getRepoRoot, resetIdentity } = await import("../identity")
    resetIdentity()
    const root = getRepoRoot()
    expect(getAgentRoot()).toBe(path.join(root, "slugger"))
  })
})

describe("loadAgentConfig", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("reads and parses agent.json from agent root", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const agentJson = {
      name: "ouroboros",
      configPath: "~/.agentconfigs/ouroboros/config.json",
      phrases: {
        thinking: ["thinking hard"],
        tool: ["doing stuff"],
        followup: ["almost done"],
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agentJson))

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    const config = loadAgentConfig()

    expect(config.name).toBe("ouroboros")
    expect(config.configPath).toBe("~/.agentconfigs/ouroboros/config.json")
    expect(config.phrases?.thinking).toEqual(["thinking hard"])
    expect(config.phrases?.tool).toEqual(["doing stuff"])
    expect(config.phrases?.followup).toEqual(["almost done"])
  })

  it("auto-fills placeholder phrases when agent.json has no phrases field", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const agentJson = {
      name: "ouroboros",
      configPath: "~/.agentconfigs/ouroboros/config.json",
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agentJson))

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    const config = loadAgentConfig()

    expect(config.name).toBe("ouroboros")
    expect(config.phrases).toEqual({
      thinking: ["working"],
      tool: ["running tool"],
      followup: ["processing"],
    })
  })

  it("warns and writes placeholders when agent.json is missing phrases", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const agentJson = {
      name: "ouroboros",
      configPath: "~/.agentconfigs/ouroboros/config.json",
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agentJson))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    loadAgentConfig()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("agent.json is missing phrases"))
    expect(fs.writeFileSync).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("does NOT warn or write when agent.json already has phrases", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const agentJson = {
      name: "ouroboros",
      configPath: "~/.agentconfigs/ouroboros/config.json",
      phrases: {
        thinking: ["thinking hard"],
        tool: ["doing stuff"],
        followup: ["almost done"],
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agentJson))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    loadAgentConfig()

    expect(warnSpy).not.toHaveBeenCalled()
    expect(fs.writeFileSync).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("throws descriptive error when agent.json is missing", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "nonexistent"]
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error("ENOENT")
      err.code = "ENOENT"
      throw err
    })

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow(/agent\.json/)
  })

  it("throws descriptive error when agent.json has invalid JSON", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    vi.mocked(fs.readFileSync).mockReturnValue("not valid json {{{")

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow(/agent\.json/)
  })

  it("throws when agent.json configPath still points at legacy .agentconfigs location", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      name: "ouroboros",
      configPath: "~/.agentconfigs/ouroboros/config.json",
      phrases: {
        thinking: ["thinking"],
        tool: ["tool"],
        followup: ["followup"],
      },
    }))

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow(/\.agentsecrets.*secrets\.json/)
  })

  it("handles non-Error read failures when loading agent.json", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw "read-failure"
    })

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow(/agent\.json/)
  })

  it("handles non-Error parse failures when loading agent.json", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    vi.mocked(fs.readFileSync).mockReturnValue("{\"name\":\"ouroboros\"}")
    const parseSpy = vi.spyOn(JSON, "parse").mockImplementation(() => {
      throw "parse-failure"
    })

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow(/agent\.json/)
    parseSpy.mockRestore()
  })

  it("caches the config after first load", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const agentJson = {
      name: "ouroboros",
      configPath: "~/.agentconfigs/ouroboros/config.json",
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agentJson))

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    const first = loadAgentConfig()
    const second = loadAgentConfig()

    expect(first).toBe(second) // same reference
    expect(fs.readFileSync).toHaveBeenCalledTimes(1)
  })

  it("emits identity.resolve observability event when loading agent config", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const agentJson = {
      name: "ouroboros",
      configPath: "~/.agentconfigs/ouroboros/config.json",
      phrases: {
        thinking: ["thinking"],
        tool: ["tool"],
        followup: ["followup"],
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(agentJson))

    vi.resetModules()
    const emitNervesEvent = vi.fn()
    vi.doMock("../nerves/runtime", () => ({
      emitNervesEvent,
    }))

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    loadAgentConfig()

    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "identity.resolve",
      component: "config/identity",
    }))
  })
})

describe("resetIdentity", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("clears cached agent name so it can be re-parsed", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const { getAgentName, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(getAgentName()).toBe("ouroboros")

    process.argv = ["node", "cli-entry.js", "--agent", "slugger"]
    resetIdentity()
    expect(getAgentName()).toBe("slugger")
  })

  it("clears cached agent config so it can be re-loaded", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      name: "ouroboros",
      configPath: "~/.agentconfigs/ouroboros/config.json",
    }))

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    loadAgentConfig()

    // Reset and change the mock
    resetIdentity()
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      name: "ouroboros",
      configPath: "/new/path/config.json",
    }))
    const config = loadAgentConfig()
    expect(config.configPath).toBe("/new/path/config.json")
  })
})
