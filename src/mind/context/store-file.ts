// FileContextStore -- filesystem adapter for ContextStore.
// This is the ONLY module that imports fs for context data.
// Each collection maps to a subdirectory, each item to a {id}.json file.

import * as fs from "fs/promises"
import * as path from "path"
import type { CollectionStore, ContextStore } from "./store"
import type { FriendIdentity } from "./types"

export interface MigrationConfig {
  currentVersion: number
  migrate: (data: any, fromVersion: number) => any
}

export interface FileContextStoreOptions {
  identity?: MigrationConfig
}

class FileCollectionStore<T extends { schemaVersion: number }> implements CollectionStore<T> {
  private readonly dir: string
  private readonly migration?: MigrationConfig

  constructor(basePath: string, collectionName: string, migration?: MigrationConfig) {
    this.dir = path.join(basePath, collectionName)
    this.migration = migration
  }

  async get(id: string): Promise<T | null> {
    try {
      const filePath = path.join(this.dir, `${id}.json`)
      const raw = await fs.readFile(filePath, "utf-8")
      let data: T
      try {
        data = JSON.parse(raw) as T
      } catch {
        // Corrupted JSON -- return null
        return null
      }

      // Schema migration
      if (this.migration && data.schemaVersion < this.migration.currentVersion) {
        data = this.migration.migrate(data, data.schemaVersion) as T
        // Write migrated data back
        await this.writeFile(id, data)
      }

      return data
    } catch (err: any) {
      if (err?.code === "ENOENT") return null
      return null
    }
  }

  async put(id: string, value: T): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    await this.writeFile(id, value)
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.dir, `${id}.json`))
    } catch (err: any) {
      if (err?.code === "ENOENT") return
      throw err
    }
  }

  async find(predicate: (value: T) => boolean): Promise<T | null> {
    let entries: string[]
    try {
      entries = await fs.readdir(this.dir)
    } catch (err: any) {
      if (err?.code === "ENOENT") return null
      return null
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      const id = entry.slice(0, -5) // remove .json
      const item = await this.get(id)
      if (item && predicate(item)) return item
    }
    return null
  }

  private async writeFile(id: string, value: T): Promise<void> {
    const filePath = path.join(this.dir, `${id}.json`)
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8")
  }
}

export class FileContextStore implements ContextStore {
  readonly identity: CollectionStore<FriendIdentity>

  constructor(basePath: string, options?: FileContextStoreOptions) {
    this.identity = new FileCollectionStore<FriendIdentity>(
      basePath,
      "identity",
      options?.identity
    )
  }
}
