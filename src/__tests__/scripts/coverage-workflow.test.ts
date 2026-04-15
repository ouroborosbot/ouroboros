import { readFileSync } from "fs"
import * as path from "path"
import { describe, expect, it } from "vitest"

const workflowPath = path.resolve(__dirname, "../../../.github/workflows/coverage.yml")

function coverageWorkflow(): string {
  return readFileSync(workflowPath, "utf8")
}

describe("coverage workflow publishing contract", () => {
  it("keeps both supported npm dist-tags aligned for published packages", () => {
    const workflow = coverageWorkflow()

    expect(workflow).toContain('npm dist-tag add "@ouro.bot/cli@${LOCAL}" latest')
    expect(workflow).toContain('npm dist-tag add "@ouro.bot/cli@${LOCAL}" alpha')
    expect(workflow).toContain('npm dist-tag add "ouro.bot@${WRAPPER_LOCAL}" latest')
    expect(workflow).toContain('npm dist-tag add "ouro.bot@${WRAPPER_LOCAL}" alpha')

    expect(workflow).toContain('verify_tag "@ouro.bot/cli@latest" "$LOCAL"')
    expect(workflow).toContain('verify_tag "@ouro.bot/cli@alpha" "$LOCAL"')
    expect(workflow).toContain('verify_tag "ouro.bot@latest" "$WRAPPER_LOCAL"')
    expect(workflow).toContain('verify_tag "ouro.bot@alpha" "$WRAPPER_LOCAL"')
  })
})
