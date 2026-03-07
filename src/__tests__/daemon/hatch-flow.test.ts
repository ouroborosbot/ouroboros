import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { afterEach, describe, expect, it } from "vitest"

import { runHatchFlow } from "../../daemon/hatch-flow"

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
}

describe("hatch flow", () => {
  const cleanup: string[] = []

  afterEach(() => {
    while (cleanup.length > 0) {
      const entry = cleanup.pop()
      if (!entry) continue
      fs.rmSync(entry, { recursive: true, force: true })
    }
  })

  it("creates a canonical hatchling bundle with family imprint and heartbeat habit", async () => {
    const bundlesRoot = makeTempDir("hatch-bundles")
    const secretsRoot = makeTempDir("hatch-secrets")
    const specialistSource = makeTempDir("hatch-specialist")
    const specialistTarget = makeTempDir("hatch-specialist-target")
    cleanup.push(bundlesRoot, secretsRoot, specialistSource, specialistTarget)

    fs.writeFileSync(path.join(specialistSource, "medusa.md"), "# Medusa\n", "utf-8")
    fs.writeFileSync(path.join(specialistSource, "python.md"), "# Python\n", "utf-8")

    const result = await runHatchFlow(
      {
        agentName: "Hatchling",
        humanName: "Ari",
        provider: "anthropic",
        credentials: {
          setupToken: `sk-ant-oat01-${"a".repeat(80)}`,
        },
      },
      {
        bundlesRoot,
        secretsRoot,
        specialistIdentitySourceDir: specialistSource,
        specialistIdentityTargetDir: specialistTarget,
        random: () => 0.99,
      },
    )

    expect(result.bundleRoot).toBe(path.join(bundlesRoot, "Hatchling.ouro"))
    expect(result.selectedIdentity).toBe("python.md")

    const agentConfig = JSON.parse(
      fs.readFileSync(path.join(result.bundleRoot, "agent.json"), "utf-8"),
    ) as Record<string, unknown>
    expect(agentConfig.enabled).toBe(true)
    expect(agentConfig.provider).toBe("anthropic")
    expect(agentConfig.version).toBe(1)

    const friendDir = path.join(result.bundleRoot, "friends")
    const friendFiles = fs.readdirSync(friendDir).filter((name) => name.endsWith(".json"))
    expect(friendFiles.length).toBe(1)
    const friend = JSON.parse(fs.readFileSync(path.join(friendDir, friendFiles[0]), "utf-8")) as {
      name: string
      trustLevel: string
    }
    expect(friend.name).toBe("Ari")
    expect(friend.trustLevel).toBe("family")

    const habitsDir = path.join(result.bundleRoot, "tasks", "habits")
    const heartbeatFiles = fs.readdirSync(habitsDir).filter((name) => name.includes("heartbeat"))
    expect(heartbeatFiles.length).toBe(1)
    const heartbeat = fs.readFileSync(path.join(habitsDir, heartbeatFiles[0]), "utf-8")
    expect(heartbeat).toContain("cadence: \"30m\"")
    expect(heartbeat).toContain("status: processing")
  })

  it("fails fast when required provider credentials are missing", async () => {
    const bundlesRoot = makeTempDir("hatch-bundles-missing")
    const secretsRoot = makeTempDir("hatch-secrets-missing")
    const specialistSource = makeTempDir("hatch-specialist-missing")
    const specialistTarget = makeTempDir("hatch-specialist-target-missing")
    cleanup.push(bundlesRoot, secretsRoot, specialistSource, specialistTarget)
    fs.writeFileSync(path.join(specialistSource, "medusa.md"), "# Medusa\n", "utf-8")

    await expect(() =>
      runHatchFlow(
        {
          agentName: "NoKey",
          humanName: "Ari",
          provider: "minimax",
          credentials: {},
        },
        {
          bundlesRoot,
          secretsRoot,
          specialistIdentitySourceDir: specialistSource,
          specialistIdentityTargetDir: specialistTarget,
          random: () => 0,
        },
      ),
    ).rejects.toThrow("Missing required credentials for minimax")
  })

  it("writes provider-specific secrets for azure hatch flows", async () => {
    const bundlesRoot = makeTempDir("hatch-bundles-azure")
    const secretsRoot = makeTempDir("hatch-secrets-azure")
    const specialistSource = makeTempDir("hatch-specialist-azure")
    const specialistTarget = makeTempDir("hatch-specialist-target-azure")
    cleanup.push(bundlesRoot, secretsRoot, specialistSource, specialistTarget)
    fs.writeFileSync(path.join(specialistSource, "medusa.md"), "# Medusa\n", "utf-8")

    const result = await runHatchFlow(
      {
        agentName: "AzureBot",
        humanName: "Ari",
        provider: "azure",
        credentials: {
          apiKey: "azure-key",
          endpoint: "https://example.openai.azure.com",
          deployment: "gpt-4o-mini",
        },
      },
      {
        bundlesRoot,
        secretsRoot,
        specialistIdentitySourceDir: specialistSource,
        specialistIdentityTargetDir: specialistTarget,
        random: () => 0,
      },
    )

    const secretsPath = path.join(secretsRoot, "AzureBot", "secrets.json")
    const secrets = JSON.parse(fs.readFileSync(secretsPath, "utf-8")) as {
      providers: {
        azure: { apiKey: string; endpoint: string; deployment: string }
      }
    }
    expect(secrets.providers.azure.apiKey).toBe("azure-key")
    expect(secrets.providers.azure.endpoint).toBe("https://example.openai.azure.com")
    expect(secrets.providers.azure.deployment).toBe("gpt-4o-mini")

    expect(fs.existsSync(path.join(result.bundleRoot, "psyche", "IDENTITY.md"))).toBe(true)
  })
})
