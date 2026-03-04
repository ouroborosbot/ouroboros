import { readFileSync } from "fs"
import { join } from "path"

import { describe, expect, it } from "vitest"

const ACTIVE_PATHS = [
  "AGENTS.md",
  "scripts/run-coverage-gate.cjs",
  "src/nerves/index.ts",
  "src/nerves/runtime.ts",
  "src/nerves/coverage/audit.ts",
  "src/nerves/coverage/cli.ts",
]

describe("nerves naming consistency", () => {
  it("does not use stale observability naming in active docs/command paths", () => {
    for (const relativePath of ACTIVE_PATHS) {
      const contents = readFileSync(join(process.cwd(), relativePath), "utf8")
      expect(contents).not.toMatch(/\bobservability\b/)
    }
  })
})
