import { existsSync, readFileSync } from "fs"
import * as os from "os"
import { join } from "path"

import { describe, expect, it } from "vitest"

function candidateBundleRoots(agent: string): string[] {
  return [
    join(os.homedir(), "AgentBundles", `${agent}.ouro`),
    join(process.cwd(), `${agent}.ouro`),
  ]
}

function resolveBundleRoot(agent: string): string | null {
  for (const candidate of candidateBundleRoots(agent)) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function resolveRequiredBundleRoots(): { ouroboros: string; slugger: string } | null {
  const ouroboros = resolveBundleRoot("ouroboros")
  const slugger = resolveBundleRoot("slugger")

  if (ouroboros && slugger) {
    return { ouroboros, slugger }
  }

  if (!ouroboros && !slugger) {
    return null
  }

  throw new Error(
    "Bundle contract requires both bundles to be available together or both absent in CI checkout.",
  )
}

function requiredPaths(root: string): string[] {
  return [
    join(root, "agent.json"),
    join(root, "teams-app"),
    join(root, "psyche", "IDENTITY.md"),
    join(root, "psyche", "SOUL.md"),
    join(root, "psyche", "ASPIRATIONS.md"),
    join(root, "psyche", "FRIENDS.md"),
    join(root, "psyche", "LORE.md"),
    join(root, "psyche", "TACIT.md"),
    join(root, "psyche", "CONTEXT.md"),
    join(root, "psyche", "memory", "facts.jsonl"),
    join(root, "psyche", "memory", "entities.json"),
    join(root, "psyche", "memory", "daily"),
    join(root, "psyche", "memory", "archive"),
    join(root, "skills", "code-review.md"),
    join(root, "skills", "self-edit.md"),
    join(root, "skills", "self-query.md"),
    join(root, "skills", "explain.md"),
    join(root, "skills", "toolmaker.md"),
    join(root, "tasks"),
  ]
}

describe("bundle skeleton contract", () => {
  it("has required structure-only paths when bundles are available", () => {
    const roots = resolveRequiredBundleRoots()
    if (!roots) {
      expect(existsSync(join(process.cwd(), "ouroboros.ouro"))).toBe(false)
      expect(existsSync(join(process.cwd(), "slugger.ouro"))).toBe(false)
      return
    }

    const all = [
      ...requiredPaths(roots.ouroboros),
      ...requiredPaths(roots.slugger),
    ]

    const missing = all.filter((absolutePath) => !existsSync(absolutePath))
    expect(missing).toEqual([])
  })

  it("keeps slugger agent config as a structural stub based on ouroboros template", () => {
    const roots = resolveRequiredBundleRoots()
    if (!roots) {
      expect(existsSync(join(process.cwd(), "ouroboros.ouro"))).toBe(false)
      expect(existsSync(join(process.cwd(), "slugger.ouro"))).toBe(false)
      return
    }

    const ouroborosConfig = JSON.parse(
      readFileSync(join(roots.ouroboros, "agent.json"), "utf-8"),
    ) as Record<string, unknown>
    const sluggerConfig = JSON.parse(
      readFileSync(join(roots.slugger, "agent.json"), "utf-8"),
    ) as Record<string, unknown>

    expect(Object.keys(sluggerConfig).sort()).toEqual(Object.keys(ouroborosConfig).sort())
    expect(sluggerConfig.name).toBe("slugger")
    expect(sluggerConfig.configPath).toBe("~/.agentsecrets/slugger/secrets.json")
    expect(typeof sluggerConfig.provider).toBe("string")
  })

  it("keeps slugger psyche migration artifacts present and non-placeholder for core files", () => {
    const roots = resolveRequiredBundleRoots()
    if (!roots) {
      expect(existsSync(join(process.cwd(), "ouroboros.ouro"))).toBe(false)
      expect(existsSync(join(process.cwd(), "slugger.ouro"))).toBe(false)
      return
    }

    const readPsyche = (file: string): string =>
      readFileSync(join(roots.slugger, "psyche", file), "utf-8").trim()

    expect(readPsyche("IDENTITY.md")).toContain("Name:")
    expect(readPsyche("IDENTITY.md")).toContain("Slugger")
    expect(readPsyche("SOUL.md")).toContain("What I am")
    expect(readPsyche("FRIENDS.md")).toContain("Ari Mendelow")
    expect(readPsyche("LORE.md")).toContain("Core narrative")
    expect(readPsyche("TACIT.md")).toContain("Durable patterns")

    expect(readPsyche("BEHAVIOR-IMPORTS.md").length).toBeGreaterThan(0)
    expect(readPsyche("INSPIRING-FIGURES.md").length).toBeGreaterThan(0)
    expect(readFileSync(join(roots.slugger, "psyche", "memory", "tacit.md"), "utf-8").length).toBeGreaterThan(0)

    expect(readPsyche("ASPIRATIONS.md")).toContain("# ASPIRATIONS")
    expect(readPsyche("CONTEXT.md")).toContain("# CONTEXT")
  })

  it("keeps bundles external to harness repo root", () => {
    expect(existsSync(join(process.cwd(), "ouroboros.ouro"))).toBe(false)
    expect(existsSync(join(process.cwd(), "slugger.ouro"))).toBe(false)

    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    expect(gitignore).not.toContain("*.ouro/")
  })
})
