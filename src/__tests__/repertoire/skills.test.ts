import { describe, it, expect, vi, beforeEach } from "vitest"
import * as path from "path"

// Mock fs before importing skills
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

// Mock identity -- skills will use getAgentRoot() for skills directory
vi.mock("../../identity", () => ({
  getAgentRoot: vi.fn(() => "/mock/repo/testagent"),
  getRepoRoot: vi.fn(() => "/mock/repo"),
}))

import * as fs from "fs"

describe("skills - getSkillsDir", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns skills directory under agent root", async () => {
    const { getSkillsDir } = await import("../../repertoire/skills")
    expect(getSkillsDir()).toBe(path.join("/mock/repo/testagent", "skills"))
  })
})

describe("skills - listSkills", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.existsSync).mockReset()
    vi.mocked(fs.readdirSync).mockReset()
    vi.mocked(fs.readFileSync).mockReset()
  })

  it("returns empty array when skills directory does not exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { listSkills } = await import("../../repertoire/skills")
    expect(listSkills()).toEqual([])
  })

  it("returns empty array when skills directory is empty", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([] as any)
    const { listSkills } = await import("../../repertoire/skills")
    expect(listSkills()).toEqual([])
  })

  it("returns sorted skill names from .md files", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(["zebra.md", "alpha.md", "beta.md"] as any)
    const { listSkills } = await import("../../repertoire/skills")
    expect(listSkills()).toEqual(["alpha", "beta", "zebra"])
  })

  it("filters out non-.md files", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(["skill.md", "readme.txt", "notes.json", "other.md"] as any)
    const { listSkills } = await import("../../repertoire/skills")
    expect(listSkills()).toEqual(["other", "skill"])
  })

  it("returns only basenames without .md extension", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(["self-edit.md"] as any)
    const { listSkills } = await import("../../repertoire/skills")
    expect(listSkills()).toEqual(["self-edit"])
  })

  it("reads from agent root skills directory", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(["test.md"] as any)
    const { listSkills } = await import("../../repertoire/skills")
    listSkills()
    const expectedDir = path.join("/mock/repo/testagent", "skills")
    expect(fs.existsSync).toHaveBeenCalledWith(expectedDir)
  })

  it("includes canonical subagent protocols when protocol mirrors are absent", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      p === "/mock/repo/testagent/skills" || p === "/mock/repo/subagents",
    )
    vi.mocked(fs.readdirSync).mockImplementation((p) => {
      if (p === "/mock/repo/testagent/skills") return ["self-edit.md"] as any
      if (p === "/mock/repo/subagents") return ["work-merger.md", "work-planner.md"] as any
      return [] as any
    })

    const { listSkills } = await import("../../repertoire/skills")
    expect(listSkills()).toEqual(["self-edit", "work-merger", "work-planner"])
  })
})

describe("skills - loadSkill", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.existsSync).mockReset()
    vi.mocked(fs.readdirSync).mockReset()
    vi.mocked(fs.readFileSync).mockReset()
  })

  it("returns skill content when skill file exists", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue("# My Skill\nDo the thing.")
    const { loadSkill } = await import("../../repertoire/skills")
    const content = loadSkill("my-skill")
    expect(content).toBe("# My Skill\nDo the thing.")
  })

  it("throws when skill file does not exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { loadSkill } = await import("../../repertoire/skills")
    expect(() => loadSkill("nonexistent")).toThrow("skill 'nonexistent' not found")
  })

  it("tracks loaded skill in loaded skills list", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue("content")
    const { loadSkill, getLoadedSkills } = await import("../../repertoire/skills")
    loadSkill("tracked-skill")
    expect(getLoadedSkills()).toContain("tracked-skill")
  })

  it("does not duplicate skill in loaded list on repeated loads", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue("content")
    const { loadSkill, getLoadedSkills } = await import("../../repertoire/skills")
    loadSkill("dup-skill")
    loadSkill("dup-skill")
    const loaded = getLoadedSkills()
    expect(loaded.filter((s) => s === "dup-skill")).toHaveLength(1)
  })

  it("loads from agent root skills directory", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue("content")
    const { loadSkill } = await import("../../repertoire/skills")
    loadSkill("my-skill")
    const expectedPath = path.join("/mock/repo/testagent", "skills", "my-skill.md")
    expect(fs.existsSync).toHaveBeenCalledWith(expectedPath)
  })

  it("prefers bundle protocol mirror over canonical subagent protocol", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      p === "/mock/repo/testagent/skills/protocols/work-planner.md" ||
      p === "/mock/repo/subagents/work-planner.md",
    )
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === "/mock/repo/testagent/skills/protocols/work-planner.md") {
        return "mirror planner protocol" as any
      }
      if (p === "/mock/repo/subagents/work-planner.md") {
        return "canonical planner protocol" as any
      }
      return "" as any
    })

    const { loadSkill } = await import("../../repertoire/skills")
    expect(loadSkill("work-planner")).toBe("mirror planner protocol")
  })

  it("falls back to canonical subagent protocol when mirror is missing", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === "/mock/repo/subagents/work-doer.md")
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === "/mock/repo/subagents/work-doer.md") {
        return "canonical doer protocol" as any
      }
      return "" as any
    })

    const { loadSkill } = await import("../../repertoire/skills")
    expect(loadSkill("work-doer")).toBe("canonical doer protocol")
  })

  it("throws with mirror and canonical paths when protocol is missing in both locations", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const { loadSkill } = await import("../../repertoire/skills")
    expect(() => loadSkill("work-merger")).toThrow("/mock/repo/testagent/skills/protocols/work-merger.md")
    expect(() => loadSkill("work-merger")).toThrow("/mock/repo/subagents/work-merger.md")
  })
})

describe("skills - getLoadedSkills", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.existsSync).mockReset()
    vi.mocked(fs.readFileSync).mockReset()
  })

  it("returns empty array when no skills have been loaded", async () => {
    const { getLoadedSkills } = await import("../../repertoire/skills")
    expect(getLoadedSkills()).toEqual([])
  })

  it("returns a copy, not the internal array", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue("content")
    const { loadSkill, getLoadedSkills } = await import("../../repertoire/skills")
    loadSkill("skill-a")
    const first = getLoadedSkills()
    first.push("injected")
    // Internal array should not be affected
    expect(getLoadedSkills()).toEqual(["skill-a"])
  })
})

describe("skills - clearLoadedSkills", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.existsSync).mockReset()
    vi.mocked(fs.readFileSync).mockReset()
  })

  it("clears all loaded skills", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue("content")
    const { loadSkill, getLoadedSkills, clearLoadedSkills } = await import("../../repertoire/skills")
    loadSkill("skill-x")
    loadSkill("skill-y")
    expect(getLoadedSkills()).toHaveLength(2)
    clearLoadedSkills()
    expect(getLoadedSkills()).toEqual([])
  })

  it("is safe to call when no skills are loaded", async () => {
    const { clearLoadedSkills, getLoadedSkills } = await import("../../repertoire/skills")
    clearLoadedSkills()
    expect(getLoadedSkills()).toEqual([])
  })
})

describe("skills observability contract", () => {
  it("emits repertoire.load_start when loading a skill", async () => {
    vi.resetModules()
    const emitNervesEvent = vi.fn()
    vi.doMock("../../nerves/runtime", () => ({
      emitNervesEvent,
    }))

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue("content")
    const { loadSkill } = await import("../../repertoire/skills")
    loadSkill("my-skill")

    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "repertoire.load_start",
      component: "repertoire",
    }))
  })
})
