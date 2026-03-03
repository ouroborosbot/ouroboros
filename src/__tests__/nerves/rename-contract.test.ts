import { readFileSync } from "fs"
import { join } from "path"

import { describe, expect, it } from "vitest"

describe("nerves rename contract", () => {
  it("uses audit:nerves script and nerves dist coverage CLI entry", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts["audit:nerves"]).toBe(
      "npm run build && node dist/nerves/coverage/cli-main.js",
    )
    expect(pkg.scripts["audit:observability"]).toBeUndefined()
  })

  it("uses nerves naming in coverage gate script", () => {
    const gateScript = readFileSync(
      join(process.cwd(), "scripts", "run-coverage-gate.cjs"),
      "utf8",
    )

    expect(gateScript).toContain('"audit:nerves"')
    expect(gateScript).toContain('"nerves-coverage.json"')
    expect(gateScript).toContain('target: "nerves-audit"')
    expect(gateScript).toContain("nerves_coverage:")
    expect(gateScript).not.toContain('"audit:observability"')
    expect(gateScript).not.toContain('"observability-coverage.json"')
    expect(gateScript).not.toContain('target: "observability-audit"')
    expect(gateScript).not.toContain("observability_coverage:")
  })
})
