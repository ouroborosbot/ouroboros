import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"

function writeSubagents(repoRoot: string): void {
  const dir = path.join(repoRoot, "subagents")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "work-planner.md"), "# planner\n", "utf-8")
}

describe("subagent installer detectCliBinary", () => {
  let tmpRoot = ""

  afterEach(() => {
    vi.resetModules()
    vi.unmock("child_process")
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
    tmpRoot = ""
  })

  it("treats empty and missing `which` output as unavailable CLI binaries", async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-installer-detect-"))
    const repoRoot = path.join(tmpRoot, "repo")
    const homeDir = path.join(tmpRoot, "home")
    writeSubagents(repoRoot)

    const spawnSyncMock = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: "\n" })
      .mockReturnValueOnce({ status: 1, stdout: "" })
    vi.doMock("child_process", () => ({ spawnSync: spawnSyncMock }))

    const { installSubagentsForAvailableCli } = await import("../../../heart/daemon/subagent-installer")
    const result = await installSubagentsForAvailableCli({ repoRoot, homeDir })

    expect(spawnSyncMock).toHaveBeenCalledTimes(2)
    expect(result.claudeInstalled).toBe(0)
    expect(result.codexInstalled).toBe(0)
    expect(result.notes).toEqual(expect.arrayContaining([
      "claude CLI not found; skipping subagent install",
      "codex CLI/config not found; skipping subagent install",
    ]))
  })
})
