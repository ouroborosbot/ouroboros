import { afterEach, describe, expect, it } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const {
  REQUIRED_PACKAGE_ASSET_PATHS,
  DISALLOWED_PACKAGE_ASSET_PATH_PREFIXES,
  packageRootFromBinPath,
  validatePackageAssets,
} = require(path.resolve(__dirname, "../../../scripts/package-assets.cjs"))

const roots: string[] = []

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-package-assets-test-"))
  roots.push(root)
  return root
}

function writeFile(root: string, relativePath: string, content = "ok"): void {
  const filePath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function writeRequiredAssets(root: string): void {
  for (const relativePath of REQUIRED_PACKAGE_ASSET_PATHS) {
    writeFile(root, relativePath)
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe("package asset validation", () => {
  it("declares RepairGuide files as required package assets", () => {
    expect(REQUIRED_PACKAGE_ASSET_PATHS).toContain("RepairGuide.ouro/agent.json")
    expect(REQUIRED_PACKAGE_ASSET_PATHS).toContain("RepairGuide.ouro/psyche/IDENTITY.md")
    expect(REQUIRED_PACKAGE_ASSET_PATHS).toContain("RepairGuide.ouro/psyche/SOUL.md")
    expect(REQUIRED_PACKAGE_ASSET_PATHS).toContain("RepairGuide.ouro/skills/diagnose-bootstrap-drift.md")
    expect(REQUIRED_PACKAGE_ASSET_PATHS).toContain("RepairGuide.ouro/skills/diagnose-vault-expired.md")
  })

  it("declares stale nested Outlook UI dist as disallowed", () => {
    expect(DISALLOWED_PACKAGE_ASSET_PATH_PREFIXES).toContain("dist/outlook-ui/dist/")
  })

  it("passes when required assets are present and no stale paths exist", () => {
    const root = makeRoot()
    writeRequiredAssets(root)
    writeFile(root, "dist/outlook-ui/index.html")
    writeFile(root, "dist/outlook-ui/assets/index.js")

    const result = validatePackageAssets(root)

    expect(result).toEqual({
      ok: true,
      packageRoot: root,
      missing: [],
      disallowed: [],
      message: "package assets verified",
    })
  })

  it("fails with clear missing-path messages when required assets are absent", () => {
    const root = makeRoot()
    writeFile(root, "RepairGuide.ouro/agent.json")

    const result = validatePackageAssets(root)

    expect(result.ok).toBe(false)
    expect(result.missing).toContain("RepairGuide.ouro/psyche/IDENTITY.md")
    expect(result.message).toContain("missing required package assets")
    expect(result.message).toContain("RepairGuide.ouro/psyche/IDENTITY.md")
  })

  it("fails with clear disallowed-path messages when stale Outlook UI output is present", () => {
    const root = makeRoot()
    writeRequiredAssets(root)
    writeFile(root, "dist/outlook-ui/dist/index.html")
    writeFile(root, "dist/outlook-ui/dist/assets/old.js")

    const result = validatePackageAssets(root)

    expect(result.ok).toBe(false)
    expect(result.disallowed).toEqual([
      "dist/outlook-ui/dist/assets/old.js",
      "dist/outlook-ui/dist/index.html",
    ])
    expect(result.message).toContain("disallowed package assets")
    expect(result.message).toContain("dist/outlook-ui/dist/index.html")
  })

  it("derives the package root from a symlinked npm .bin path", () => {
    const root = makeRoot()
    const packageRoot = path.join(root, "node_modules", "@ouro.bot", "cli")
    const binDir = path.join(root, "node_modules", ".bin")
    const entry = path.join(packageRoot, "dist", "heart", "daemon", "ouro-entry.js")
    const bin = path.join(binDir, "ouro")
    fs.mkdirSync(path.dirname(entry), { recursive: true })
    fs.mkdirSync(binDir, { recursive: true })
    writeFile(packageRoot, "package.json", JSON.stringify({ name: "@ouro.bot/cli" }))
    fs.writeFileSync(entry, "#!/usr/bin/env node\n")
    fs.symlinkSync(entry, bin)

    expect(packageRootFromBinPath(bin, "@ouro.bot/cli")).toBe(packageRoot)
  })

  it("derives the scoped package root from a plain npm .bin shim path", () => {
    const root = makeRoot()
    const packageRoot = path.join(root, "node_modules", "@ouro.bot", "cli")
    const bin = path.join(root, "node_modules", ".bin", "ouro")
    fs.mkdirSync(path.dirname(bin), { recursive: true })
    writeFile(packageRoot, "package.json", JSON.stringify({ name: "@ouro.bot/cli" }))
    fs.writeFileSync(bin, "#!/usr/bin/env node\n")

    expect(packageRootFromBinPath(bin, "@ouro.bot/cli")).toBe(packageRoot)
  })
})
