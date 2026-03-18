import * as fs from "node:fs"
import * as os from "node:os"
import { isTrustedLevel, type TrustLevel } from "../mind/friends/types"
import { emitNervesEvent } from "../nerves/runtime"

export interface GuardContext {
  readPaths: ReadonlySet<string>
  trustLevel?: TrustLevel
  agentRoot?: string
}

export type GuardResult = { allowed: true } | { allowed: false; reason: string }

// --- read-only tools that never need guardrails ---

const READ_ONLY_TOOLS = new Set(["read_file", "glob", "grep"])

// --- protected path prefixes (write/edit/shell-write blocked) ---

const PROTECTED_PATH_SEGMENTS = [".git/"]

function getProtectedAbsolutePrefixes(): string[] {
  const home = os.homedir()
  return [`${home}/.agentsecrets/`]
}

function isProtectedPath(filePath: string): boolean {
  for (const segment of PROTECTED_PATH_SEGMENTS) {
    if (filePath.includes(`/${segment}`) || filePath.startsWith(segment)) return true
  }
  const absPrefixes = getProtectedAbsolutePrefixes()
  for (const prefix of absPrefixes) {
    if (filePath.startsWith(prefix)) return true
  }
  return false
}

// --- destructive shell patterns ---

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+(-\w*\s+)*-\w*r\w*\s+(-\w+\s+)*[/~]/,      // rm -rf / or rm -rf ~
  /\bchmod\s+(-\w*\s+)*-\w*R\w*\s+\d+\s+\//,           // chmod -R 777 /
  /\bmkfs\b/,                                             // mkfs.*
  /\bdd\s+if=/,                                           // dd if=
]

function isDestructiveShellCommand(command: string): boolean {
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) return true
  }
  return false
}

// --- shell commands that write to protected paths ---

function shellWritesToProtectedPath(command: string): boolean {
  // Check for redirect operators writing to protected paths
  const redirectMatch = command.match(/>\s*(\S+)/)
  if (redirectMatch && isProtectedPath(redirectMatch[1])) return true

  // Check for tee writing to protected paths
  const teeMatch = command.match(/tee\s+(?:-\w+\s+)*(\S+)/)
  if (teeMatch && isProtectedPath(teeMatch[1])) return true

  return false
}

// --- structural guardrail checks ---

function checkReadBeforeWrite(toolName: string, args: Record<string, string>, context: GuardContext): GuardResult {
  if (toolName === "edit_file") {
    const filePath = args.path || ""
    if (!context.readPaths.has(filePath)) {
      return { allowed: false, reason: "i need to read that file first before i can edit it." }
    }
  }

  if (toolName === "write_file") {
    const filePath = args.path || ""
    if (context.readPaths.has(filePath)) return { allowed: true }
    // New files (not on disk) are fine
    if (!fs.existsSync(filePath)) return { allowed: true }
    return { allowed: false, reason: "i need to read that file first before i can overwrite it." }
  }

  return { allowed: true }
}

function checkDestructiveShellPatterns(toolName: string, args: Record<string, string>): GuardResult {
  if (toolName !== "shell") return { allowed: true }
  const command = args.command || ""
  if (isDestructiveShellCommand(command)) {
    return { allowed: false, reason: "that command is too dangerous to run — it could cause irreversible damage." }
  }
  return { allowed: true }
}

function checkProtectedPaths(toolName: string, args: Record<string, string>): GuardResult {
  if (toolName === "write_file" || toolName === "edit_file") {
    const filePath = args.path || ""
    if (isProtectedPath(filePath)) {
      return { allowed: false, reason: "that path is protected — i can read it but not modify it." }
    }
  }

  if (toolName === "shell") {
    const command = args.command || ""
    if (shellWritesToProtectedPath(command)) {
      return { allowed: false, reason: "that command writes to a protected path." }
    }
  }

  return { allowed: true }
}

function checkStructuralGuardrails(toolName: string, args: Record<string, string>, context: GuardContext): GuardResult {
  // Protected paths first (always blocks even if file was read)
  const protectedResult = checkProtectedPaths(toolName, args)
  if (!protectedResult.allowed) return protectedResult

  // Destructive shell patterns
  const destructiveResult = checkDestructiveShellPatterns(toolName, args)
  if (!destructiveResult.allowed) return destructiveResult

  // Read-before-write
  const readResult = checkReadBeforeWrite(toolName, args, context)
  if (!readResult.allowed) return readResult

  return { allowed: true }
}

// --- ouro CLI trust manifest ---

/** Minimum trust level required for each ouro CLI subcommand. */
export const OURO_CLI_TRUST_MANIFEST: Record<string, TrustLevel> = {
  whoami: "acquaintance",
  changelog: "acquaintance",
  "session list": "acquaintance",
  "task board": "friend",
  "task create": "friend",
  "task update": "friend",
  "task show": "friend",
  "task actionable": "friend",
  "task deps": "friend",
  "task sessions": "friend",
  "friend list": "friend",
  "friend show": "friend",
  "friend create": "friend",
  "reminder create": "friend",
}

