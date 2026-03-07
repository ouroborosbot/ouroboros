import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { afterEach, describe, expect, it } from "vitest"

import {
  CANONICAL_BUNDLE_MANIFEST,
  findNonCanonicalBundlePaths,
  isCanonicalBundlePath,
} from "../../mind/bundle-manifest"

const createdDirs: string[] = []

function createTempBundleRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-manifest-test-"))
  createdDirs.push(dir)
  return dir
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("bundle-manifest", () => {
  it("accepts canonical file and directory paths", () => {
    for (const entry of CANONICAL_BUNDLE_MANIFEST) {
      expect(isCanonicalBundlePath(entry.path)).toBe(true)
    }
    expect(isCanonicalBundlePath("")).toBe(true)
    expect(isCanonicalBundlePath("./")).toBe(true)
    expect(isCanonicalBundlePath("\\\\tasks\\\\habit.md")).toBe(true)
    expect(isCanonicalBundlePath("tasks/backlog/task-1.md")).toBe(true)
    expect(isCanonicalBundlePath("skills/custom/review.md")).toBe(true)
    expect(isCanonicalBundlePath("psyche/memory/daily/2026-03-07.md")).toBe(true)
  })

  it("rejects non-canonical psyche and legacy bundle paths", () => {
    expect(isCanonicalBundlePath("psyche/FRIENDS.md")).toBe(false)
    expect(isCanonicalBundlePath("psyche/CONTEXT.md")).toBe(false)
    expect(isCanonicalBundlePath("teams-app/manifest.json")).toBe(false)
    expect(isCanonicalBundlePath("random.txt")).toBe(false)
  })

  it("finds non-canonical files and directories", () => {
    const root = createTempBundleRoot()

    fs.mkdirSync(path.join(root, "psyche", "memory", "daily"), { recursive: true })
    fs.mkdirSync(path.join(root, "friends"), { recursive: true })
    fs.mkdirSync(path.join(root, "tasks"), { recursive: true })
    fs.mkdirSync(path.join(root, "skills"), { recursive: true })
    fs.mkdirSync(path.join(root, "senses", "teams"), { recursive: true })

    fs.writeFileSync(path.join(root, "agent.json"), "{}")
    fs.writeFileSync(path.join(root, "psyche", "SOUL.md"), "soul")
    fs.writeFileSync(path.join(root, "psyche", "IDENTITY.md"), "identity")
    fs.writeFileSync(path.join(root, "psyche", "LORE.md"), "lore")
    fs.writeFileSync(path.join(root, "psyche", "TACIT.md"), "tacit")
    fs.writeFileSync(path.join(root, "psyche", "ASPIRATIONS.md"), "aspirations")

    fs.writeFileSync(path.join(root, "psyche", "FRIENDS.md"), "legacy")
    fs.mkdirSync(path.join(root, "teams-app"), { recursive: true })
    fs.writeFileSync(path.join(root, "teams-app", "manifest.json"), "{}")

    const nonCanonical = findNonCanonicalBundlePaths(root)

    expect(nonCanonical).toContain("psyche/FRIENDS.md")
    expect(nonCanonical).toContain("teams-app")
    expect(nonCanonical).toContain("teams-app/manifest.json")
    expect(nonCanonical).not.toContain("agent.json")
    expect(nonCanonical).not.toContain("senses/teams")
  })

  it("returns empty list when bundle root is missing", () => {
    const missingRoot = path.join(os.tmpdir(), "does-not-exist-bundle-root")
    expect(findNonCanonicalBundlePaths(missingRoot)).toEqual([])
  })
})
