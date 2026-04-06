/**
 * Bitwarden CLI credential store — wraps `bw` CLI for the agent's own vault.
 *
 * Unlike AacCredentialStore (which accesses someone else's vault via approval),
 * this store authenticates directly as the agent using its own master password.
 * The agent owns the vault, so no human-in-the-loop is needed.
 *
 * Requires the `bw` CLI to be installed. Session tokens are cached in-memory.
 */

import { execFile as execFileCb } from "node:child_process"
import type { CredentialMeta, CredentialStore } from "./credential-access"
import { emitNervesEvent } from "../nerves/runtime"

// ---------------------------------------------------------------------------
// bw CLI wrapper
// ---------------------------------------------------------------------------

function execBw(args: string[], sessionToken?: string): Promise<string> {
  const env = sessionToken
    ? { ...process.env, BW_SESSION: sessionToken }
    : process.env

  return new Promise((resolve, reject) => {
    execFileCb("bw", args, { timeout: 30_000, env }, (err, stdout) => {
      if (err) {
        reject(new Error(`bw CLI error: ${err.message}`))
        return
      }
      resolve(stdout)
    })
  })
}

// ---------------------------------------------------------------------------
// Bitwarden vault item types (subset of bw CLI output)
// ---------------------------------------------------------------------------

interface BwLoginItem {
  id: string
  name: string
  login?: {
    username?: string
    password?: string
    uris?: Array<{ uri: string }>
  }
  notes?: string | null
  revisionDate?: string
}

// ---------------------------------------------------------------------------
// BitwardenCredentialStore
// ---------------------------------------------------------------------------

export class BitwardenCredentialStore implements CredentialStore {
  private readonly serverUrl: string
  private readonly email: string
  private readonly masterPassword: string
  private sessionToken: string | null = null

  constructor(serverUrl: string, email: string, masterPassword: string) {
    this.serverUrl = serverUrl
    this.email = email
    this.masterPassword = masterPassword
  }

  isReady(): boolean {
    return true
  }

  /**
   * Configure the bw CLI to point at the vault server, then log in.
   * Caches the session token for subsequent operations.
   */
  async login(): Promise<void> {
    // Configure server URL
    await execBw(["config", "server", this.serverUrl])

    // Log in and extract session token
    const loginOutput = await execBw(["login", this.email, this.masterPassword, "--raw"])

    // bw login --raw returns just the session token string
    // But with --output json it returns { access_token: "..." }
    // Try JSON parse first, fall back to raw string
    try {
      const parsed = JSON.parse(loginOutput)
      this.sessionToken = parsed.access_token ?? loginOutput.trim()
    } catch {
      this.sessionToken = loginOutput.trim()
    }
  }

  private async ensureSession(): Promise<string | undefined> {
    return this.sessionToken ?? undefined
  }

  async get(domain: string): Promise<CredentialMeta | null> {
    emitNervesEvent({
      event: "repertoire.bw_credential_get_start",
      component: "repertoire",
      message: `getting credential via bw for ${domain}`,
      meta: { domain, backend: "bitwarden" },
    })

    const session = await this.ensureSession()
    const item = await this.findItemByDomain(domain, session)

    if (!item) {
      emitNervesEvent({
        event: "repertoire.bw_credential_get_end",
        component: "repertoire",
        message: `no bw credential for ${domain}`,
        meta: { domain, found: false, backend: "bitwarden" },
      })
      return null
    }

    emitNervesEvent({
      event: "repertoire.bw_credential_get_end",
      component: "repertoire",
      message: `bw credential found for ${domain}`,
      meta: { domain, found: true, backend: "bitwarden" },
    })

    return {
      domain: item.name,
      username: item.login?.username,
      notes: item.notes ?? undefined,
      createdAt: item.revisionDate ?? new Date().toISOString(),
    }
  }

