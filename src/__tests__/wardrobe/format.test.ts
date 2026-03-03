import { describe, it, expect } from "vitest"
import { formatToolResult, formatKick, formatError } from "../../wardrobe/format"

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
