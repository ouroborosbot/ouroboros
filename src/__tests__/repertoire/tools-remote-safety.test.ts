import { describe, it, expect } from "vitest"
import { execTool, getToolsForChannel } from "../../repertoire/tools"
import type { ToolContext } from "../../repertoire/tools"
import { getChannelCapabilities } from "../../mind/friends/channel"

describe("remote channel tool safety", () => {
  it("does not expose local cli/file/git/gh tools to remote channel tool lists", () => {
    const tools = getToolsForChannel(getChannelCapabilities("teams"))
    const names = tools.map((t) => t.function.name)

    expect(names).not.toContain("shell")
    expect(names).not.toContain("read_file")
    expect(names).not.toContain("write_file")
    expect(names).not.toContain("git_commit")
    expect(names).not.toContain("gh_cli")
  })

  it("file_ouroboros_bug appears in Teams tool list (integration tool, not blocked)", () => {
    const tools = getToolsForChannel(getChannelCapabilities("teams"))
    const names = tools.map((t) => t.function.name)

    expect(names).toContain("file_ouroboros_bug")
  })

  it("does not expose local cli/file/git/gh tools to bluebubbles tool lists", () => {
    const tools = getToolsForChannel(getChannelCapabilities("bluebubbles"))
    const names = tools.map((t) => t.function.name)

    expect(names).not.toContain("shell")
    expect(names).not.toContain("read_file")
    expect(names).not.toContain("write_file")
    expect(names).not.toContain("git_commit")
    expect(names).not.toContain("gh_cli")
  })

  it("returns explanatory denial messaging when remote context attempts local shell execution", async () => {
    const remoteContext = {
      signin: async () => undefined,
      context: {
        identity: {
          id: "friend-1",
          displayName: "Test Friend",
          externalIds: [],
          tenantMemberships: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          schemaVersion: 1,
        },
        channel: getChannelCapabilities("teams"),
        memory: null,
      },
    } as unknown as ToolContext

    const result = await execTool("shell", { command: "echo hello" }, remoteContext)

    expect(result.toLowerCase()).toContain("can't do that from here")
    expect(result.toLowerCase()).toContain("talking to multiple people")
  })

  it("returns explanatory denial messaging when bluebubbles context attempts local shell execution", async () => {
    const remoteContext = {
      signin: async () => undefined,
      context: {
        friend: {
          id: "friend-1",
          name: "Test Friend",
          externalIds: [],
          tenantMemberships: [],
          toolPreferences: {},
          notes: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          schemaVersion: 1,
        },
        channel: getChannelCapabilities("bluebubbles"),
      },
    } as unknown as ToolContext

    const result = await execTool("shell", { command: "echo hello" }, remoteContext)

    expect(result.toLowerCase()).toContain("can't do that from here")
    expect(result.toLowerCase()).toContain("remote channel")
  })
})
