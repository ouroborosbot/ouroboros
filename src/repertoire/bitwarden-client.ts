/**
 * Bitwarden vault client for credential management.
 *
 * Three access modes, tried in order:
 *   1. `aac` — Bitwarden Agent Access CLI (no master password, session-cached)
 *   2. `sdk` — @bitwarden/sdk-napi dynamic import
 *   3. `bw`  — traditional `bw` CLI with --session flag
 *
 * Raw secrets are NEVER returned to callers except via getRawSecret(),
 * which is reserved for internal use by the credential gateway (apiRequest vaultKey).
 */

import { execFile as execFileCb } from "child_process"
import { emitNervesEvent } from "../nerves/runtime"

export interface VaultItem {
  id: string
  name: string
  type: number // 1=login, 2=secure-note, 3=card, 4=identity
  notes?: string
  fields?: Array<{ name: string; value: string }>
  login?: { username?: string; uris?: Array<{ uri: string }> }
  // Raw password intentionally excluded -- credential gateway handles injection
}

export interface VaultItemHandle {
  id: string
  name: string
  type: number
}

/** Credential returned by the `aac` CLI. */
export interface AacCredential {
  username?: string
  password?: string
  totp?: string
  uri?: string
  notes?: string
}

export interface VaultConfig {
  serverUrl?: string // Self-hosted Vaultwarden URL, or omit for cloud
  accessToken: string // SDK service account token or session key for CLI
  mode?: "sdk" | "cli" // Auto-detected if omitted: try SDK first, fall back to CLI
}

/** Config for aac-only or auto-detect connect. */
export interface AacVaultConfig {
  mode?: "aac" | "bw" // Auto-detected if omitted: try aac first, fall back to bw
  accessToken?: string // Required for bw mode, ignored for aac
}

interface RawVaultItem {
  id: string
  name: string
  type: number
  notes?: string
  fields?: Array<{ name: string; value: string }>
  login?: {
    username?: string
    password?: string
    uris?: Array<{ uri: string }>
  }
}

export class BitwardenClient {
  private sessionKey: string | null = null
  private connected = false
  private clientMode: "sdk" | "cli" | "aac" | null = null

  getMode(): "sdk" | "cli" | "aac" | null {
    return this.clientMode
  }

  async connect(config: VaultConfig): Promise<void> {
    emitNervesEvent({
      event: "client.vault_connect_start",
      component: "clients",
      message: "connecting to Bitwarden vault",
      meta: { mode: config.mode ?? "auto" },
    })

    try {
      if (config.mode === "cli") {
        await this.connectCli(config)
      } else {
        // Try SDK first, fall back to CLI
        try {
          await this.connectSdk(config)
        } catch {
          emitNervesEvent({
            event: "client.vault_sdk_fallback",
            component: "clients",
            message: "SDK not available, falling back to bw CLI",
            meta: {},
          })
          await this.connectCli(config)
        }
      }

      emitNervesEvent({
        event: "client.vault_connect_end",
        component: "clients",
        message: "connected to Bitwarden vault",
        meta: { mode: this.clientMode },
      })
    } catch (err) {
      emitNervesEvent({
        level: "error",
        event: "client.vault_connect_error",
        component: "clients",
        message: "failed to connect to Bitwarden vault",
        /* v8 ignore next -- defensive: execCli always wraps in Error @preserve */
        meta: { reason: err instanceof Error ? err.message : String(err) },
      })
      throw err
    }
  }

  /**
   * Connect with aac-first auto-detection. Tries `aac connections list` first;
   * if aac is available and has cached sessions, uses aac mode. Otherwise falls
   * back to `bw` CLI mode (requires accessToken).
   */
  async connectAuto(config: AacVaultConfig = {}): Promise<void> {
    emitNervesEvent({
      event: "client.vault_connect_start",
      component: "clients",
      message: "connecting to Bitwarden vault (aac auto-detect)",
      meta: { mode: config.mode ?? "auto" },
    })

    try {
      if (config.mode === "bw") {
        if (!config.accessToken) {
          throw new Error("accessToken is required for bw mode")
        }
        await this.connectCli({ accessToken: config.accessToken })
      } else if (config.mode === "aac") {
        await this.connectAac()
      } else {
        // Auto-detect: try aac first, fall back to bw
        try {
          await this.connectAac()
        } catch {
          emitNervesEvent({
            event: "client.vault_aac_fallback",
            component: "clients",
            message: "aac not available, falling back to bw CLI",
            meta: {},
          })
          if (!config.accessToken) {
            throw new Error("aac not available and no accessToken provided for bw fallback")
          }
          await this.connectCli({ accessToken: config.accessToken })
        }
      }

      emitNervesEvent({
        event: "client.vault_connect_end",
        component: "clients",
        message: "connected to Bitwarden vault",
        meta: { mode: this.clientMode },
      })
    } catch (err) {
      emitNervesEvent({
        level: "error",
        event: "client.vault_connect_error",
        component: "clients",
        message: "failed to connect to Bitwarden vault",
        /* v8 ignore next -- defensive: callers always throw Error instances @preserve */
        meta: { reason: err instanceof Error ? err.message : String(err) },
      })
      throw err
    }
  }

