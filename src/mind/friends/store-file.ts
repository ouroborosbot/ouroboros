// FileFriendStore -- filesystem adapter for FriendStore.
// Splits friend records across two backends by PII boundary:
// - Agent knowledge (agentKnowledgePath): id, name, toolPreferences, notes, createdAt, updatedAt, schemaVersion
// - PII bridge (piiBridgePath): id, externalIds, tenantMemberships, schemaVersion

import * as fs from "fs"
import * as fsPromises from "fs/promises"
import * as path from "path"
import type { FriendStore } from "./store"
import type { FriendRecord } from "./types"

// Agent knowledge fields written to {agentKnowledgePath}/{id}.json
interface AgentKnowledgeData {
  id: string
  name: string
  toolPreferences: Record<string, string>
  notes: Record<string, { value: string, savedAt: string }>
  totalTokens: number
  createdAt: string
  updatedAt: string
  schemaVersion: number
}

// PII bridge fields written to {piiBridgePath}/{id}.json
interface PiiBridgeData {
  id: string
  externalIds: FriendRecord["externalIds"]
  tenantMemberships: string[]
  schemaVersion: number
}

export class FileFriendStore implements FriendStore {
  private readonly agentKnowledgePath: string
  private readonly piiBridgePath: string

  constructor(agentKnowledgePath: string, piiBridgePath: string) {
    this.agentKnowledgePath = agentKnowledgePath
    this.piiBridgePath = piiBridgePath
    // Auto-create directories on construction
    fs.mkdirSync(agentKnowledgePath, { recursive: true })
    fs.mkdirSync(piiBridgePath, { recursive: true })
  }

  async get(id: string): Promise<FriendRecord | null> {
    // Read agent knowledge (required)
    const agentData = await this.readJson<AgentKnowledgeData>(
      path.join(this.agentKnowledgePath, `${id}.json`),
    )
    if (!agentData) return null

    // Read PII bridge (optional -- defaults to empty arrays)
    const piiData = await this.readJson<PiiBridgeData>(
      path.join(this.piiBridgePath, `${id}.json`),
    )

    return this.merge(agentData, piiData)
  }

  async put(id: string, record: FriendRecord): Promise<void> {
    // Split into agent knowledge and PII bridge
    const agentData: AgentKnowledgeData = {
      id: record.id,
      name: record.name,
      toolPreferences: record.toolPreferences,
      notes: record.notes,
      totalTokens: record.totalTokens,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      schemaVersion: record.schemaVersion,
    }

    const piiData: PiiBridgeData = {
      id: record.id,
      externalIds: record.externalIds,
      tenantMemberships: record.tenantMemberships,
      schemaVersion: record.schemaVersion,
    }

    // Write to both backends
    await Promise.all([
      this.writeJson(path.join(this.agentKnowledgePath, `${id}.json`), agentData),
      this.writeJson(path.join(this.piiBridgePath, `${id}.json`), piiData),
    ])
  }

  async delete(id: string): Promise<void> {
    await Promise.all([
      this.removeFile(path.join(this.agentKnowledgePath, `${id}.json`)),
      this.removeFile(path.join(this.piiBridgePath, `${id}.json`)),
    ])
  }

  async findByExternalId(
    provider: string,
    externalId: string,
    tenantId?: string,
  ): Promise<FriendRecord | null> {
    // Scan PII bridge directory for matching external ID
    let entries: string[]
    try {
      entries = await fsPromises.readdir(this.piiBridgePath)
    } catch {
      return null
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      const piiData = await this.readJson<PiiBridgeData>(
        path.join(this.piiBridgePath, entry),
      )
      if (!piiData) continue

      const match = piiData.externalIds.some(
        (ext) =>
          ext.provider === provider &&
          ext.externalId === externalId &&
          (tenantId === undefined || ext.tenantId === tenantId),
      )

      if (match) {
        // Found match -- read agent knowledge and merge
        const agentData = await this.readJson<AgentKnowledgeData>(
          path.join(this.agentKnowledgePath, `${piiData.id}.json`),
        )
        if (!agentData) continue
        return this.merge(agentData, piiData)
      }
    }

    return null
  }

  private merge(
    agentData: AgentKnowledgeData,
    piiData: PiiBridgeData | null,
  ): FriendRecord {
    return {
      id: agentData.id,
      name: agentData.name,
      toolPreferences: agentData.toolPreferences,
      notes: agentData.notes,
      totalTokens: agentData.totalTokens ?? 0,
      createdAt: agentData.createdAt,
      updatedAt: agentData.updatedAt,
      schemaVersion: agentData.schemaVersion,
      externalIds: piiData?.externalIds ?? [],
      tenantMemberships: piiData?.tenantMemberships ?? [],
    }
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await fsPromises.readFile(filePath, "utf-8")
      try {
        return JSON.parse(raw) as T
      } catch {
        // Corrupted JSON
        return null
      }
    } catch {
      // File not found or other error
      return null
    }
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
  }

  private async removeFile(filePath: string): Promise<void> {
    try {
      await fsPromises.unlink(filePath)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return
      throw err
    }
  }
}
