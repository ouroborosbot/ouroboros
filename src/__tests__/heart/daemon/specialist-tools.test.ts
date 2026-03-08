import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { afterEach, describe, it, expect, vi } from "vitest"

describe("getSpecialistTools", () => {
  it("returns exactly 4 tool schemas", async () => {
    const { getSpecialistTools } = await import("../../../heart/daemon/specialist-tools")
    const tools = getSpecialistTools()
    expect(tools).toHaveLength(4)
  })

  it("hatch_agent tool has name required parameter", async () => {
    const { getSpecialistTools } = await import("../../../heart/daemon/specialist-tools")
    const tools = getSpecialistTools()
    const hatchTool = tools.find((t) => t.function.name === "hatch_agent")
    expect(hatchTool).toBeDefined()
    expect(hatchTool!.function.parameters).toEqual({
      type: "object",
      properties: { name: { type: "string", description: expect.any(String) } },
      required: ["name"],
    })
  })

  it("final_answer tool has answer parameter", async () => {
    const { getSpecialistTools } = await import("../../../heart/daemon/specialist-tools")
    const tools = getSpecialistTools()
    const faTool = tools.find((t) => t.function.name === "final_answer")
    expect(faTool).toBeDefined()
    const params = faTool!.function.parameters as { properties: { answer: unknown } }
    expect(params.properties.answer).toBeDefined()
  })

  it("read_file and list_directory tools match their base tool schemas", async () => {
    const { getSpecialistTools } = await import("../../../heart/daemon/specialist-tools")
    const { baseToolDefinitions } = await import("../../../repertoire/tools-base")
    const tools = getSpecialistTools()

    const readFile = tools.find((t) => t.function.name === "read_file")
    const listDir = tools.find((t) => t.function.name === "list_directory")
    expect(readFile).toBeDefined()
    expect(listDir).toBeDefined()

    const baseReadFile = baseToolDefinitions.find((d) => d.tool.function.name === "read_file")
    const baseListDir = baseToolDefinitions.find((d) => d.tool.function.name === "list_directory")
    expect(readFile).toEqual(baseReadFile!.tool)
    expect(listDir).toEqual(baseListDir!.tool)
  })

  it("tool names are correct", async () => {
    const { getSpecialistTools } = await import("../../../heart/daemon/specialist-tools")
    const tools = getSpecialistTools()
    const names = tools.map((t) => t.function.name).sort()
    expect(names).toEqual(["final_answer", "hatch_agent", "list_directory", "read_file"])
  })
})

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
}

