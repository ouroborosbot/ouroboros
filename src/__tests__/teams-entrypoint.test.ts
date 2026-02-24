import { describe, it, expect, vi, afterEach } from "vitest"
import * as path from "path"
import * as fs from "fs"
import Module from "module"

// Test the entrypoint guard in teams.ts (line 110-112):
// const isDirectExecution = require.main === module
// if (isDirectExecution) { startTeamsApp() }
//
// Same as agent.ts: in vitest context, require.main !== module,
// so startTeamsApp() is never called via the guard. We test the guard
// evaluation (lines 110-111) via vitest import, and verify startTeamsApp()
// behavior via Module._load of the compiled dist/teams.js.

const TEAMS_PATH = path.resolve(__dirname, "..", "..", "dist", "teams.js")
const CORE_PATH = path.resolve(__dirname, "..", "..", "dist", "core.js")
const DIST_EXISTS = fs.existsSync(TEAMS_PATH)
const nativeModule = (Module as any).Module || Module
const { createRequire } = await import("module")
const nativeRequire = DIST_EXISTS ? createRequire(TEAMS_PATH) : null

describe("teams.ts entrypoint guard - vitest module load", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("module loads and guard evaluates to false in test context", async () => {
    vi.resetModules()

    const mockStart = vi.fn()
    vi.doMock("@microsoft/teams.apps", () => ({
      App: class MockApp {
        constructor(_opts: any) {}
        on = vi.fn()
        start = mockStart
      },
    }))
    vi.doMock("@microsoft/teams.dev", () => ({
      DevtoolsPlugin: class MockDevtoolsPlugin {},
    }))
    vi.doMock("../core", () => ({
      runAgent: vi.fn(),
      buildSystem: vi.fn().mockReturnValue("system prompt"),
      summarizeArgs: vi.fn().mockReturnValue(""),
    }))

    const teams = await import("../teams")

    // Module loaded, guard evaluated to false, startTeamsApp() NOT called
    expect(teams.createTeamsCallbacks).toBeDefined()
    expect(teams.handleTeamsMessage).toBeDefined()
    expect(teams.startTeamsApp).toBeDefined()
    expect(teams.stripThinkTags).toBeDefined()

    // startTeamsApp was NOT called (no app.start())
    expect(mockStart).not.toHaveBeenCalled()
  })
})

describe.skipIf(!DIST_EXISTS)("teams.ts startTeamsApp() via Module._load", () => {
  const origLog = console.log
  const origStdout = process.stdout.write
  const origStderr = process.stderr.write

  afterEach(() => {
    console.log = origLog
    process.stdout.write = origStdout
    process.stderr.write = origStderr
  })

  it("startTeamsApp() is called when loaded as main module", async () => {
    const logCalls: string[][] = []
    console.log = (...args: any[]) => { logCalls.push(args.map(String)) }
    process.stdout.write = (() => true) as any
    process.stderr.write = (() => true) as any

    // Mock dependencies in native require cache
    nativeRequire!.cache[CORE_PATH] = {
      id: CORE_PATH,
      filename: CORE_PATH,
      loaded: true,
      exports: {
        runAgent: async () => {},
        buildSystem: () => "system prompt",
        summarizeArgs: () => "",
      },
      children: [],
      paths: [],
      path: path.dirname(CORE_PATH),
    } as any

    const teamsAppsPath = nativeRequire!.resolve("@microsoft/teams.apps")
    const teamsDevPath = nativeRequire!.resolve("@microsoft/teams.dev")

    const mockStart = vi.fn()
    const mockOn = vi.fn()

    nativeRequire!.cache[teamsAppsPath] = {
      id: teamsAppsPath,
      filename: teamsAppsPath,
      loaded: true,
      exports: {
        App: class MockApp {
          constructor(_opts: any) {}
          on = mockOn
          start = mockStart
        },
      },
      children: [],
      paths: [],
      path: path.dirname(teamsAppsPath),
    } as any

    nativeRequire!.cache[teamsDevPath] = {
      id: teamsDevPath,
      filename: teamsDevPath,
      loaded: true,
      exports: {
        DevtoolsPlugin: class MockDevtoolsPlugin {},
      },
      children: [],
      paths: [],
      path: path.dirname(teamsDevPath),
    } as any

    // Load teams.js as main module -- triggers the entrypoint guard
    nativeModule._load(TEAMS_PATH, null, true)

    // startTeamsApp() should have been called
    expect(mockStart).toHaveBeenCalledWith(3978)
    expect(mockOn).toHaveBeenCalledWith("message", expect.any(Function))
    expect(logCalls.flat().some((l) => l.includes("Teams bot started"))).toBe(true)

    // Clean up
    delete nativeRequire!.cache[TEAMS_PATH]
    delete nativeRequire!.cache[CORE_PATH]
    delete nativeRequire!.cache[teamsAppsPath]
    delete nativeRequire!.cache[teamsDevPath]
  })
})
