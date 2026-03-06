import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

import { describe, expect, it } from "vitest"

function requiredPaths(agent: string): string[] {
  const root = `${agent}.ouro`
  return [
    `${root}/agent.json`,
    `${root}/teams-app`,
    `${root}/psyche/IDENTITY.md`,
    `${root}/psyche/SOUL.md`,
    `${root}/psyche/ASPIRATIONS.md`,
    `${root}/psyche/FRIENDS.md`,
    `${root}/psyche/LORE.md`,
    `${root}/psyche/TACIT.md`,
    `${root}/psyche/CONTEXT.md`,
    `${root}/psyche/memory/facts.jsonl`,
    `${root}/psyche/memory/entities.json`,
    `${root}/psyche/memory/daily`,
    `${root}/psyche/memory/archive`,
    `${root}/skills/code-review.md`,
    `${root}/skills/self-edit.md`,
    `${root}/skills/self-query.md`,
    `${root}/skills/explain.md`,
    `${root}/skills/toolmaker.md`,
    `${root}/tasks`,
  ]
}

describe("bundle skeleton contract", () => {
  it("has required structure-only paths for ouroboros and slugger bundles", () => {
    const all = [
      ...requiredPaths("ouroboros"),
      ...requiredPaths("slugger"),
    ]

    const missing = all.filter((relativePath) => !existsSync(join(process.cwd(), relativePath)))
    expect(missing).toEqual([])
  })

  it("keeps slugger agent config as a structural stub based on ouroboros template", () => {
    const ouroborosConfig = JSON.parse(
      readFileSync(join(process.cwd(), "ouroboros.ouro/agent.json"), "utf-8"),
    ) as Record<string, unknown>
    const sluggerConfig = JSON.parse(
      readFileSync(join(process.cwd(), "slugger.ouro/agent.json"), "utf-8"),
    ) as Record<string, unknown>

    expect(Object.keys(sluggerConfig).sort()).toEqual(Object.keys(ouroborosConfig).sort())
    expect(sluggerConfig.name).toBe("slugger")
    expect(sluggerConfig.configPath).toBe("~/.agentsecrets/slugger/secrets.json")
    expect(typeof sluggerConfig.provider).toBe("string")
  })

  it("keeps slugger psyche files as minimal placeholders for later migration", () => {
    const files: Array<[file: string, header: string]> = [
      ["IDENTITY.md", "IDENTITY"],
      ["SOUL.md", "SOUL"],
      ["ASPIRATIONS.md", "ASPIRATIONS"],
      ["FRIENDS.md", "FRIENDS"],
      ["LORE.md", "LORE"],
      ["TACIT.md", "TACIT"],
      ["CONTEXT.md", "CONTEXT"],
    ]

    for (const [file, header] of files) {
      const body = readFileSync(join(process.cwd(), "slugger.ouro/psyche", file), "utf-8").trim()
      expect(body).toBe(`# ${header}`)
    }
  })

  it("ignores .ouro bundles in harness git tracking", () => {
    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)

    expect(gitignore).toContain("*.ouro/")

    expect(() =>
      execSync("git check-ignore --no-index -q ouroboros.ouro/agent.json", { cwd: process.cwd() }),
    ).not.toThrow()

    expect(() =>
      execSync("git check-ignore --no-index -q slugger.ouro/agent.json", { cwd: process.cwd() }),
    ).not.toThrow()
  })
})
