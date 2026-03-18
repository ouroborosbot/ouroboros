import { describe, it, expect } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { execTool, getToolsForChannel } from "../../repertoire/tools"
import type { ToolContext } from "../../repertoire/tools"
import { getChannelCapabilities } from "../../mind/friends/channel"

describe("remote channel tool safety — post-guardrail model", () => {
  it("REMOTE_BLOCKED_LOCAL_TOOLS export no longer exists", async () => {
    const toolsModule = await import("../../repertoire/tools")
    expect("REMOTE_BLOCKED_LOCAL_TOOLS" in toolsModule).toBe(false)
  })

  it("shouldBlockLocalTools function no longer exists", async () => {
    const toolsModule = await import("../../repertoire/tools") as any
    expect(toolsModule.shouldBlockLocalTools).toBeUndefined()
  })

  it("blockedLocalToolMessage function no longer exists", async () => {
    const toolsModule = await import("../../repertoire/tools") as any
    expect(toolsModule.blockedLocalToolMessage).toBeUndefined()
  })

  it("baseToolsForCapabilities returns all base tools regardless of channel/context (teams)", () => {
    const tools = getToolsForChannel(getChannelCapabilities("teams"))
    const names = tools.map((t) => t.function.name)

    // All base tools should be present — no longer filtered
    expect(names).toContain("shell")
    expect(names).toContain("read_file")
    expect(names).toContain("write_file")
    expect(names).toContain("edit_file")
    expect(names).toContain("glob")
    expect(names).toContain("grep")
  })

  it("baseToolsForCapabilities returns all base tools regardless of channel/context (bluebubbles)", () => {
    const tools = getToolsForChannel(getChannelCapabilities("bluebubbles"))
    const names = tools.map((t) => t.function.name)

    expect(names).toContain("shell")
    expect(names).toContain("read_file")
    expect(names).toContain("write_file")
    expect(names).toContain("edit_file")
    expect(names).toContain("glob")
    expect(names).toContain("grep")
  })

  it("baseToolsForCapabilities returns all base tools for untrusted stranger context", () => {
    const tools = getToolsForChannel(
      getChannelCapabilities("bluebubbles"),
      undefined,
      {
        friend: {
          id: "friend-4",
          name: "Unknown",
          trustLevel: "stranger",
          externalIds: [{ provider: "imessage-handle", externalId: "unknown@example.com", linkedAt: "2026-03-08T00:00:00.000Z" }],
          tenantMemberships: [],
          toolPreferences: {},
          notes: {},
          createdAt: "2026-03-08T00:00:00.000Z",
          updatedAt: "2026-03-08T00:00:00.000Z",
          schemaVersion: 1,
        },
        channel: getChannelCapabilities("bluebubbles"),
      },
    )
    const names = tools.map((t) => t.function.name)

    // Even strangers get all tools in the tool list — guardrails handle safety at exec time
    expect(names).toContain("shell")
    expect(names).toContain("read_file")
    expect(names).toContain("write_file")
  })

  it("execTool does not block tools based on REMOTE_BLOCKED_LOCAL_TOOLS (shell reaches handler)", async () => {
    // A shell call on a remote untrusted context should reach the handler
    // (not return the old blockedLocalToolMessage).
    // We test by running a simple echo — if it reaches the handler, we get the echo output.
    const remoteContext = {
      signin: async () => undefined,
      context: {
        friend: {
          id: "friend-1",
          name: "Test Friend",
          trustLevel: "stranger",
          externalIds: [],
          tenantMemberships: [],
          toolPreferences: {},
          notes: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          schemaVersion: 1,
        },
        channel: getChannelCapabilities("teams"),
      },
    } as unknown as ToolContext

    const result = await execTool("shell", { command: "echo hello" }, remoteContext)

    // Should NOT contain the old blocked message
    expect(result.toLowerCase()).not.toContain("can't do that")
    expect(result.toLowerCase()).not.toContain("trust level")
    // Should contain the actual command output
    expect(result.trim()).toBe("hello")
  })

  it("toolRestrictionSection does not mention blocked tools or return old restriction text", async () => {
    const { toolRestrictionSection } = await import("../../mind/prompt")
    const result = toolRestrictionSection({
      friend: {
        id: "friend-1",
        name: "Test",
        trustLevel: "stranger",
        externalIds: [],
        tenantMemberships: [],
        toolPreferences: {},
        notes: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
      },
      channel: getChannelCapabilities("bluebubbles"),
    })

    // Should not contain the old "restricted tools" heading or tool listing
    expect(result).not.toContain("restricted tools")
    expect(result).not.toContain("some of my tools are unavailable")
    expect(result).not.toContain("shell, read_file, write_file")
  })

  // --- keep existing trusted-context tests that still make sense ---

  it("exposes local tools for trusted one-to-one bluebubbles contexts", () => {
    const tools = getToolsForChannel(
      getChannelCapabilities("bluebubbles"),
      undefined,
      {
        friend: {
          id: "friend-1",
          name: "Ari",
          trustLevel: "family",
          externalIds: [{ provider: "imessage-handle", externalId: "ari@mendelow.me", linkedAt: "2026-03-08T00:00:00.000Z" }],
          tenantMemberships: [],
          toolPreferences: {},
          notes: {},
          createdAt: "2026-03-08T00:00:00.000Z",
          updatedAt: "2026-03-08T00:00:00.000Z",
          schemaVersion: 1,
        },
        channel: getChannelCapabilities("bluebubbles"),
      },
    )
    const names = tools.map((t) => t.function.name)

    expect(names).toContain("shell")
    expect(names).toContain("read_file")
    expect(names).toContain("write_file")
  })

  it("exposes local tools for trusted one-to-one teams contexts", () => {
    const tools = getToolsForChannel(
      getChannelCapabilities("teams"),
      undefined,
      {
        friend: {
          id: "friend-2",
          name: "Jordan",
          trustLevel: "friend",
          externalIds: [{ provider: "teams-user", externalId: "8:orgid:user-guid", linkedAt: "2026-03-08T00:00:00.000Z" }],
          tenantMemberships: [],
          toolPreferences: {},
          notes: {},
          createdAt: "2026-03-08T00:00:00.000Z",
          updatedAt: "2026-03-08T00:00:00.000Z",
          schemaVersion: 1,
        },
        channel: getChannelCapabilities("teams"),
      },
    )
    const names = tools.map((t) => t.function.name)

    expect(names).toContain("shell")
    expect(names).toContain("read_file")
  })

  it("file_ouroboros_bug appears in Teams tool list (integration tool, not blocked)", () => {
    const tools = getToolsForChannel(getChannelCapabilities("teams"))
    const names = tools.map((t) => t.function.name)

    expect(names).toContain("file_ouroboros_bug")
  })

  it("allows local file reads for trusted one-to-one bluebubbles contexts", async () => {
    const filePath = path.join(os.tmpdir(), `bb-tools-${Date.now()}.txt`)
    fs.writeFileSync(filePath, "hello from trusted dm", "utf8")

    const remoteContext = {
      signin: async () => undefined,
      context: {
        friend: {
          id: "friend-1",
          name: "Ari",
          trustLevel: "family",
          externalIds: [{ provider: "imessage-handle", externalId: "ari@mendelow.me", linkedAt: "2026-03-08T00:00:00.000Z" }],
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

    try {
      const result = await execTool("read_file", { path: filePath }, remoteContext)
      expect(result).toContain("hello from trusted dm")
    } finally {
      fs.unlinkSync(filePath)
    }
  })
})
