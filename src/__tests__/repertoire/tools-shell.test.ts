import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}))

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock("../../repertoire/skills", () => ({
  listSkills: vi.fn(),
  loadSkill: vi.fn(),
}))

vi.mock("../../repertoire/graph-client", () => ({
  getProfile: vi.fn(),
  graphRequest: vi.fn(),
}))

vi.mock("../../repertoire/ado-client", () => ({
  queryWorkItems: vi.fn(),
  adoRequest: vi.fn(),
  discoverOrganizations: vi.fn(),
}))

vi.mock("../../repertoire/github-client", () => ({
  githubRequest: vi.fn(),
}))

const mockTaskModule = {
  getBoard: vi.fn(),
  createTask: vi.fn(),
  updateStatus: vi.fn(),
  boardStatus: vi.fn(),
  boardAction: vi.fn(),
  boardDeps: vi.fn(),
  boardSessions: vi.fn(),
}

vi.mock("../../repertoire/tasks", () => ({
  getTaskModule: () => mockTaskModule,
}))

vi.mock("../../heart/identity", () => {
  const DEFAULT_AGENT_CONTEXT = {
    maxTokens: 80000,
    contextMargin: 20,
  }
  return {
    DEFAULT_AGENT_CONTEXT,
    loadAgentConfig: vi.fn(() => ({
      name: "testagent",
      configPath: "~/.agentsecrets/testagent/secrets.json",
      provider: "minimax",
      context: { ...DEFAULT_AGENT_CONTEXT },
    })),
    getAgentName: vi.fn(() => "testagent"),
    getAgentSecretsPath: vi.fn(() => "/tmp/.agentsecrets/testagent/secrets.json"),
    getAgentRoot: vi.fn(() => "/mock/repo/testagent"),
    getRepoRoot: vi.fn(() => "/mock/repo"),
    getAgentRepoWorkspacesRoot: vi.fn(() => "/mock/repo/testagent/state/workspaces"),
    HARNESS_CANONICAL_REPO_URL: "https://github.com/ouroborosbot/ouroboros.git",
    resetIdentity: vi.fn(),
  }
})

import { execSync, spawn } from "child_process"
import { loadAgentConfig } from "../../heart/identity"
import { EventEmitter } from "events"

