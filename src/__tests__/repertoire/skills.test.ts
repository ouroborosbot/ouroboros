import { describe, it, expect, vi, beforeEach } from "vitest"
import * as path from "path"

// Mock fs before importing skills
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

// Mock identity -- skills will use getAgentRoot() for skills directory
vi.mock("../../identity", () => ({
  getAgentRoot: vi.fn(() => "/mock/repo/testagent"),
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
    vi.mocked(fs.statSync).mockReset()
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
})

describe("skills - loadSkill", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.existsSync).mockReset()
    vi.mocked(fs.readdirSync).mockReset()
    vi.mocked(fs.readFileSync).mockReset()
    vi.mocked(fs.statSync).mockReset()
    // Default: unique mtimeMs per call so cache always misses unless test overrides
    let callCount = 0
    vi.mocked(fs.statSync).mockImplementation(() => ({ mtimeMs: ++callCount } as any))
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

  it("caches skill content when mtimeMs is unchanged", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 123 } as any)
    vi.mocked(fs.readFileSync).mockReturnValue("v1")

    const { loadSkill } = await import("../../repertoire/skills")

    expect(loadSkill("my-skill")).toBe("v1")
    expect(loadSkill("my-skill")).toBe("v1")

    expect(fs.readFileSync).toHaveBeenCalledTimes(1)
    expect(fs.statSync).toHaveBeenCalledTimes(2)
  })

  it("invalidates cache when mtimeMs changes", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.statSync)
      .mockReturnValueOnce({ mtimeMs: 123 } as any)
      .mockReturnValueOnce({ mtimeMs: 456 } as any)
    vi.mocked(fs.readFileSync).mockReturnValueOnce("v1").mockReturnValueOnce("v2")

    const { loadSkill } = await import("../../repertoire/skills")

    expect(loadSkill("my-skill")).toBe("v1")
    expect(loadSkill("my-skill")).toBe("v2")

    expect(fs.readFileSync).toHaveBeenCalledTimes(2)
  })

  it("still emits observability events on a cache hit", async () => {
    vi.resetModules()

    const emitNervesEvent = vi.fn()
    vi.doMock("../../nerves/runtime", () => ({
      emitNervesEvent,
    }))

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 123 } as any)
    vi.mocked(fs.readFileSync).mockReturnValue("v1")

    const { loadSkill } = await import("../../repertoire/skills")

    loadSkill("my-skill")
    loadSkill("my-skill")

    const loadStarts = emitNervesEvent.mock.calls.filter((c) => c[0]?.event === "repertoire.load_start")
    const loadEnds = emitNervesEvent.mock.calls.filter((c) => c[0]?.event === "repertoire.load_end")

    expect(loadStarts).toHaveLength(2)
    expect(loadEnds).toHaveLength(2)
  })
})

describe("skills - getLoadedSkills", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.existsSync).mockReset()
    vi.mocked(fs.readFileSync).mockReset()
    vi.mocked(fs.statSync).mockReset()
    let c = 0
    vi.mocked(fs.statSync).mockImplementation(() => ({ mtimeMs: ++c } as any))
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
    vi.mocked(fs.statSync).mockReset()
    let c = 0
    vi.mocked(fs.statSync).mockImplementation(() => ({ mtimeMs: ++c } as any))
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
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1 } as any)
    const { loadSkill } = await import("../../repertoire/skills")
    loadSkill("my-skill")

    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "repertoire.load_start",
      component: "repertoire",
    }))
  })
})