  async disconnect(): Promise<void> {
    this.sessionKey = null
    this.connected = false
    this.clientMode = null

    emitNervesEvent({
      event: "client.vault_disconnect",
      component: "clients",
      message: "disconnected from Bitwarden vault",
      meta: {},
    })
  }

  isConnected(): boolean {
    return this.connected
  }

  async getItem(id: string): Promise<VaultItem> {
    this.requireConnected()
    return this.withNervesEvents("getItem", { id }, async () => {
      const raw = await this.fetchRawItem(id)
      return this.stripSecrets(raw)
    })
  }

  /**
   * Retrieve a credential by domain via aac CLI.
   * Only available in aac mode.
   */
  async getCredentialByDomain(domain: string): Promise<AacCredential> {
    this.requireConnected()
    this.requireAacMode()
    return this.withNervesEvents("getCredentialByDomain", { domain }, async () => {
      const stdout = await this.execAac(["--domain", domain, "--output", "json"])
      const parsed = JSON.parse(stdout)
      if (!parsed.success) {
        throw new Error(`aac lookup failed for domain "${domain}": ${parsed.error ?? "unknown error"}`)
      }
      return parsed.credential as AacCredential
    })
  }

  /**
   * Get a specific field from a domain credential via aac CLI.
   * Convenience wrapper around getCredentialByDomain().
   */
  async getRawSecretByDomain(domain: string, field: string): Promise<string> {
    this.requireConnected()
    this.requireAacMode()
    return this.withNervesEvents("getRawSecretByDomain", { domain, field }, async () => {
      const cred = await this.getCredentialByDomain(domain)
      const value = cred[field as keyof AacCredential]
      if (value === undefined) {
        throw new Error(`field "${field}" not found for domain "${domain}"`)
      }
      return value
    })
  }

  /**
   * Pair with a Bitwarden Agent Access session using a one-time token.
   * The human runs `aac listen` and provides the token to the agent.
   */
  async pair(domain: string, token: string): Promise<AacCredential> {
    this.requireConnected()
    this.requireAacMode()
    return this.withNervesEvents("pair", { domain }, async () => {
      const stdout = await this.execAac(["--domain", domain, "--token", token, "--output", "json"])
      const parsed = JSON.parse(stdout)
      if (!parsed.success) {
        throw new Error(`aac pairing failed for domain "${domain}": ${parsed.error ?? "unknown error"}`)
      }
      return parsed.credential as AacCredential
    })
  }

  async createItem(name: string, fields: Record<string, string>): Promise<VaultItemHandle> {
    this.requireConnected()
    return this.withNervesEvents("createItem", { name }, async () => {
      const itemFields = Object.entries(fields).map(([k, v]) => ({
        name: k,
        value: v,
        type: 0, // text type
      }))

      const itemTemplate = {
        type: 1, // login type
        name,
        fields: itemFields,
        login: {},
      }

      const encoded = Buffer.from(JSON.stringify(itemTemplate)).toString("base64")
      const stdout = await this.execCli(["create", "item", encoded])
      const parsed = this.parseCliResponse(stdout)
      return { id: parsed.id, name: parsed.name, type: parsed.type }
    })
  }

  async listItems(search?: string): Promise<VaultItemHandle[]> {
    this.requireConnected()
    return this.withNervesEvents("listItems", { search }, async () => {
      const args = ["list", "items"]
      if (search) {
        args.push("--search", search)
      }
      const stdout = await this.execCli(args)
      const parsed = this.parseCliResponse(stdout)
      const items: RawVaultItem[] = Array.isArray(parsed.data) ? parsed.data : (Array.isArray(parsed) ? parsed : [])
      return items.map((item) => ({ id: item.id, name: item.name, type: item.type }))
    })
  }

  async deleteItem(id: string): Promise<void> {
    this.requireConnected()
    return this.withNervesEvents("deleteItem", { id }, async () => {
      await this.execCli(["delete", "item", id])
    })
  }