  async getRawSecret(domain: string, field: string): Promise<string> {
    const session = await this.ensureSession()
    const item = await this.findItemByDomain(domain, session)

    if (!item) {
      throw new Error(`no credential found for domain "${domain}"`)
    }

    // Map common field names to bw item structure
    let value: string | undefined | null
    if (field === "password") {
      value = item.login?.password
    } else if (field === "username") {
      value = item.login?.username
    } else {
      value = (item as unknown as Record<string, unknown>)[field] as string | undefined
    }

    if (value === undefined || value === null) {
      throw new Error(`field "${field}" not found for domain "${domain}"`)
    }

    return String(value)
  }

  async store(
    domain: string,
    data: { username?: string; password: string; notes?: string },
  ): Promise<void> {
    emitNervesEvent({
      event: "repertoire.bw_credential_store_start",
      component: "repertoire",
      message: `storing credential via bw for ${domain}`,
      meta: { domain, backend: "bitwarden" },
    })

    const session = await this.ensureSession()

    // Create a new login item
    const item = {
      type: 1, // Login type
      name: domain,
      login: {
        username: data.username ?? "",
        password: data.password,
        uris: [{ match: null, uri: `https://${domain}` }],
      },
      notes: data.notes ?? null,
    }

    const encoded = Buffer.from(JSON.stringify(item)).toString("base64")
    await execBw(["create", "item", encoded], session)

    emitNervesEvent({
      event: "repertoire.bw_credential_store_end",
      component: "repertoire",
      message: `credential stored via bw for ${domain}`,
      meta: { domain, backend: "bitwarden" },
    })
  }

  async list(): Promise<CredentialMeta[]> {
    emitNervesEvent({
      event: "repertoire.bw_credential_list_start",
      component: "repertoire",
      message: "listing bw credentials",
      meta: { backend: "bitwarden" },
    })

    const session = await this.ensureSession()

    try {
      const stdout = await execBw(["list", "items"], session)
      const items: BwLoginItem[] = JSON.parse(stdout)

      const results: CredentialMeta[] = items.map((item) => ({
        domain: item.name,
        username: item.login?.username,
        notes: item.notes ?? undefined,
        createdAt: item.revisionDate ?? new Date().toISOString(),
      }))

      emitNervesEvent({
        event: "repertoire.bw_credential_list_end",
        component: "repertoire",
        message: "bw credentials listed",
        meta: { backend: "bitwarden", count: results.length },
      })

      return results
    } catch {
      emitNervesEvent({
        event: "repertoire.bw_credential_list_end",
        component: "repertoire",
        message: "bw credential list failed",
        meta: { backend: "bitwarden", count: 0 },
      })
      return []
    }
  }

  async delete(domain: string): Promise<boolean> {
    emitNervesEvent({
      event: "repertoire.bw_credential_delete_start",
      component: "repertoire",
      message: `deleting credential via bw for ${domain}`,
      meta: { domain, backend: "bitwarden" },
    })

    const session = await this.ensureSession()
    const item = await this.findItemByDomain(domain, session)

    if (!item) {
      emitNervesEvent({
        event: "repertoire.bw_credential_delete_end",
        component: "repertoire",
        message: `no bw credential to delete for ${domain}`,
        meta: { domain, deleted: false, backend: "bitwarden" },
      })
      return false
    }

    await execBw(["delete", "item", item.id], session)

    emitNervesEvent({
      event: "repertoire.bw_credential_delete_end",
      component: "repertoire",
      message: `credential deleted via bw for ${domain}`,
      meta: { domain, deleted: true, backend: "bitwarden" },
    })

    return true
  }

  // --- Private ---

  private async findItemByDomain(domain: string, session?: string): Promise<BwLoginItem | null> {
    try {
      const stdout = await execBw(["list", "items", "--search", domain], session)
      const items: BwLoginItem[] = JSON.parse(stdout)

      // Find exact match by name
      return items.find((item) => item.name === domain) ?? items[0] ?? null
    } catch {
      return null
    }
  }
}
