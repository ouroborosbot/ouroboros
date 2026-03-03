import { readFileSync } from "fs"
import { join } from "path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = join(__dirname, "..", "..", "..")

describe("runtime hardening CI contract", () => {
  it("declares runtime-hardening audit command in package scripts", () => {
    const packageJson = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> }
    const scripts = packageJson.scripts ?? {}

    expect(scripts["audit:runtime-hardening"]).toBeTruthy()
  })

  it("coverage gate script includes runtime hardening status and summary artifact", () => {
    const gateScript = readFileSync(
      join(REPO_ROOT, "scripts", "run-coverage-gate.cjs"),
      "utf8",
    )

    expect(gateScript).toContain("runtime-hardening-summary.json")
    expect(gateScript).toContain("runtime_hardening")
    expect(gateScript).toContain("audit:runtime-hardening")
  })
})
