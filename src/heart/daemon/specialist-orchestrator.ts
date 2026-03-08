import * as fs from "fs"
import * as path from "path"
import { emitNervesEvent } from "../../nerves/runtime"
import { setAgentName, setAgentConfigOverride, DEFAULT_AGENT_PHRASES, type AgentProvider, type AgentConfig } from "../identity"
import { resetConfigCache } from "../config"
import { resetProviderRuntime, createProviderRegistry, type ChannelCallbacks } from "../core"
import { writeSecretsFile, type HatchCredentialsInput } from "./hatch-flow"
import { buildSpecialistSystemPrompt } from "./specialist-prompt"
import { getSpecialistTools, execSpecialistTool } from "./specialist-tools"
import { runSpecialistSession, type SpecialistReadline } from "./specialist-session"

export interface SpecialistReadlineWithController extends SpecialistReadline {
  inputController?: { suppress: (onInterrupt?: () => void) => void; restore: () => void }
}

export interface AdoptionSpecialistDeps {
  bundleSourceDir: string
  bundlesRoot: string
  secretsRoot: string
  provider: AgentProvider
  credentials: HatchCredentialsInput
  humanName: string
  random?: () => number
  createReadline: () => SpecialistReadlineWithController
  callbacks: ChannelCallbacks & { flushMarkdown?: () => void }
  signal?: AbortSignal
}

function listExistingBundles(bundlesRoot: string): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(bundlesRoot, { withFileTypes: true })
  } catch {
    return []
  }

  const discovered: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".ouro")) continue
    const agentName = entry.name.slice(0, -5)
    discovered.push(agentName)
  }
  return discovered.sort((a, b) => a.localeCompare(b))
}

function loadIdentityPhrases(
  bundleSourceDir: string,
  identityFileName: string,
): AgentConfig["phrases"] {
  const agentJsonPath = path.join(bundleSourceDir, "agent.json")
  try {
    const raw = fs.readFileSync(agentJsonPath, "utf-8")
    const parsed = JSON.parse(raw) as {
      phrases?: AgentConfig["phrases"]
      identityPhrases?: Record<string, AgentConfig["phrases"]>
    }
    const identityKey = identityFileName.replace(/\.md$/, "")
    const identity = parsed.identityPhrases?.[identityKey]
    if (identity?.thinking?.length && identity?.tool?.length && identity?.followup?.length) {
      return identity
    }
    if (parsed.phrases?.thinking?.length && parsed.phrases?.tool?.length && parsed.phrases?.followup?.length) {
      return parsed.phrases
    }
  } catch {
    // agent.json missing or malformed — fall through
  }
  return { ...DEFAULT_AGENT_PHRASES }
}

function pickRandomIdentity(identitiesDir: string, random: () => number): { fileName: string; content: string } {
  const files = fs.readdirSync(identitiesDir).filter((f) => f.endsWith(".md"))
  if (files.length === 0) {
    return { fileName: "default", content: "I am the adoption specialist." }
  }
  const idx = Math.floor(random() * files.length)
  const fileName = files[idx]
  const content = fs.readFileSync(path.join(identitiesDir, fileName), "utf-8")
  return { fileName, content }
}

/**
 * Run the full adoption specialist flow:
 * 1. Pick a random identity from the bundled AdoptionSpecialist.ouro
 * 2. Read SOUL.md
 * 3. List existing bundles
 * 4. Build system prompt
 * 5. Set up provider (setAgentName, setAgentConfigOverride, writeSecretsFile, reset caches)
 * 6. Run the specialist session
 * 7. Clean up identity/config overrides
 * 8. Return hatchling name
 */
export async function runAdoptionSpecialist(
  deps: AdoptionSpecialistDeps,
): Promise<string | null> {
  const { bundleSourceDir, bundlesRoot, secretsRoot, provider, credentials, humanName, callbacks, signal } = deps
  const random = deps.random ?? Math.random

  emitNervesEvent({
    component: "daemon",
    event: "daemon.specialist_orchestrator_start",
    message: "starting adoption specialist orchestrator",
    meta: { provider, bundleSourceDir },
  })

  // 1. Read SOUL.md
  const soulPath = path.join(bundleSourceDir, "psyche", "SOUL.md")
  let soulText = ""
  try {
    soulText = fs.readFileSync(soulPath, "utf-8")
  } catch {
    // No SOUL.md -- proceed without it
  }

  // 2. Pick random identity
  const identitiesDir = path.join(bundleSourceDir, "psyche", "identities")
  const identity = pickRandomIdentity(identitiesDir, random)

  emitNervesEvent({
    component: "daemon",
    event: "daemon.specialist_identity_picked",
    message: "picked specialist identity",
    meta: { identity: identity.fileName },
  })

  // 3. List existing bundles
  const existingBundles = listExistingBundles(bundlesRoot)

  // 4. Build system prompt
  const systemPrompt = buildSpecialistSystemPrompt(soulText, identity.content, existingBundles)

  // 5. Set up provider with identity-specific phrases
  const phrases = loadIdentityPhrases(bundleSourceDir, identity.fileName)
  setAgentName("AdoptionSpecialist")
  setAgentConfigOverride({
    version: 1,
    enabled: true,
    provider,
    phrases,
  })
  writeSecretsFile("AdoptionSpecialist", provider, credentials, secretsRoot)
  resetConfigCache()
  resetProviderRuntime()

  try {
    // Create provider runtime
    const providerRuntime = createProviderRegistry().resolve()
    if (!providerRuntime) {
      throw new Error("Failed to create provider runtime for adoption specialist")
    }

    // 6. Run session
    const tools = getSpecialistTools()
    const readline = deps.createReadline()
    const ctrl = readline.inputController

    const result = await runSpecialistSession({
      providerRuntime,
      systemPrompt,
      tools,
      execTool: (name, args) =>
        execSpecialistTool(name, args, {
          humanName,
          provider,
          credentials,
          bundlesRoot,
          secretsRoot,
          specialistIdentitiesDir: identitiesDir,
        }),
      readline,
      callbacks,
      signal,
      kickoffMessage: "hi, i just ran ouro for the first time",
      suppressInput: ctrl ? (onInterrupt) => ctrl.suppress(onInterrupt) : undefined,
      restoreInput: ctrl ? () => ctrl.restore() : undefined,
      flushMarkdown: callbacks.flushMarkdown,
      writePrompt: ctrl ? () => process.stdout.write("\x1b[36m> \x1b[0m") : undefined,
    })

    return result.hatchedAgentName
  } finally {
    // 7. Cleanup: restore identity/config state
    setAgentConfigOverride(null)
    resetConfigCache()
    resetProviderRuntime()
  }
}
