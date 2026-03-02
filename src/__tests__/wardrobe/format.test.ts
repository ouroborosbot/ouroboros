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
  it("formats kick without counter when maxKicks is 1", () => {
    expect(formatKick(1, 1)).toBe("↻ kick")
  })

  it("formats kick with counter when maxKicks > 1", () => {
    expect(formatKick(1, 3)).toBe("↻ kick 1/3")
  })

  it("formats kick with counter for second attempt", () => {
    expect(formatKick(2, 3)).toBe("↻ kick 2/3")
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
