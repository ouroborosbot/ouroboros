import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { provisionMailboxRegistry } from "../../mailroom/core"
import { FileMailroomStore, ingestRawMailToStore } from "../../mailroom/file-store"
import { resetIdentity, setAgentName } from "../../heart/identity"
import type { ToolContext } from "../../repertoire/tools-base"

const tempRoots: string[] = []
const originalHome = process.env.HOME

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-hosted-tools-"))
  tempRoots.push(dir)
  return dir
}

function trustedContext(): ToolContext {
  return {
    signin: async () => undefined,
    context: {
      friend: {
        id: "ari",
        name: "Ari",
        trustLevel: "family",
        externalIds: [],
        tenantMemberships: [],
        toolPreferences: {},
        notes: {},
        totalTokens: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        schemaVersion: 1,
      },
      channel: {
        channel: "cli",
        senseType: "local",
        availableIntegrations: [],
        supportsMarkdown: false,
        supportsStreaming: true,
        supportsRichCards: false,
        maxMessageLength: Infinity,
      },
    },
  }
}

function friendContext(): ToolContext {
  const ctx = trustedContext()
  ctx.context!.friend.trustLevel = "friend"
  return ctx
}

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  resetIdentity()
  vi.doUnmock("../../mailroom/reader")
  vi.resetModules()
  vi.restoreAllMocks()
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("hosted mail tools", () => {
  it("blocks mail_status in untrusted contexts before touching mailroom state", async () => {
    setAgentName("slugger")
    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, {
      signin: async () => undefined,
      context: {
        friend: {
          id: "guest",
          name: "Guest",
          trustLevel: "stranger",
          externalIds: [],
          tenantMemberships: [],
          toolPreferences: {},
          notes: {},
          totalTokens: 0,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          schemaVersion: 1,
        },
        channel: {
          channel: "cli",
          senseType: "local",
          availableIntegrations: [],
          supportsMarkdown: false,
          supportsStreaming: true,
          supportsRichCards: false,
          maxMessageLength: Infinity,
        },
      },
    })

    expect(status).toBe("mail is private; this tool is only available in trusted contexts.")
  })

  it("requires family trust for delegated mail status surfaces", async () => {
    setAgentName("slugger")
    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    await expect(statusTool!.handler({}, friendContext())).resolves.toBe("delegated human mail requires family trust.")
  })

  it("returns reader resolution errors for mail_status when Mailroom is not configured", async () => {
    setAgentName("slugger")
    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: false,
        error: "AUTH_REQUIRED:mailroom: Run `ouro connect mail --agent slugger`.",
      }),
      readMailroomRegistry: async () => {
        throw new Error("should not read registry")
      },
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toBe("AUTH_REQUIRED:mailroom: Run `ouro connect mail --agent slugger`.")
  })

  it("renders hosted lane truth and recent browser-downloaded archives in mail_status", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const agentRoot = path.join(homeRoot, "AgentBundles", "slugger.ouro")
    const sandboxDir = path.join(homeRoot, ".playwright-mcp")
    const archivePath = path.join(sandboxDir, "HEY-emails-ari-mendelow-me.mbox")
    fs.mkdirSync(sandboxDir, { recursive: true })
    fs.writeFileSync(archivePath, "From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n", "utf-8")
    const importedAt = new Date("2026-04-24T18:01:00.000Z")
    fs.utimesSync(archivePath, importedAt, importedAt)
    fs.mkdirSync(path.join(agentRoot, "state", "background-operations"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_status.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_status",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "succeeded",
      summary: "imported delegated mail archive",
      detail: "scanned 100; imported 20; duplicates 80",
      createdAt: "2026-04-24T18:00:00.000Z",
      updatedAt: "2026-04-24T18:02:00.000Z",
      finishedAt: "2026-04-24T18:02:00.000Z",
      spec: {
        filePath: archivePath,
        fileOriginLabel: "browser sandbox (.playwright-mcp)",
        ownerEmail: "ari@mendelow.me",
        source: "hey",
        fileModifiedAt: "2026-04-24T18:01:00.000Z",
      },
      result: {
        scanned: 100,
        imported: 20,
        duplicates: 80,
      },
    }, null, 2)}\n`, "utf-8")

    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    const store = new FileMailroomStore({ rootDir: tempDir() })
    const readMailroomRegistry = vi.fn(async () => registry)
    const writeMailroomRegistry = vi.fn(async () => undefined)

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry,
      writeMailroomRegistry,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain("mailbox: slugger@ouro.bot")
    expect(status).toContain("lane map:")
    expect(status).toContain("native: slugger@ouro.bot")
    expect(status).toContain("delegated: ari@mendelow.me / hey -> me.mendelow.ari.slugger@ouro.bot")
    expect(status).toContain("recent archives:")
    expect(status).toContain("[browser sandbox (.playwright-mcp)]")
    expect(status).toContain("status: imported via op_mail_import_status")
    expect(status).toContain("scanned 100; imported 20; duplicates 80")
    expect(readMailroomRegistry).toHaveBeenCalled()
  })

  it("renders imported archive status from summary-only operations and ignores records without archive paths", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const agentRoot = path.join(homeRoot, "AgentBundles", "slugger.ouro")
    const sandboxDir = path.join(homeRoot, ".playwright-mcp")
    const archivePath = path.join(sandboxDir, "HEY-emails-ari-mendelow-me-imported-summary-only.mbox")
    fs.mkdirSync(sandboxDir, { recursive: true })
    fs.writeFileSync(archivePath, "From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n", "utf-8")
    const importedAt = new Date("2026-04-24T18:01:00.000Z")
    fs.utimesSync(archivePath, importedAt, importedAt)
    fs.mkdirSync(path.join(agentRoot, "state", "background-operations"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_irrelevant_missing_path.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_irrelevant_missing_path",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "running",
      summary: "irrelevant tracked import",
      createdAt: "2026-04-24T18:00:30.000Z",
      updatedAt: "2026-04-24T18:02:30.000Z",
      spec: {
        ownerEmail: "ari@mendelow.me",
      },
    }, null, 2)}\n`, "utf-8")
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_summary_only_imported.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_summary_only_imported",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "succeeded",
      summary: "delegated mail archive already imported earlier",
      createdAt: "2026-04-24T18:00:00.000Z",
      updatedAt: "2026-04-24T18:02:00.000Z",
      finishedAt: "2026-04-24T18:02:00.000Z",
      spec: {
        filePath: archivePath,
        fileOriginLabel: "browser sandbox (.playwright-mcp)",
        fileModifiedAt: importedAt.toISOString(),
      },
      result: {
        scanned: 100,
        imported: 20,
        duplicates: 80,
      },
    }, null, 2)}\n`, "utf-8")

    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    const store = new FileMailroomStore({ rootDir: tempDir() })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain("status: imported via op_mail_import_summary_only_imported; delegated mail archive already imported earlier")
    expect(status).not.toContain("op_mail_import_irrelevant_missing_path;")
  })

  it("renders empty hosted mail status with setup guidance when no delegated grants or imports exist", async () => {
    const homeRoot = tempDir()
    const repoRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const { registry, keys } = provisionMailboxRegistry({ agentId: "slugger" })
    const store = new FileMailroomStore({ rootDir: tempDir() })

    vi.doMock("../../heart/identity", async () => {
      const actual = await vi.importActual<typeof import("../../heart/identity")>("../../heart/identity")
      return {
        ...actual,
        getRepoRoot: () => repoRoot,
      }
    })
    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain("- delegated: none configured yet")
    expect(status).toContain("- agent-runnable next step: run ouro account ensure --agent slugger --owner-email <human-email> --source hey.")
    expect(status).toContain("- none discovered in browser sandboxes or Downloads")
    expect(status).toContain("- none recorded yet")
  })

  it("surfaces a browser-downloaded archive as ready again when the file is newer than the last successful import", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const agentRoot = path.join(homeRoot, "AgentBundles", "slugger.ouro")
    const sandboxDir = path.join(homeRoot, ".playwright-mcp")
    const archivePath = path.join(sandboxDir, "HEY-emails-ari-mendelow-me.mbox")
    fs.mkdirSync(sandboxDir, { recursive: true })
    fs.writeFileSync(archivePath, "From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n", "utf-8")
    const importedAt = new Date("2026-04-24T18:01:00.000Z")
    const newerArchiveAt = new Date("2026-04-24T18:10:00.000Z")
    fs.utimesSync(archivePath, newerArchiveAt, newerArchiveAt)
    fs.mkdirSync(path.join(agentRoot, "state", "background-operations"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_status.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_status",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "succeeded",
      summary: "imported delegated mail archive",
      detail: "scanned 100; imported 20; duplicates 80",
      createdAt: "2026-04-24T18:00:00.000Z",
      updatedAt: "2026-04-24T18:02:00.000Z",
      finishedAt: "2026-04-24T18:02:00.000Z",
      spec: {
        filePath: archivePath,
        fileOriginLabel: "browser sandbox (.playwright-mcp)",
        ownerEmail: "ari@mendelow.me",
        source: "hey",
        fileModifiedAt: importedAt.toISOString(),
      },
      result: {
        scanned: 100,
        imported: 20,
        duplicates: 80,
      },
    }, null, 2)}\n`, "utf-8")

    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    const store = new FileMailroomStore({ rootDir: tempDir() })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain("status: ready (newer than last import via op_mail_import_status)")
    expect(status).toContain("scanned 100; imported 20; duplicates 80")
  })

  it("uses the operation summary when a newer successful archive import has no detail text", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const agentRoot = path.join(homeRoot, "AgentBundles", "slugger.ouro")
    const sandboxDir = path.join(homeRoot, ".playwright-mcp")
    const archivePath = path.join(sandboxDir, "HEY-emails-ari-mendelow-me-summary-only.mbox")
    fs.mkdirSync(sandboxDir, { recursive: true })
    fs.writeFileSync(archivePath, "From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n", "utf-8")
    const importedAt = new Date("2026-04-24T18:01:00.000Z")
    const newerArchiveAt = new Date("2026-04-24T18:12:00.000Z")
    fs.utimesSync(archivePath, newerArchiveAt, newerArchiveAt)
    fs.mkdirSync(path.join(agentRoot, "state", "background-operations"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_summary_only.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_summary_only",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "succeeded",
      summary: "delegated mail archive already imported earlier",
      createdAt: "2026-04-24T18:00:00.000Z",
      updatedAt: "2026-04-24T18:02:00.000Z",
      finishedAt: "2026-04-24T18:02:00.000Z",
      spec: {
        filePath: archivePath,
        fileOriginLabel: "browser sandbox (.playwright-mcp)",
        ownerEmail: "ari@mendelow.me",
        fileModifiedAt: importedAt.toISOString(),
      },
      result: {
        scanned: 100,
        imported: 20,
        duplicates: 80,
      },
    }, null, 2)}\n`, "utf-8")

    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    const store = new FileMailroomStore({ rootDir: tempDir() })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain("status: ready (newer than last import via op_mail_import_summary_only); owner/source: ari@mendelow.me / unknown; delegated mail archive already imported earlier")
  })

  it("renders source-only provenance when a newer successful archive import needs re-import attention", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const agentRoot = path.join(homeRoot, "AgentBundles", "slugger.ouro")
    const sandboxDir = path.join(homeRoot, ".playwright-mcp")
    const archivePath = path.join(sandboxDir, "HEY-emails-source-only-summary.mbox")
    fs.mkdirSync(sandboxDir, { recursive: true })
    fs.writeFileSync(archivePath, "From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n", "utf-8")
    const importedAt = new Date("2026-04-24T18:01:00.000Z")
    const newerArchiveAt = new Date("2026-04-24T18:20:00.000Z")
    fs.utimesSync(archivePath, newerArchiveAt, newerArchiveAt)
    fs.mkdirSync(path.join(agentRoot, "state", "background-operations"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_source_only_summary.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_source_only_summary",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "succeeded",
      summary: "delegated source archive was imported earlier",
      createdAt: "2026-04-24T18:00:00.000Z",
      updatedAt: "2026-04-24T18:02:00.000Z",
      finishedAt: "2026-04-24T18:02:00.000Z",
      spec: {
        filePath: archivePath,
        fileOriginLabel: "browser sandbox (.playwright-mcp)",
        source: "hey",
        fileModifiedAt: importedAt.toISOString(),
      },
      result: {
        scanned: 100,
        imported: 20,
        duplicates: 80,
      },
    }, null, 2)}\n`, "utf-8")

    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    const store = new FileMailroomStore({ rootDir: tempDir() })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain("status: ready (newer than last import via op_mail_import_source_only_summary); owner/source: unknown / hey; delegated source archive was imported earlier")
  })

  it("renders registry repair guidance and unknown failures in hosted mail status", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const agentRoot = path.join(homeRoot, "AgentBundles", "slugger.ouro")
    const sandboxDir = path.join(homeRoot, ".playwright-mcp")
    const archivePath = path.join(sandboxDir, "HEY-emails-ari-mendelow-me-unknown-failure.mbox")
    fs.mkdirSync(sandboxDir, { recursive: true })
    fs.writeFileSync(archivePath, "From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n", "utf-8")
    fs.mkdirSync(path.join(agentRoot, "state", "background-operations"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_unknown_failure.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_unknown_failure",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "failed",
      summary: "delegated import stalled",
      detail: "file: unresolved archive",
      createdAt: "2026-04-24T18:00:00.000Z",
      updatedAt: "2026-04-24T18:02:00.000Z",
      finishedAt: "2026-04-24T18:02:00.000Z",
      spec: {
        filePath: archivePath,
      },
    }, null, 2)}\n`, "utf-8")
    const { keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    const store = new FileMailroomStore({ rootDir: tempDir() })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => {
        throw new Error("registry offline")
      },
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain("- delegated: unreadable registry (registry offline)")
    expect(status).toContain("- agent-runnable repair: run ouro connect mail --agent slugger --owner-email <human-email> --source hey.")
    expect(status).toContain("status: failed via op_mail_import_unknown_failure; unknown failure")
    expect(status).toContain("- op_mail_import_unknown_failure [failed] :: file: unresolved archive")
  })

  it("surfaces non-Error registry read failures during sender-policy persistence", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    registry.sourceGrants[0].defaultPlacement = "screener"
    const store = new FileMailroomStore({ rootDir: tempDir() })
    await ingestRawMailToStore({
      registry,
      store,
      envelope: {
        mailFrom: "travel@example.com",
        rcptTo: ["me.mendelow.ari.slugger@ouro.bot"],
      },
      rawMime: Buffer.from([
        "From: Travel Desk <travel@example.com>",
        "To: Slugger <me.mendelow.ari.slugger@ouro.bot>",
        "Subject: Hosted delegated sender policy non-Error read failure",
        "",
        "delegated body",
      ].join("\r\n")),
    })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => {
        throw "registry unavailable as string"
      },
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const screener = await mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_screener")!
      .handler({ reason: "hosted delegated policy failure proof" }, trustedContext())
    const candidateId = /candidate_mail_[a-f0-9]+/.exec(String(screener))?.[0]
    expect(candidateId).toBeTruthy()

    const decision = await mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_decide")!
      .handler({
        candidate_id: candidateId!,
        action: "allow-sender",
        reason: "family trusts this delegated sender",
      }, trustedContext())

    expect(decision).toContain("sender policy: unavailable (mail registry unreadable: registry unavailable as string)")
  })

  it("renders recent import summaries with partial provenance and invalid timestamp fallback", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const agentRoot = path.join(homeRoot, "AgentBundles", "slugger.ouro")
    fs.mkdirSync(path.join(agentRoot, "state", "background-operations"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_source_only.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_source_only",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "running",
      summary: "waiting on source-only import",
      createdAt: "2026-04-24T18:00:00.000Z",
      updatedAt: "2026-04-24T18:05:00.000Z",
      spec: {
        source: "hey",
      },
    }, null, 2)}\n`, "utf-8")
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_owner_only_invalid_ts.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_owner_only_invalid_ts",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "queued",
      summary: "queued with stale metadata",
      createdAt: "2026-04-24T18:01:00.000Z",
      updatedAt: "not-a-date",
      spec: {
        ownerEmail: "ari@mendelow.me",
      },
    }, null, 2)}\n`, "utf-8")

    const { registry, keys } = provisionMailboxRegistry({ agentId: "slugger" })
    const store = new FileMailroomStore({ rootDir: tempDir() })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain("- op_mail_import_source_only [running] unknown / hey :: waiting on source-only import")
    expect(status).toContain("- op_mail_import_owner_only_invalid_ts [queued] ari@mendelow.me / unknown :: queued with stale metadata")
    expect(status.indexOf("op_mail_import_source_only [running]")).toBeLessThan(status.indexOf("op_mail_import_owner_only_invalid_ts [queued]"))
  })

  it("renders failed and in-flight archive truth and sorts recent imports by freshness", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const agentRoot = path.join(homeRoot, "AgentBundles", "slugger.ouro")
    const sandboxDir = path.join(homeRoot, ".playwright-mcp")
    const failedArchivePath = path.join(sandboxDir, "HEY-emails-ari-mendelow-me-failed.mbox")
    const runningArchivePath = path.join(sandboxDir, "HEY-emails-ari-mendelow-me-running.mbox")
    fs.mkdirSync(sandboxDir, { recursive: true })
    fs.writeFileSync(failedArchivePath, "From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n", "utf-8")
    fs.writeFileSync(runningArchivePath, "From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n", "utf-8")
    fs.mkdirSync(path.join(agentRoot, "state", "background-operations"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_failed.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_failed",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "failed",
      summary: "delegated mail import failed",
      detail: "file: failed archive",
      createdAt: "2026-04-24T18:00:00.000Z",
      updatedAt: "2026-04-24T18:03:00.000Z",
      finishedAt: "2026-04-24T18:03:00.000Z",
      spec: {
        filePath: failedArchivePath,
        fileOriginLabel: "browser sandbox (.playwright-mcp)",
        ownerEmail: "ari@mendelow.me",
        source: "hey",
        fileModifiedAt: "2026-04-24T18:01:00.000Z",
      },
      failure: {
        class: "archive-access",
        retryDisposition: "fix-before-retry",
        hint: "the archive or backing store could not be read with current filesystem permissions",
      },
    }, null, 2)}\n`, "utf-8")
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_running.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_running",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "running",
      summary: "importing delegated mail",
      detail: "scanned 42 messages",
      createdAt: "2026-04-24T18:04:00.000Z",
      updatedAt: "2026-04-24T18:05:00.000Z",
      startedAt: "2026-04-24T18:04:10.000Z",
      spec: {
        filePath: runningArchivePath,
        fileOriginLabel: "browser sandbox (.playwright-mcp)",
        ownerEmail: "ari@mendelow.me",
        source: "hey",
        fileModifiedAt: "2026-04-24T18:04:00.000Z",
      },
    }, null, 2)}\n`, "utf-8")

    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    const store = new FileMailroomStore({ rootDir: tempDir() })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain(`status: failed via op_mail_import_failed; owner/source: ari@mendelow.me / hey; archive-access`)
    expect(status).toContain(`status: running via op_mail_import_running; owner/source: ari@mendelow.me / hey; importing delegated mail`)
    expect(status.indexOf("op_mail_import_running [running]")).toBeLessThan(status.indexOf("op_mail_import_failed [failed]"))
  })

  it("treats timestamp-less successful imports as ready for re-import inspection", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const agentRoot = path.join(homeRoot, "AgentBundles", "slugger.ouro")
    const sandboxDir = path.join(homeRoot, ".playwright-mcp")
    const archivePath = path.join(sandboxDir, "HEY-emails-ari-mendelow-me-unknown-timestamp.mbox")
    fs.mkdirSync(sandboxDir, { recursive: true })
    fs.writeFileSync(archivePath, "From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n", "utf-8")
    fs.mkdirSync(path.join(agentRoot, "state", "background-operations"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "state", "background-operations", "op_mail_import_unknown_timestamp.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "op_mail_import_unknown_timestamp",
      agentName: "slugger",
      kind: "mail.import-mbox",
      title: "mail import",
      status: "succeeded",
      summary: "imported delegated mail archive",
      detail: "scanned 42; imported 10; duplicates 32",
      createdAt: "2026-04-24T18:00:00.000Z",
      updatedAt: "not-a-date",
      finishedAt: "still-not-a-date",
      spec: {
        filePath: archivePath,
        fileOriginLabel: "browser sandbox (.playwright-mcp)",
        ownerEmail: "ari@mendelow.me",
        source: "hey",
      },
      result: {
        scanned: 42,
        imported: 10,
        duplicates: 32,
      },
    }, null, 2)}\n`, "utf-8")

    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    const store = new FileMailroomStore({ rootDir: tempDir() })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => undefined,
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const statusTool = mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_status")
    expect(statusTool).toBeTruthy()

    const status = await statusTool!.handler({}, trustedContext())
    expect(status).toContain("status: ready (newer than last import via op_mail_import_unknown_timestamp)")
    expect(status).toContain("scanned 42; imported 10; duplicates 32")
  })

  it("persists sender policy through hosted registry coordinates during Screener decisions", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    registry.sourceGrants[0].defaultPlacement = "screener"
    const store = new FileMailroomStore({ rootDir: tempDir() })
    await ingestRawMailToStore({
      registry,
      store,
      envelope: {
        mailFrom: "travel@example.com",
        rcptTo: ["me.mendelow.ari.slugger@ouro.bot"],
      },
      rawMime: Buffer.from([
        "From: Travel Desk <travel@example.com>",
        "To: Slugger <me.mendelow.ari.slugger@ouro.bot>",
        "Subject: Hosted delegated sender policy",
        "",
        "delegated body",
      ].join("\r\n")),
    })
    const writtenRegistries: unknown[] = []

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async (_config: unknown, nextRegistry: unknown) => {
        writtenRegistries.push(nextRegistry)
      },
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const screener = await mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_screener")!
      .handler({ reason: "hosted delegated policy proof" }, trustedContext())
    const candidateId = /candidate_mail_[a-f0-9]+/.exec(String(screener))?.[0]
    expect(candidateId).toBeTruthy()

    const decision = await mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_decide")!
      .handler({
        candidate_id: candidateId!,
        action: "allow-sender",
        reason: "family trusts this delegated sender",
      }, trustedContext())

    expect(decision).toContain("sender policy: allow email travel@example.com")
    expect(decision).not.toContain("registryPath missing")
    expect(writtenRegistries).toHaveLength(1)
    expect(JSON.stringify(writtenRegistries[0])).toContain("travel@example.com")
  })

  it("surfaces hosted registry write failures without pretending the sender policy persisted", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    registry.sourceGrants[0].defaultPlacement = "screener"
    const store = new FileMailroomStore({ rootDir: tempDir() })
    await ingestRawMailToStore({
      registry,
      store,
      envelope: {
        mailFrom: "travel@example.com",
        rcptTo: ["me.mendelow.ari.slugger@ouro.bot"],
      },
      rawMime: Buffer.from([
        "From: Travel Desk <travel@example.com>",
        "To: Slugger <me.mendelow.ari.slugger@ouro.bot>",
        "Subject: Hosted delegated sender policy write failure",
        "",
        "delegated body",
      ].join("\r\n")),
    })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => {
        throw new Error("write denied")
      },
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const screener = await mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_screener")!
      .handler({ reason: "hosted delegated policy failure proof" }, trustedContext())
    const candidateId = /candidate_mail_[a-f0-9]+/.exec(String(screener))?.[0]
    expect(candidateId).toBeTruthy()

    const decision = await mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_decide")!
      .handler({
        candidate_id: candidateId!,
        action: "allow-sender",
        reason: "family trusts this delegated sender",
      }, trustedContext())

    expect(decision).toContain("sender policy: unavailable (mail registry write failed: write denied)")
    expect(decision).not.toContain("sender policy: allow email travel@example.com")
  })

  it("surfaces non-Error hosted registry write failures verbatim", async () => {
    const homeRoot = tempDir()
    process.env.HOME = homeRoot
    setAgentName("slugger")
    const { registry, keys } = provisionMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "ari@mendelow.me",
      source: "hey",
    })
    registry.sourceGrants[0].defaultPlacement = "screener"
    const store = new FileMailroomStore({ rootDir: tempDir() })
    await ingestRawMailToStore({
      registry,
      store,
      envelope: {
        mailFrom: "travel@example.com",
        rcptTo: ["me.mendelow.ari.slugger@ouro.bot"],
      },
      rawMime: Buffer.from([
        "From: Travel Desk <travel@example.com>",
        "To: Slugger <me.mendelow.ari.slugger@ouro.bot>",
        "Subject: Hosted delegated sender policy non-Error write failure",
        "",
        "delegated body",
      ].join("\r\n")),
    })

    vi.doMock("../../mailroom/reader", () => ({
      resolveMailroomReader: () => ({
        ok: true,
        agentName: "slugger",
        config: {
          mailboxAddress: "slugger@ouro.bot",
          azureAccountUrl: "https://mail.blob.core.windows.net",
          azureContainer: "mailroom",
          registryAzureAccountUrl: "https://registry.blob.core.windows.net",
          registryContainer: "mailroom",
          registryBlob: "registry/mailroom.json",
          privateKeys: keys,
        },
        store,
        storeKind: "file",
        storeLabel: "/tmp/mailroom",
      }),
      readMailroomRegistry: async () => registry,
      writeMailroomRegistry: async () => {
        throw "write denied as string"
      },
    }))

    const { mailToolDefinitions } = await import("../../repertoire/tools-mail")
    const screener = await mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_screener")!
      .handler({ reason: "hosted delegated policy failure proof" }, trustedContext())
    const candidateId = /candidate_mail_[a-f0-9]+/.exec(String(screener))?.[0]
    expect(candidateId).toBeTruthy()

    const decision = await mailToolDefinitions.find((definition) => definition.tool.function.name === "mail_decide")!
      .handler({
        candidate_id: candidateId!,
        action: "allow-sender",
        reason: "family trusts this delegated sender",
      }, trustedContext())

    expect(decision).toContain("sender policy: unavailable (mail registry write failed: write denied as string)")
  })
})