  /**
   * Internal: used by credential gateway (PR 5) to get raw secret for HTTP injection.
   * NOT exposed via tools -- only called by apiRequest() internally.
   *
   * In aac mode, `itemId` is treated as a domain and `fieldName` maps to
   * the aac credential field (username, password, totp, uri, notes).
   */
  async getRawSecret(itemId: string, fieldName: string): Promise<string> {
    this.requireConnected()

    if (this.clientMode === "aac") {
      return this.getRawSecretByDomain(itemId, fieldName)
    }

    return this.withNervesEvents("getRawSecret", { itemId, fieldName }, async () => {
      const raw = await this.fetchRawItem(itemId)

      // Check custom fields first
      if (raw.fields) {
        const field = raw.fields.find((f) => f.name === fieldName)
        if (field) return field.value
      }

      // Check login.password
      if (fieldName === "password" && raw.login?.password) {
        return raw.login.password
      }

      throw new Error(`field "${fieldName}" not found on vault item "${itemId}"`)
    })
  }

  // --- Private methods ---

  private requireConnected(): void {
    if (!this.connected) {
      throw new Error("vault not connected -- call connect() first")
    }
  }

  private requireAacMode(): void {
    if (this.clientMode !== "aac") {
      throw new Error("operation requires aac mode -- connect with connectAuto({ mode: \"aac\" })")
    }
  }

  private async withNervesEvents<T>(
    operation: string,
    meta: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    emitNervesEvent({
      event: "client.request_start",
      component: "clients",
      message: `vault ${operation} starting`,
      meta: { operation, ...meta },
    })

    try {
      const result = await fn()
      emitNervesEvent({
        event: "client.request_end",
        component: "clients",
        message: `vault ${operation} complete`,
        meta: { operation, ...meta },
      })
      return result
    } catch (err) {
      emitNervesEvent({
        level: "error",
        event: "client.error",
        component: "clients",
        message: `vault ${operation} failed`,
        /* v8 ignore next -- defensive: callers always throw Error instances @preserve */
        meta: { operation, reason: err instanceof Error ? err.message : String(err), ...meta },
      })
      throw err
    }
  }

  private async connectSdk(_config: VaultConfig): Promise<void> {
    // Attempt dynamic import of SDK
    // This will throw if the package is not installed
    const sdk = await import("@bitwarden/sdk-napi" as string)
    /* v8 ignore start -- SDK not yet published; path tested when package becomes available @preserve */
    const client = new sdk.BitwardenClient(
      { apiUrl: _config.serverUrl ?? "https://api.bitwarden.com" },
      0, // LogLevel.Info
    )
    await client.auth().loginAccessToken(_config.accessToken, "")
    this.connected = true
    this.clientMode = "sdk"
    /* v8 ignore stop */
  }

  private async connectCli(config: VaultConfig): Promise<void> {
    this.sessionKey = config.accessToken
    // Verify CLI is available and session key works
    await this.execCli(["status"])
    this.connected = true
    this.clientMode = "cli"
  }

  private async connectAac(): Promise<void> {
    // Verify aac CLI is installed and has cached sessions
    const stdout = await this.execAac(["connections", "list"])
    const parsed = JSON.parse(stdout)
    // aac connections list returns an array; at least one session means we're good
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("aac has no cached sessions -- run `aac listen` to pair first")
    }
    this.connected = true
    this.clientMode = "aac"
  }

  private async fetchRawItem(id: string): Promise<RawVaultItem> {
    const stdout = await this.execCli(["get", "item", id])
    const parsed = this.parseCliResponse(stdout)
    return parsed as RawVaultItem
  }

  private stripSecrets(raw: RawVaultItem): VaultItem {
    const item: VaultItem = {
      id: raw.id,
      name: raw.name,
      type: raw.type,
    }
    if (raw.notes) item.notes = raw.notes
    if (raw.fields) item.fields = raw.fields
    if (raw.login) {
      item.login = {}
      if (raw.login.username) item.login.username = raw.login.username
      if (raw.login.uris) item.login.uris = raw.login.uris
      // password intentionally NOT copied
    }
    return item
  }

  private parseCliResponse(stdout: string): any {
    const parsed = JSON.parse(stdout)
    // bw CLI with --response wraps in { success, data }
    if (parsed.success !== undefined && parsed.data !== undefined) {
      return parsed.data
    }
    return parsed
  }

  private execCli(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const fullArgs = [...args, "--session", this.sessionKey!, "--response"]
      execFileCb("bw", fullArgs, { timeout: 30_000 }, (err, stdout, _stderr) => {
        if (err) {
          reject(new Error(`bw CLI error: ${err.message}`))
          return
        }
        resolve(stdout)
      })
    })
  }

  private execAac(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFileCb("aac", args, { timeout: 30_000 }, (err, stdout, _stderr) => {
        if (err) {
          reject(new Error(`aac CLI error: ${err.message}`))
          return
        }
        resolve(stdout)
      })
    })
  }
}

// Singleton accessor
let _client: BitwardenClient | null = null

export function getBitwardenClient(): BitwardenClient {
  if (!_client) {
    _client = new BitwardenClient()
  }
  return _client
}

export function resetBitwardenClient(): void {
  _client = null
}
