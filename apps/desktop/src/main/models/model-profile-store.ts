import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export interface ModelProfileInput {
  name: string
  provider: string
  baseUrl: string
  model: string
  apiKeyRef: string
}

export interface ModelProfileRecord extends ModelProfileInput {
  id: string
  createdAt: string
  updatedAt: string
}

interface ModelProfileRow {
  id: string
  name: string
  provider: string
  base_url: string
  model: string
  api_key_ref: string
  created_at: string
  updated_at: string
}

export class ModelProfileStore {
  private readonly database: Database.Database

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true })
    this.database = new Database(databasePath)
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS model_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        api_key_ref TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
  }

  saveProfile(input: ModelProfileInput): ModelProfileRecord {
    const now = new Date().toISOString()
    const record: ModelProfileRecord = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    }

    this.database
      .prepare(
        `
          INSERT INTO model_profiles (
            id,
            name,
            provider,
            base_url,
            model,
            api_key_ref,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.id,
        record.name,
        record.provider,
        record.baseUrl,
        record.model,
        record.apiKeyRef,
        record.createdAt,
        record.updatedAt
      )

    return record
  }

  listProfiles(): ModelProfileRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM model_profiles ORDER BY created_at DESC, rowid DESC')
      .all() as ModelProfileRow[]

    return rows.map(mapProfileRow)
  }

  close(): void {
    this.database.close()
  }
}

function mapProfileRow(row: ModelProfileRow): ModelProfileRecord {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    apiKeyRef: row.api_key_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
