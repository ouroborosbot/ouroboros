import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { afterEach, describe, expect, it } from "vitest"

import {
  pickRandomSpecialistIdentity,
  syncSpecialistIdentities,
} from "../../daemon/hatch-specialist"

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
}

describe("hatch specialist identities", () => {
  const cleanup: string[] = []

  afterEach(() => {
    while (cleanup.length > 0) {
      const entry = cleanup.pop()
      if (!entry) continue
      fs.rmSync(entry, { recursive: true, force: true })
    }
  })

  it("syncs pre-authored markdown identities into target directory", () => {
    const source = makeTempDir("specialist-source")
    const target = makeTempDir("specialist-target")
    cleanup.push(source, target)

    fs.writeFileSync(path.join(source, "medusa.md"), "# Medusa\n", "utf-8")
    fs.writeFileSync(path.join(source, "python.md"), "# Python\n", "utf-8")
    fs.writeFileSync(path.join(source, "README.txt"), "ignored", "utf-8")

    const copied = syncSpecialistIdentities({
      sourceDir: source,
      targetDir: target,
    })

    expect(copied).toEqual(["medusa.md", "python.md"])
    expect(fs.existsSync(path.join(target, "medusa.md"))).toBe(true)
    expect(fs.existsSync(path.join(target, "python.md"))).toBe(true)
    expect(fs.existsSync(path.join(target, "README.txt"))).toBe(false)
  })

  it("picks a deterministic identity when random provider is injected", () => {
    const source = makeTempDir("specialist-pick")
    cleanup.push(source)
    fs.writeFileSync(path.join(source, "basilisk.md"), "# Basilisk\n", "utf-8")
    fs.writeFileSync(path.join(source, "medusa.md"), "# Medusa\n", "utf-8")
    fs.writeFileSync(path.join(source, "python.md"), "# Python\n", "utf-8")

    const picked = pickRandomSpecialistIdentity({
      identitiesDir: source,
      random: () => 0.99,
    })

    expect(picked.fileName).toBe("python.md")
    expect(picked.content).toContain("Python")
  })

  it("fails when no identity markdown files are available", () => {
    const source = makeTempDir("specialist-empty")
    cleanup.push(source)

    expect(() =>
      pickRandomSpecialistIdentity({
        identitiesDir: source,
        random: () => 0,
      }),
    ).toThrow("No specialist identities")
  })
})