describe("execSpecialistTool", () => {
  const cleanup: string[] = []

  afterEach(() => {
    while (cleanup.length > 0) {
      const entry = cleanup.pop()
      if (!entry) continue
      fs.rmSync(entry, { recursive: true, force: true })
    }
  })

  it("hatch_agent with valid name calls runHatchFlow and playHatchAnimation, returns description", async () => {
    const bundlesRoot = makeTempDir("spec-tools-bundles")
    const secretsRoot = makeTempDir("spec-tools-secrets")
    const specialistSource = makeTempDir("spec-tools-source")
    cleanup.push(bundlesRoot, secretsRoot, specialistSource)

    // Create an identity file for the hatch flow
    fs.writeFileSync(path.join(specialistSource, "python.md"), "# Python\n", "utf-8")

    const { execSpecialistTool } = await import("../../../heart/daemon/specialist-tools")
    const animChunks: string[] = []

    const result = await execSpecialistTool(
      "hatch_agent",
      { name: "TestHatch" },
      {
        humanName: "Ari",
        provider: "anthropic",
        credentials: { setupToken: `sk-ant-oat01-${"a".repeat(80)}` },
        bundlesRoot,
        secretsRoot,
        specialistIdentitiesDir: specialistSource,
        animationWriter: (text: string) => animChunks.push(text),
      },
    )

    expect(result).toContain("hatched TestHatch successfully")
    expect(result).toContain("bundle path:")
    expect(result).toContain("identity seed:")
    // Animation should have been called
    expect(animChunks.join("")).toContain("TestHatch")
  })

  it("hatch_agent without specialistIdentitiesDir omits identity overrides", async () => {
    const bundlesRoot = makeTempDir("spec-tools-bundles-no-id")
    const secretsRoot = makeTempDir("spec-tools-secrets-no-id")
    cleanup.push(bundlesRoot, secretsRoot)

    // Mock hatch-flow so we can inspect deps without needing real identity dirs
    const capturedDeps: Record<string, unknown>[] = []
    vi.doMock("../../../heart/daemon/hatch-flow", async (importOriginal) => {
      const orig = (await importOriginal()) as Record<string, unknown>
      return {
        ...orig,
        runHatchFlow: async (_input: unknown, deps: Record<string, unknown>) => {
          capturedDeps.push(deps)
          return {
            bundleRoot: "/tmp/fake-bundle",
            selectedIdentity: "fake.md",
            specialistSecretsPath: "/tmp/fake-secrets",
            hatchlingSecretsPath: "/tmp/fake-hatchling-secrets",
          }
        },
      }
    })
    vi.resetModules()

    const { execSpecialistTool } = await import("../../../heart/daemon/specialist-tools")

    const result = await execSpecialistTool(
      "hatch_agent",
      { name: "TestNoIdDir" },
      {
        humanName: "Ari",
        provider: "anthropic",
        credentials: { setupToken: `sk-ant-oat01-${"a".repeat(80)}` },
        bundlesRoot,
        secretsRoot,
        animationWriter: () => {},
      },
    )

    expect(result).toContain("hatched TestNoIdDir successfully")
    // Verify identity overrides were NOT passed (falsy branch of ternary)
    expect(capturedDeps).toHaveLength(1)
    expect(capturedDeps[0]).not.toHaveProperty("specialistIdentitySourceDir")
    expect(capturedDeps[0]).not.toHaveProperty("specialistIdentityTargetDir")

    vi.restoreAllMocks()
  })

  it("hatch_agent with missing name returns error", async () => {
    const { execSpecialistTool } = await import("../../../heart/daemon/specialist-tools")

    const result = await execSpecialistTool(
      "hatch_agent",
      {},
      {
        humanName: "Ari",
        provider: "anthropic",
        credentials: { setupToken: "test" },
      },
    )

    expect(result).toContain("error")
    expect(result).toContain("missing")
    expect(result).toContain("name")
  })

  it("read_file delegates to base handler and returns file content", async () => {
    const tmpDir = makeTempDir("spec-tools-readfile")
    cleanup.push(tmpDir)
    const filePath = path.join(tmpDir, "test.txt")
    fs.writeFileSync(filePath, "hello world", "utf-8")

    const { execSpecialistTool } = await import("../../../heart/daemon/specialist-tools")

    const result = await execSpecialistTool(
      "read_file",
      { path: filePath },
      {
        humanName: "Ari",
        provider: "anthropic",
        credentials: { setupToken: "test" },
      },
    )

    expect(result).toBe("hello world")
  })

  it("read_file returns error for missing file", async () => {
    const { execSpecialistTool } = await import("../../../heart/daemon/specialist-tools")

    const result = await execSpecialistTool(
      "read_file",
      { path: "/nonexistent/path/file.txt" },
      {
        humanName: "Ari",
        provider: "anthropic",
        credentials: { setupToken: "test" },
      },
    )

    expect(result).toContain("error:")
  })

  it("list_directory delegates to base handler and returns listing", async () => {
    const tmpDir = makeTempDir("spec-tools-listdir")
    cleanup.push(tmpDir)
    fs.writeFileSync(path.join(tmpDir, "file1.txt"), "a", "utf-8")
    fs.mkdirSync(path.join(tmpDir, "subdir"))

    const { execSpecialistTool } = await import("../../../heart/daemon/specialist-tools")

    const result = await execSpecialistTool(
      "list_directory",
      { path: tmpDir },
      {
        humanName: "Ari",
        provider: "anthropic",
        credentials: { setupToken: "test" },
      },
    )

    expect(result).toContain("file1.txt")
    expect(result).toContain("subdir")
  })

  it("list_directory returns error for missing directory", async () => {
    const { execSpecialistTool } = await import("../../../heart/daemon/specialist-tools")

    const result = await execSpecialistTool(
      "list_directory",
      { path: "/nonexistent/directory" },
      {
        humanName: "Ari",
        provider: "anthropic",
        credentials: { setupToken: "test" },
      },
    )

    expect(result).toContain("error:")
  })

  it("unknown tool name returns error", async () => {
    const { execSpecialistTool } = await import("../../../heart/daemon/specialist-tools")

    const result = await execSpecialistTool(
      "unknown_tool",
      {},
      {
        humanName: "Ari",
        provider: "anthropic",
        credentials: { setupToken: "test" },
      },
    )

    expect(result).toContain("error")
    expect(result).toContain("unknown")
  })
})
