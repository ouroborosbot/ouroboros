import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock fs before importing skills
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import * as fs from "fs"

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