// --- general CLI read-only allowlist for acquaintance ---

const ACQUAINTANCE_SHELL_ALLOWLIST = new Set([
  "cat", "ls", "head", "tail", "wc", "file", "stat", "which", "echo",
  "pwd", "env", "printenv", "whoami", "date", "uname",
])

const ACQUAINTANCE_GIT_ALLOWLIST = new Set([
  "status", "log", "show", "diff", "branch",
])

function trustLevelSatisfied(required: TrustLevel, actual: TrustLevel): boolean {
  const LEVEL_ORDER: Record<TrustLevel, number> = {
    stranger: 0,
    acquaintance: 1,
    friend: 2,
    family: 3,
  }
  return LEVEL_ORDER[actual] >= LEVEL_ORDER[required]
}

function checkOuroCliTrust(command: string, trustLevel: TrustLevel): GuardResult {
  // Extract the ouro subcommand: "ouro task board --flag" -> "task board"
  const afterOuro = command.replace(/^ouro\s+/, "").trim()
  if (!afterOuro) {
    return { allowed: false, reason: "i'd need a closer friend to vouch for you before i can run that." }
  }

  // Try two-word match first (e.g. "task board"), then one-word (e.g. "whoami")
  const tokens = afterOuro.split(/\s+/)
  const twoWord = tokens.length >= 2 ? `${tokens[0]} ${tokens[1]}` : null
  const oneWord = tokens[0]

  const requiredLevel = (twoWord && OURO_CLI_TRUST_MANIFEST[twoWord])
    || OURO_CLI_TRUST_MANIFEST[oneWord]

  if (!requiredLevel) {
    // Unknown subcommand — treat as friend-level
    return { allowed: false, reason: "i'd need a closer friend to vouch for you before i can run that." }
  }

  if (trustLevelSatisfied(requiredLevel, trustLevel)) {
    return { allowed: true }
  }
  return { allowed: false, reason: "i'd need a closer friend to vouch for you before i can run that." }
}

function checkGeneralCliTrust(command: string, _trustLevel: TrustLevel): GuardResult {
  const tokens = command.trim().split(/\s+/)
  const firstToken = tokens[0] || ""

  // git subcommands
  if (firstToken === "git") {
    const gitSub = tokens[1] || ""
    if (ACQUAINTANCE_GIT_ALLOWLIST.has(gitSub)) return { allowed: true }
    return { allowed: false, reason: "i'd need a closer friend to vouch for you before i can run that." }
  }

  // Simple command allowlist
  if (ACQUAINTANCE_SHELL_ALLOWLIST.has(firstToken)) return { allowed: true }

  // Everything else requires friend+
  return { allowed: false, reason: "i'd need a closer friend to vouch for you before i can run that." }
}

function checkShellTrustGuardrails(command: string, trustLevel: TrustLevel): GuardResult {
  // ouro CLI commands checked against manifest
  if (command.startsWith("ouro ") || command === "ouro") {
    return checkOuroCliTrust(command, trustLevel)
  }
  // General CLI commands checked against pattern rules
  return checkGeneralCliTrust(command, trustLevel)
}

function checkWriteTrustGuardrails(toolName: string, args: Record<string, string>, context: GuardContext): GuardResult {
  if (toolName !== "write_file" && toolName !== "edit_file") return { allowed: true }
  const filePath = args.path || ""
  // If agentRoot is set, allow writes inside the bundle dir
  if (context.agentRoot && filePath.startsWith(context.agentRoot)) return { allowed: true }
  // No agentRoot means no restriction (trusted context or CLI)
  if (!context.agentRoot) return { allowed: true }
  return { allowed: false, reason: "i'd need a closer friend to vouch for you before i can write files outside my home." }
}

function checkTrustLevelGuardrails(toolName: string, args: Record<string, string>, context: GuardContext): GuardResult {
  // Trusted levels (family/friend) — no trust guardrails. Undefined defaults to friend.
  if (isTrustedLevel(context.trustLevel)) return { allowed: true }

  // Shell commands
  if (toolName === "shell") {
    const command = args.command || ""
    return checkShellTrustGuardrails(command, context.trustLevel!)
  }

  // Write/edit file trust checks
  return checkWriteTrustGuardrails(toolName, args, context)
}

// --- main entry point ---

export function guardInvocation(
  toolName: string,
  args: Record<string, string>,
  context: GuardContext,
): GuardResult {
  emitNervesEvent({
    component: "tools",
    event: "tools.guard_check",
    message: "guardrail check",
    meta: { toolName },
  })

  // Read-only tools are always allowed (no structural or trust guardrails)
  if (READ_ONLY_TOOLS.has(toolName)) return { allowed: true }

  // Layer 1: structural guardrails (always on)
  const structuralResult = checkStructuralGuardrails(toolName, args, context)
  if (!structuralResult.allowed) return structuralResult

  // Layer 2: trust-level guardrails (varies by friend's trust)
  const trustResult = checkTrustLevelGuardrails(toolName, args, context)
  if (!trustResult.allowed) return trustResult

  return { allowed: true }
}
