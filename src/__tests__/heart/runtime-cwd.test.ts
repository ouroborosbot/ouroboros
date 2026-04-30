import { describe, expect, it } from "vitest"

describe("recoverRuntimeCwd", () => {
  it("returns the current cwd when it is still valid", async () => {
    const { recoverRuntimeCwd } = await import("../../heart/runtime-cwd")

    expect(recoverRuntimeCwd()).toBe(process.cwd())
  })

  it("repairs a deleted process cwd to the provided fallback", async () => {
    const fallback = "/repo/root"
    const { recoverRuntimeCwd } = await import("../../heart/runtime-cwd")
    let currentInvalid = true
    let current = "/deleted/worktree"

    expect(recoverRuntimeCwd(fallback, {
      cwd: () => {
        if (currentInvalid) throw new Error("ENOENT: no such file or directory, uv_cwd")
        return current
      },
      chdir: (target) => {
        current = target
        currentInvalid = false
      },
      existsSync: () => true,
    })).toBe(fallback)
    expect(current).toBe(fallback)
  })
})
