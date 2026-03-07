import { describe, it, expect, vi } from "vitest"
import { formatToolResult, formatKick, formatError } from "../../mind/format"

describe("formatToolResult", () => {
  it("formats successful tool with summary", () => {
    expect(formatToolResult("read_file", "package.json", true)).toBe("✓ read_file (package.json)")
  })

  it("formats successful tool without summary (empty string)", () => {
    expect(formatToolResult("read_file", "", true)).toBe("✓ read_file")
  })

  it("formats failed tool with summary", () => {
    expect(formatToolResult("read_file", "missing.txt", false)).toBe("✗ read_file: missing.txt")
  })

  it("compacts multiline summary to a single line", () => {
    expect(formatToolResult("save_friend_note", "type=name\ncontent=Ari", true)).toBe(
      "✓ save_friend_note (type=name content=Ari)",
    )
  })

  it("truncates long summaries", () => {
    const long = "x".repeat(130)
    expect(formatToolResult("shell", long, true)).toBe(`✓ shell (${"x".repeat(120)}...)`)
  })
})

describe("formatKick", () => {
  it("always returns kick with no counter", () => {
    expect(formatKick()).toBe("↻ kick")
  })
})

describe("formatError", () => {
  it("formats error with message", () => {
    expect(formatError(new Error("connection failed"))).toBe("Error: connection failed")
  })

  it("handles empty error message", () => {
    expect(formatError(new Error(""))).toBe("Error: ")
  })
})

describe("format observability contract", () => {
  it("emits channels message event when formatting tool output", async () => {
    vi.resetModules()
    const emitNervesEvent = vi.fn()
    vi.doMock("../../nerves/runtime", () => ({
      emitNervesEvent,
    }))
    const format = await import("../../mind/format")

    expect(format.formatToolResult("read_file", "package.json", true)).toBe("✓ read_file (package.json)")
    expect(emitNervesEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "channel.message_sent",
      component: "channels",
    }))
  })
})
