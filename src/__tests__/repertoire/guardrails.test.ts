import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fs from "node:fs"

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs")
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
  }
})

describe("guardInvocation — structural guardrails", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  // --- edit_file requires prior read ---

  it("edit_file rejects if path has not been read", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("edit_file", { path: "/some/file.ts" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toMatch(/read/i)
    }
  })

  it("edit_file allows if path is in readPaths", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("edit_file", { path: "/some/file.ts" }, { readPaths: new Set(["/some/file.ts"]) })
    expect(result.allowed).toBe(true)
  })

  // --- write_file on existing file requires prior read ---

  it("write_file rejects overwriting existing file without prior read", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("write_file", { path: "/existing/file.ts" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toMatch(/read/i)
    }
  })

  it("write_file allows new file (not on disk) without prior read", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("write_file", { path: "/new/file.ts" }, { readPaths: new Set() })
    expect(result.allowed).toBe(true)
  })

  it("write_file allows overwriting existing file if in readPaths", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("write_file", { path: "/existing/file.ts" }, { readPaths: new Set(["/existing/file.ts"]) })
    expect(result.allowed).toBe(true)
  })

  // --- destructive shell patterns blocked ---

  it("blocks rm -rf /", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "rm -rf /" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toMatch(/dangerous/i)
  })

  it("blocks rm -rf ~", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "rm -rf ~" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
  })

  it("blocks chmod -R 777 /", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "chmod -R 777 /" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
  })

  it("blocks mkfs.ext4", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "mkfs.ext4 /dev/sda" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
  })

  it("blocks dd if=/dev/zero of=/dev/sda", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "dd if=/dev/zero of=/dev/sda" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
  })

  it("allows non-destructive commands like ls", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "ls -la" }, { readPaths: new Set() })
    expect(result.allowed).toBe(true)
  })

  it("allows non-destructive commands like cat", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "cat foo.txt" }, { readPaths: new Set() })
    expect(result.allowed).toBe(true)
  })

  it("allows non-destructive commands like git status", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "git status" }, { readPaths: new Set() })
    expect(result.allowed).toBe(true)
  })

  // --- protected paths blocked for writes ---

  it("blocks write_file to .git/config", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("write_file", { path: ".git/config" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toMatch(/protected/i)
  })

  it("blocks edit_file on .git/hooks/pre-commit", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("edit_file", { path: ".git/hooks/pre-commit" }, { readPaths: new Set([".git/hooks/pre-commit"]) })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toMatch(/protected/i)
  })

  it("blocks shell write to .git/config", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "echo x > .git/config" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
  })

  it("allows read_file on .git/config (read-only)", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("read_file", { path: ".git/config" }, { readPaths: new Set() })
    expect(result.allowed).toBe(true)
  })

  // --- protected paths include ~/.agentsecrets/ ---

  it("blocks write_file to ~/.agentsecrets/anything", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const home = process.env.HOME || "/Users/test"
    const result = guardInvocation("write_file", { path: `${home}/.agentsecrets/agent/secrets.json` }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toMatch(/protected/i)
  })

  it("blocks shell write to ~/.agentsecrets/", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const home = process.env.HOME || "/Users/test"
    const result = guardInvocation("shell", { command: `cat secrets > ${home}/.agentsecrets/x` }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
  })

  // --- read-only tools always allowed ---

  it("read_file always allowed regardless of context", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("read_file", { path: "/any/path" }, { readPaths: new Set() })
    expect(result.allowed).toBe(true)
  })

  it("glob always allowed regardless of context", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("glob", { pattern: "**/*.ts" }, { readPaths: new Set() })
    expect(result.allowed).toBe(true)
  })

  it("grep always allowed regardless of context", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("grep", { pattern: "foo", path: "." }, { readPaths: new Set() })
    expect(result.allowed).toBe(true)
  })

  // --- reason strings are agent-friendly (structural tone) ---

  it("structural block reasons use safety-focused tone", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("edit_file", { path: "/unread/file" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toMatch(/read.*file/i)
    }
  })

  it("destructive command reason uses safety-focused tone", async () => {
    const { guardInvocation } = await import("../../repertoire/guardrails")
    const result = guardInvocation("shell", { command: "rm -rf /" }, { readPaths: new Set() })
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toMatch(/dangerous/i)
    }
  })
})
