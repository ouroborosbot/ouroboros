import { execSync as nodeExecSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { getRepoRoot } from "../identity"
import { emitNervesEvent } from "../nerves/runtime"

export interface WorkspaceEnsureResult {
  workspacePath: string
  created: boolean
  updated: boolean
}

export interface WorkspaceDeps {
  existsSync?: (target: string) => boolean
  mkdirSync?: (target: string, options: { recursive: boolean }) => void
  execSync?: (command: string, options: { encoding: "utf-8" }) => string
  getOriginUrl?: () => string
}

export interface EnsureWorkspaceOptions {
  branch?: string
  homeDir?: string
  deps?: WorkspaceDeps
}

function defaultOriginUrl(): string {
  const repoRoot = getRepoRoot()
  return nodeExecSync(`git -C ${repoRoot} remote get-url origin`, { encoding: "utf-8" }).trim()
}

export function workspacePathForAgent(agent: string, homeDir = os.homedir()): string {
  return path.join(homeDir, "AgentWorkspaces", agent)
}

export function ensureAgentWorkspace(agent: string, options: EnsureWorkspaceOptions = {}): WorkspaceEnsureResult {
  const branch = options.branch ?? "main"
  const homeDir = options.homeDir ?? os.homedir()
  const deps = options.deps ?? {}
  const existsSync = deps.existsSync ?? fs.existsSync
  const mkdirSync = deps.mkdirSync ?? fs.mkdirSync
  const execSync = deps.execSync ?? nodeExecSync
  const getOriginUrl = deps.getOriginUrl ?? defaultOriginUrl

  const workspaceRoot = path.join(homeDir, "AgentWorkspaces")
  const workspacePath = workspacePathForAgent(agent, homeDir)
  mkdirSync(workspaceRoot, { recursive: true })

  emitNervesEvent({
    component: "daemon",
    event: "daemon.workspace_sync_start",
    message: "ensuring agent workspace clone",
    meta: { agent, workspacePath, branch },
  })

  if (!existsSync(workspacePath)) {
    const origin = getOriginUrl()
    execSync(`git clone --branch ${branch} ${origin} ${workspacePath}`, { encoding: "utf-8" })
    emitNervesEvent({
      component: "daemon",
      event: "daemon.workspace_sync_end",
      message: "created agent workspace clone",
      meta: { agent, workspacePath, branch, created: true },
    })
    return { workspacePath, created: true, updated: false }
  }

  execSync(`git -C ${workspacePath} fetch origin ${branch}`, { encoding: "utf-8" })
  execSync(`git -C ${workspacePath} pull --ff-only origin ${branch}`, { encoding: "utf-8" })
  emitNervesEvent({
    component: "daemon",
    event: "daemon.workspace_sync_end",
    message: "updated existing agent workspace clone",
    meta: { agent, workspacePath, branch, created: false },
  })
  return { workspacePath, created: false, updated: true }
}
