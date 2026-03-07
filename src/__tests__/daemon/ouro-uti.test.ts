import { describe, expect, it, vi } from "vitest"

import { registerOuroBundleUti } from "../../daemon/ouro-uti"

describe(".ouro UTI registration", () => {
  it("skips registration outside macOS", () => {
    const execFileSync = vi.fn()

    const result = registerOuroBundleUti({
      platform: "linux",
      execFileSync,
    })

    expect(result.attempted).toBe(false)
    expect(result.registered).toBe(false)
    expect(result.skippedReason).toBe("non-macos")
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it("registers UTI on macOS and skips icon conversion when source image is missing", () => {
    const execFileSync = vi.fn()
    const existsSync = vi.fn((target: string) => !target.endsWith("ouroboros.png"))
    const mkdirSync = vi.fn()
    const writeFileSync = vi.fn()
    const rmSync = vi.fn()

    const result = registerOuroBundleUti({
      platform: "darwin",
      homeDir: "/tmp/home",
      repoRoot: "/tmp/repo",
      existsSync,
      mkdirSync,
      writeFileSync,
      rmSync,
      execFileSync,
    })

    expect(result.attempted).toBe(true)
    expect(result.registered).toBe(true)
    expect(result.iconInstalled).toBe(false)
    expect(execFileSync).toHaveBeenCalledWith(
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
      ["-f", "/tmp/home/Library/Application Support/ouro/uti/OuroBundleRegistry.app"],
    )

    const invokedCommands = execFileSync.mock.calls.map((call) => call[0] as string)
    expect(invokedCommands).not.toContain("sips")
    expect(invokedCommands).not.toContain("iconutil")
  })

  it("builds icns icon and registers UTI on macOS when source image exists", () => {
    const execFileSync = vi.fn()
    const existsSync = vi.fn(() => true)
    const mkdirSync = vi.fn()
    const writeFileSync = vi.fn()
    const rmSync = vi.fn()

    const result = registerOuroBundleUti({
      platform: "darwin",
      homeDir: "/tmp/home",
      repoRoot: "/tmp/repo",
      existsSync,
      mkdirSync,
      writeFileSync,
      rmSync,
      execFileSync,
    })

    expect(result.attempted).toBe(true)
    expect(result.registered).toBe(true)
    expect(result.iconInstalled).toBe(true)

    const invokedCommands = execFileSync.mock.calls.map((call) => call[0] as string)
    expect(invokedCommands).toContain("sips")
    expect(invokedCommands).toContain("iconutil")
    expect(invokedCommands).toContain(
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    )
  })

  it("returns non-blocking failure result when registration command errors", () => {
    const execFileSync = vi.fn((file: string) => {
      if (file.endsWith("lsregister")) {
        throw new Error("lsregister failed")
      }
    })

    const result = registerOuroBundleUti({
      platform: "darwin",
      homeDir: "/tmp/home",
      repoRoot: "/tmp/repo",
      existsSync: vi.fn((target: string) => !target.endsWith("ouroboros.png")),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      rmSync: vi.fn(),
      execFileSync,
    })

    expect(result.attempted).toBe(true)
    expect(result.registered).toBe(false)
    expect(result.skippedReason).toContain("lsregister failed")
  })
})
