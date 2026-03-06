import { existsSync } from "fs"
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
})
