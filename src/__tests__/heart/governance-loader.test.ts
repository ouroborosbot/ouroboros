import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { afterEach, describe, expect, it } from "vitest"

import { loadGovernanceDocs } from "../../governance/loader"

const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tmpDirs.length = 0
})

describe("governance loader", () => {
  it("loads existing governance docs from an agent root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "governance-loader-"))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, "CONSTITUTION.md"), "# constitution\n", "utf8")
    fs.writeFileSync(path.join(root, "ARCHITECTURE.md"), "# architecture\n", "utf8")

    const result = loadGovernanceDocs(root, ["CONSTITUTION.md", "ARCHITECTURE.md"])

    expect(result.missing).toEqual([])
    expect(result.documents).toHaveLength(2)
    expect(result.documents.map((doc) => doc.relativePath)).toEqual([
      "CONSTITUTION.md",
      "ARCHITECTURE.md",
    ])
  })

  it("collects missing files without throwing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "governance-loader-"))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, "CONSTITUTION.md"), "# constitution\n", "utf8")

    const result = loadGovernanceDocs(root, ["CONSTITUTION.md", "MISSING.md"])

    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]?.relativePath).toBe("CONSTITUTION.md")
    expect(result.missing).toEqual(["MISSING.md"])
  })

  it("rethrows non-ENOENT read failures", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "governance-loader-"))
    tmpDirs.push(root)
    fs.mkdirSync(path.join(root, "CONSTITUTION.md"))

    try {
      loadGovernanceDocs(root, ["CONSTITUTION.md"])
      expect.fail("expected non-ENOENT read failure to be rethrown")
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      expect(err.code).toBe("EISDIR")
    }
  })
})

describe("governance preflight", () => {
  it("exposes startup preflight helper", async () => {
    const governance = await import("../../governance/loader")
    expect(typeof (governance as { runGovernancePreflight?: unknown }).runGovernancePreflight).toBe("function")
  })

  it("returns loaded governance docs when required root docs exist", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "governance-preflight-"))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, "CONSTITUTION.md"), "# constitution\n", "utf8")
    fs.writeFileSync(path.join(root, "ARCHITECTURE.md"), "# architecture\n", "utf8")

    const governance = await import("../../governance/loader")
    const runGovernancePreflight = (governance as { runGovernancePreflight?: (repoRoot: string) => { missing: string[]; documents: Array<{ relativePath: string }> } }).runGovernancePreflight

    const result = runGovernancePreflight!(root)
    expect(result.missing).toEqual([])
    expect(result.documents.map((doc) => doc.relativePath)).toEqual([
      "ARCHITECTURE.md",
      "CONSTITUTION.md",
    ])
  })

  it("requires root ARCHITECTURE.md and CONSTITUTION.md before startup", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "governance-preflight-"))
    tmpDirs.push(root)
    fs.writeFileSync(path.join(root, "CONSTITUTION.md"), "# constitution\n", "utf8")

    const governance = await import("../../governance/loader")
    const runGovernancePreflight = (governance as { runGovernancePreflight?: (repoRoot: string) => unknown }).runGovernancePreflight

    expect(() => runGovernancePreflight!(root)).toThrow(/ARCHITECTURE\.md/)
  })
})