describe("shell tool", () => {
  let execTool: (name: string, args: any, ctx?: any) => Promise<string>

  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    vi.resetModules()
    vi.mocked(execSync).mockReset()
    vi.mocked(loadAgentConfig).mockReset().mockReturnValue({
      name: "testagent",
      configPath: "~/.agentsecrets/testagent/secrets.json",
      provider: "minimax",
      context: { maxTokens: 80000, contextMargin: 20 },
    } as any)
    mockTaskModule.getBoard.mockReset().mockReturnValue({
      compact: "[Tasks] drafting:0 processing:0 validating:0 collaborating:0 paused:0 blocked:0 done:0",
      full: "no tasks found",
      byStatus: { drafting: [], processing: [], validating: [], collaborating: [], paused: [], blocked: [], done: [], cancelled: [] },
      actionRequired: [],
      unresolvedDependencies: [],
      activeSessions: [],
    })
    mockTaskModule.createTask.mockReset()
    mockTaskModule.updateStatus.mockReset()
    mockTaskModule.boardStatus.mockReset().mockReturnValue([])
    mockTaskModule.boardAction.mockReset().mockReturnValue([])
    mockTaskModule.boardDeps.mockReset().mockReturnValue([])
    mockTaskModule.boardSessions.mockReset().mockReturnValue([])
    const config = await import("../../heart/config")
    config.resetConfigCache()
    const tools = await import("../../repertoire/tools")
    execTool = tools.execTool
  })

  // ── Unit 3.1a: Configurable Shell Timeout ──

  describe("configurable timeout", () => {
    it("shell tool schema includes optional timeout_ms parameter", async () => {
      const toolsBase = await import("../../repertoire/tools-base")
      const shellDef = toolsBase.baseToolDefinitions.find(
        (d) => d.tool.function.name === "shell",
      )
      expect(shellDef).toBeDefined()
      const props = shellDef!.tool.function.parameters?.properties as any
      expect(props.timeout_ms).toBeDefined()
      expect(props.timeout_ms.type).toBe("number")
      expect(props.timeout_ms.description).toContain("Timeout in milliseconds")
    })

    it("uses default timeout (30000ms) when no timeout_ms provided", async () => {
      vi.mocked(execSync).mockReturnValue("ok")
      await execTool("shell", { command: "echo hi" })
      expect(execSync).toHaveBeenCalledWith("echo hi", expect.objectContaining({ timeout: 30000 }))
    })

    it("uses custom timeout_ms when provided", async () => {
      vi.mocked(execSync).mockReturnValue("ok")
      await execTool("shell", { command: "sleep 5", timeout_ms: "60000" })
      expect(execSync).toHaveBeenCalledWith("sleep 5", expect.objectContaining({ timeout: 60000 }))
    })

    it("clamps timeout_ms to maximum cap of 600000ms", async () => {
      vi.mocked(execSync).mockReturnValue("ok")
      await execTool("shell", { command: "long-task", timeout_ms: "999999" })
      expect(execSync).toHaveBeenCalledWith("long-task", expect.objectContaining({ timeout: 600000 }))
    })

    it("uses default timeout when timeout_ms is 0", async () => {
      vi.mocked(execSync).mockReturnValue("ok")
      await execTool("shell", { command: "echo hi", timeout_ms: "0" })
      expect(execSync).toHaveBeenCalledWith("echo hi", expect.objectContaining({ timeout: 30000 }))
    })

    it("uses default timeout when timeout_ms is negative", async () => {
      vi.mocked(execSync).mockReturnValue("ok")
      await execTool("shell", { command: "echo hi", timeout_ms: "-5000" })
      expect(execSync).toHaveBeenCalledWith("echo hi", expect.objectContaining({ timeout: 30000 }))
    })

    it("uses agent config shell.defaultTimeout when set", async () => {
      vi.mocked(loadAgentConfig).mockReturnValue({
        name: "testagent",
        configPath: "~/.agentsecrets/testagent/secrets.json",
        provider: "minimax",
        context: { maxTokens: 80000, contextMargin: 20 },
        shell: { defaultTimeout: 45000 },
      } as any)
      // Re-import to pick up new config
      vi.resetModules()
      const config = await import("../../heart/config")
      config.resetConfigCache()
      const tools = await import("../../repertoire/tools")
      vi.mocked(execSync).mockReturnValue("ok")
      await tools.execTool("shell", { command: "echo hi" })
      expect(execSync).toHaveBeenCalledWith("echo hi", expect.objectContaining({ timeout: 45000 }))
    })

    it("timeout_ms overrides agent config default", async () => {
      vi.mocked(loadAgentConfig).mockReturnValue({
        name: "testagent",
        configPath: "~/.agentsecrets/testagent/secrets.json",
        provider: "minimax",
        context: { maxTokens: 80000, contextMargin: 20 },
        shell: { defaultTimeout: 45000 },
      } as any)
      vi.resetModules()
      const config = await import("../../heart/config")
      config.resetConfigCache()
      const tools = await import("../../repertoire/tools")
      vi.mocked(execSync).mockReturnValue("ok")
      await tools.execTool("shell", { command: "echo hi", timeout_ms: "10000" })
      expect(execSync).toHaveBeenCalledWith("echo hi", expect.objectContaining({ timeout: 10000 }))
    })

    it("agent config defaultTimeout is also capped at 600000ms", async () => {
      vi.mocked(loadAgentConfig).mockReturnValue({
        name: "testagent",
        configPath: "~/.agentsecrets/testagent/secrets.json",
        provider: "minimax",
        context: { maxTokens: 80000, contextMargin: 20 },
        shell: { defaultTimeout: 900000 },
      } as any)
      vi.resetModules()
      const config = await import("../../heart/config")
      config.resetConfigCache()
      const tools = await import("../../repertoire/tools")
      vi.mocked(execSync).mockReturnValue("ok")
      await tools.execTool("shell", { command: "echo hi" })
      expect(execSync).toHaveBeenCalledWith("echo hi", expect.objectContaining({ timeout: 600000 }))
    })
  })

  // ── Unit 3.2a: Background Shell Mode ──

  describe("background mode", () => {
    it("shell tool schema includes optional background parameter", async () => {
      const toolsBase = await import("../../repertoire/tools-base")
      const shellDef = toolsBase.baseToolDefinitions.find(
        (d) => d.tool.function.name === "shell",
      )
      expect(shellDef).toBeDefined()
      const props = shellDef!.tool.function.parameters?.properties as any
      expect(props.background).toBeDefined()
      expect(props.background.type).toBe("boolean")
    })

    it("background=true returns immediately with process ID and status", async () => {
      const mockProc = Object.assign(new EventEmitter(), {
        pid: 12345,
        stdout: Object.assign(new EventEmitter(), { on: vi.fn() }),
        stderr: Object.assign(new EventEmitter(), { on: vi.fn() }),
        stdin: { write: vi.fn(), end: vi.fn() },
        kill: vi.fn(),
      })
      vi.mocked(spawn).mockReturnValue(mockProc as any)

      const result = await execTool("shell", { command: "sleep 100", background: "true" })
      const parsed = JSON.parse(result)
      expect(parsed.id).toBeDefined()
      expect(typeof parsed.id).toBe("string")
      expect(parsed.command).toBe("sleep 100")
      expect(parsed.status).toBe("running")
    })

    it("non-background execution behaves as before (synchronous)", async () => {
      vi.mocked(execSync).mockReturnValue("sync output")
      const result = await execTool("shell", { command: "echo hi" })
      expect(result).toBe("sync output")
      expect(execSync).toHaveBeenCalled()
    })

    it("shell_status tool is registered", async () => {
      const toolsBase = await import("../../repertoire/tools-base")
      const statusDef = toolsBase.baseToolDefinitions.find(
        (d) => d.tool.function.name === "shell_status",
      )
      expect(statusDef).toBeDefined()
      expect(statusDef!.tool.function.parameters?.properties).toHaveProperty("id")
    })

    it("shell_tail tool is registered", async () => {
      const toolsBase = await import("../../repertoire/tools-base")
      const tailDef = toolsBase.baseToolDefinitions.find(
        (d) => d.tool.function.name === "shell_tail",
      )
      expect(tailDef).toBeDefined()
      expect(tailDef!.tool.function.parameters?.properties).toHaveProperty("id")
      expect(tailDef!.tool.function.parameters?.required).toContain("id")
    })

    it("shell_status without id lists all background processes", async () => {
      // Start a background process first
      const mockProc = Object.assign(new EventEmitter(), {
        pid: 99999,
        stdout: Object.assign(new EventEmitter(), { on: vi.fn() }),
        stderr: Object.assign(new EventEmitter(), { on: vi.fn() }),
        stdin: { write: vi.fn(), end: vi.fn() },
        kill: vi.fn(),
      })
      vi.mocked(spawn).mockReturnValue(mockProc as any)
      await execTool("shell", { command: "sleep 100", background: "true" })

      const result = await execTool("shell_status", {})
      const parsed = JSON.parse(result)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBeGreaterThanOrEqual(1)
      expect(parsed[0]).toHaveProperty("id")
      expect(parsed[0]).toHaveProperty("command")
      expect(parsed[0]).toHaveProperty("status")
    })

    it("shell_status with id returns specific process info", async () => {
      const mockProc = Object.assign(new EventEmitter(), {
        pid: 11111,
        stdout: Object.assign(new EventEmitter(), { on: vi.fn() }),
        stderr: Object.assign(new EventEmitter(), { on: vi.fn() }),
        stdin: { write: vi.fn(), end: vi.fn() },
        kill: vi.fn(),
      })
      vi.mocked(spawn).mockReturnValue(mockProc as any)
      const bgResult = await execTool("shell", { command: "sleep 50", background: "true" })
      const { id } = JSON.parse(bgResult)

      const result = await execTool("shell_status", { id })
      const parsed = JSON.parse(result)
      expect(parsed.id).toBe(id)
      expect(parsed.command).toBe("sleep 50")
      expect(parsed.status).toBe("running")
    })

    it("shell_status with unknown id returns not found", async () => {
      const result = await execTool("shell_status", { id: "nonexistent-id" })
      expect(result).toContain("not found")
    })

    it("shell_tail returns recent output from background process", async () => {
      const stdoutEmitter = new EventEmitter()
      const stderrEmitter = new EventEmitter()
      const mockProc = Object.assign(new EventEmitter(), {
        pid: 22222,
        stdout: stdoutEmitter,
        stderr: stderrEmitter,
        stdin: { write: vi.fn(), end: vi.fn() },
        kill: vi.fn(),
      })
      vi.mocked(spawn).mockReturnValue(mockProc as any)
      await execTool("shell", { command: "echo hello", background: "true" })

      // Simulate stdout data
      stdoutEmitter.emit("data", Buffer.from("hello world\n"))

      const toolsBase = await import("../../repertoire/tools-base")
      const tailDef = toolsBase.baseToolDefinitions.find(
        (d) => d.tool.function.name === "shell_tail",
      )
      expect(tailDef).toBeDefined()
    })

    it("shell_tail with unknown id returns not found", async () => {
      const result = await execTool("shell_tail", { id: "nonexistent-id" })
      expect(result).toContain("not found")
    })
  })
})
