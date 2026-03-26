import { describe, it, expect, vi } from "vitest"
import { emitNervesEvent } from "../../../nerves/runtime"
import { parseOuroCommand } from "../../../heart/daemon/daemon-cli"

describe("ouro mcp-serve CLI command", () => {
  it("parses mcp-serve with --agent flag", () => {
    emitNervesEvent({
      component: "daemon",
      event: "daemon.cli_mcp_serve_test_start",
      message: "testing mcp-serve parse",
      meta: {},
    })

    const command = parseOuroCommand(["mcp-serve", "--agent", "slugger"])
    expect(command.kind).toBe("mcp-serve")
    expect((command as any).agent).toBe("slugger")

    emitNervesEvent({
      component: "daemon",
      event: "daemon.cli_mcp_serve_test_end",
      message: "mcp-serve parse test complete",
      meta: {},
    })
  })

  it("parses mcp-serve with --agent and --friend flags", () => {
    emitNervesEvent({
      component: "daemon",
      event: "daemon.cli_mcp_serve_test_start",
      message: "testing mcp-serve with friend",
      meta: {},
    })

    const command = parseOuroCommand(["mcp-serve", "--agent", "slugger", "--friend", "friend-123"])
    expect(command.kind).toBe("mcp-serve")
    expect((command as any).agent).toBe("slugger")
    expect((command as any).friendId).toBe("friend-123")

    emitNervesEvent({
      component: "daemon",
      event: "daemon.cli_mcp_serve_test_end",
      message: "mcp-serve with friend test complete",
      meta: {},
    })
  })

  it("throws when mcp-serve is missing --agent", () => {
    emitNervesEvent({
      component: "daemon",
      event: "daemon.cli_mcp_serve_test_start",
      message: "testing mcp-serve missing agent",
      meta: {},
    })

    expect(() => parseOuroCommand(["mcp-serve"])).toThrow("--agent")

    emitNervesEvent({
      component: "daemon",
      event: "daemon.cli_mcp_serve_test_end",
      message: "mcp-serve missing agent test complete",
      meta: {},
    })
  })

  it("defaults friendId to undefined when --friend not provided", () => {
    emitNervesEvent({
      component: "daemon",
      event: "daemon.cli_mcp_serve_test_start",
      message: "testing mcp-serve default friend",
      meta: {},
    })

    const command = parseOuroCommand(["mcp-serve", "--agent", "test-agent"])
    expect((command as any).friendId).toBeUndefined()

    emitNervesEvent({
      component: "daemon",
      event: "daemon.cli_mcp_serve_test_end",
      message: "mcp-serve default friend test complete",
      meta: {},
    })
  })
})
