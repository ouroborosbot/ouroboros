import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as os from "os"
import * as path from "path"

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import * as fs from "fs"

let savedArgv: string[]

beforeEach(() => {
  savedArgv = [...process.argv]
  vi.mocked(fs.readFileSync).mockReset()
  vi.mocked(fs.writeFileSync).mockReset()
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

  it("throws when --agent is missing", async () => {
    process.argv = ["node", "cli-entry.js"]
    const { getAgentName, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => getAgentName()).toThrow("--agent")
  })

  it("caches parsed agent name", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    const { getAgentName, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(getAgentName()).toBe("ouroboros")

    process.argv = ["node", "cli-entry.js", "--agent", "other"]
    expect(getAgentName()).toBe("ouroboros")
  })
})

describe("agent paths", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("resolves agent bundle root", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "slugger"]
    const { getAgentRoot, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(getAgentRoot()).toBe(path.join(os.homedir(), "AgentBundles", "slugger.ouro"))
  })

  it("resolves conventional secrets path", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "slugger"]
    const { getAgentSecretsPath, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(getAgentSecretsPath()).toBe(path.join(os.homedir(), ".agentsecrets", "slugger", "secrets.json"))
  })

  it("accepts explicit agent name for secrets path", async () => {
    const { getAgentSecretsPath } = await import("../identity")
    expect(getAgentSecretsPath("ouroboros")).toBe(path.join(os.homedir(), ".agentsecrets", "ouroboros", "secrets.json"))
  })
})

describe("buildDefaultAgentTemplate", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("builds default schema without name/configPath", async () => {
    const { buildDefaultAgentTemplate } = await import("../identity")
    const template = buildDefaultAgentTemplate("ouroboros")

    expect(template).toEqual({
      version: 1,
      enabled: true,
      provider: "anthropic",
      context: {
        maxTokens: 80000,
        contextMargin: 20,
      },
      phrases: {
        thinking: ["working"],
        tool: ["running tool"],
        followup: ["processing"],
      },
    })
    expect((template as any).name).toBeUndefined()
    expect((template as any).configPath).toBeUndefined()
  })
})

describe("loadAgentConfig", () => {
  beforeEach(() => {
    vi.resetModules()
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
  })

  it("reads and parses agent.json schema", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        version: 2,
        enabled: false,
        provider: "minimax",
        phrases: {
          thinking: ["think"],
          tool: ["tool"],
          followup: ["followup"],
        },
      }),
    )

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    const config = loadAgentConfig()

    expect(config.version).toBe(2)
    expect(config.enabled).toBe(false)
    expect(config.provider).toBe("minimax")
    expect(config.phrases.thinking).toEqual(["think"])
    expect((config as any).name).toBeUndefined()
    expect((config as any).configPath).toBeUndefined()
  })

  it("defaults version/enabled when omitted", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        provider: "openai-codex",
        phrases: {
          thinking: ["thinking"],
          tool: ["tool"],
          followup: ["followup"],
        },
      }),
    )

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    const config = loadAgentConfig()

    expect(config.version).toBe(1)
    expect(config.enabled).toBe(true)
    expect(config.provider).toBe("openai-codex")
  })

  it("fills phrases when missing", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        version: 1,
        enabled: true,
        provider: "anthropic",
      }),
    )

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    const config = loadAgentConfig()

    expect(config.phrases).toEqual({
      thinking: ["working"],
      tool: ["running tool"],
      followup: ["processing"],
    })
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1)
  })

  it("throws for missing provider", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: 1, enabled: true }))

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow("must include provider")
  })

  it("throws for invalid provider", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ version: 1, enabled: true, provider: "unknown" }),
    )

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow("must include provider")
  })

  it("throws for invalid version", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ version: 0, enabled: true, provider: "minimax" }),
    )

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow("version")
  })

  it("throws for non-boolean enabled", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ version: 1, enabled: "yes", provider: "minimax" }),
    )

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow("enabled")
  })

  it("throws descriptive error when file is missing", async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error("ENOENT")
      err.code = "ENOENT"
      throw err
    })

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow(/agent\.json/)
  })

  it("throws descriptive error when file read throws non-Error", async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw "read-failure"
    })

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow(/agent\.json/)
  })

  it("throws descriptive error when JSON is invalid", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("not json {{{")

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(() => loadAgentConfig()).toThrow(/agent\.json/)
  })

  it("throws descriptive error when JSON parse throws non-Error", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("{\"provider\":\"anthropic\"}")
    const parseSpy = vi.spyOn(JSON, "parse").mockImplementation(() => {
      throw "parse-failure"
    })

    try {
      const { loadAgentConfig, resetIdentity } = await import("../identity")
      resetIdentity()
      expect(() => loadAgentConfig()).toThrow(/agent\.json/)
    } finally {
      parseSpy.mockRestore()
    }
  })

  it("caches loaded config", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        version: 1,
        enabled: true,
        provider: "minimax",
        phrases: {
          thinking: ["thinking"],
          tool: ["tool"],
          followup: ["followup"],
        },
      }),
    )

    const { loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    const first = loadAgentConfig()
    const second = loadAgentConfig()

    expect(first).toBe(second)
    expect(fs.readFileSync).toHaveBeenCalledTimes(1)
  })
})

describe("resetIdentity", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("clears cached name and config", async () => {
    process.argv = ["node", "cli-entry.js", "--agent", "ouroboros"]
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        version: 1,
        enabled: true,
        provider: "minimax",
        phrases: {
          thinking: ["thinking"],
          tool: ["tool"],
          followup: ["followup"],
        },
      }),
    )

    const { getAgentName, loadAgentConfig, resetIdentity } = await import("../identity")
    resetIdentity()
    expect(getAgentName()).toBe("ouroboros")
    loadAgentConfig()

    process.argv = ["node", "cli-entry.js", "--agent", "slugger"]
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        version: 1,
        enabled: true,
        provider: "anthropic",
        phrases: {
          thinking: ["thinking"],
          tool: ["tool"],
          followup: ["followup"],
        },
      }),
    )

    resetIdentity()
    expect(getAgentName()).toBe("slugger")
    expect(loadAgentConfig().provider).toBe("anthropic")
  })
})
