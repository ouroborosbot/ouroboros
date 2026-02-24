import { describe, it, expect, vi, afterEach } from "vitest"

// Verify that importing teams.ts in test context does NOT trigger startTeamsApp().
// The entrypoint guard (`if (require.main === module)`) is covered by v8 ignore
// since vitest always evaluates it as false. startTeamsApp() itself is fully
// tested in teams.test.ts.

describe("teams.ts entrypoint guard", () => {
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
