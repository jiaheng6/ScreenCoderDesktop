import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export interface SecretCodec {
  encrypt: (value: string) => string
  decrypt: (value: string) => string
}

export interface ModelProviderInput {
  id?: string
  name: string
  provider: string
  baseUrl: string
  apiKey?: string
}

export interface ModelProviderRecord {
  id: string
  name: string
  provider: string
  baseUrl: string
  hasApiKey: boolean
  createdAt: string
  updatedAt: string
}

export interface ModelConfigInput {
  id?: string
  name: string
  providerId: string
  model: string
}

export interface ModelConfigRecord {
  id: string
  name: string
  providerId: string
  model: string
  createdAt: string
  updatedAt: string
}

export interface RunnableModel {
  model: ModelConfigRecord
  provider: {
    id: string
    name: string
    provider: string
    baseUrl: string
    apiKey: string
  }
}

interface ModelProviderRow {
  id: string
  name: string
  provider: string
  base_url: string
  api_key_ciphertext: string | null
  created_at: string
  updated_at: string
}

interface ModelConfigRow {
  id: string
  name: string
  provider_id: string
  model: string
  created_at: string
  updated_at: string
}

const unavailableSecretCodec: SecretCodec = {
  encrypt() {
    throw new Error('安全密钥存储未初始化')
  },
  decrypt() {
    throw new Error('安全密钥存储未初始化')
  }
}

export class ModelProfileStore {
  private readonly database: DatabaseSync
  private readonly secretCodec: SecretCodec

  constructor(databasePath: string, secretCodec: SecretCodec = unavailableSecretCodec) {
    mkdirSync(dirname(databasePath), { recursive: true })
    this.database = new DatabaseSync(databasePath)
    this.secretCodec = secretCodec
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS model_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key_ciphertext TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS model_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }

  saveProvider(input: ModelProviderInput): ModelProviderRecord {
    const now = new Date().toISOString()
    const existing = input.id ? this.getProviderRow(input.id) : undefined
    const id = existing?.id ?? randomUUID()
    const createdAt = existing?.created_at ?? now
    const apiKey = input.apiKey?.trim()
    const apiKeyCiphertext =
      apiKey && apiKey.length > 0
        ? this.secretCodec.encrypt(apiKey)
        : (existing?.api_key_ciphertext ?? null)

    if (existing) {
      this.database
        .prepare(
          `
            UPDATE model_providers
            SET name = ?, provider = ?, base_url = ?, api_key_ciphertext = ?, updated_at = ?
            WHERE id = ?
          `
        )
        .run(input.name, input.provider, input.baseUrl, apiKeyCiphertext, now, id)
    } else {
      this.database
        .prepare(
          `
            INSERT INTO model_providers (
              id,
              name,
              provider,
              base_url,
              api_key_ciphertext,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(id, input.name, input.provider, input.baseUrl, apiKeyCiphertext, createdAt, now)
    }

    return {
      id,
      name: input.name,
      provider: input.provider,
      baseUrl: input.baseUrl,
      hasApiKey: Boolean(apiKeyCiphertext),
      createdAt,
      updatedAt: now
    }
  }

  listProviders(): ModelProviderRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM model_providers ORDER BY created_at DESC, rowid DESC')
      .all() as unknown as ModelProviderRow[]

    return rows.map(mapProviderRow)
  }

  getProvider(id: string): ModelProviderRecord | undefined {
    const row = this.getProviderRow(id)

    return row ? mapProviderRow(row) : undefined
  }

  saveModel(input: ModelConfigInput): ModelConfigRecord {
    const provider = this.getProviderRow(input.providerId)
    if (!provider) {
      throw new Error('模型绑定的提供商不存在')
    }

    const now = new Date().toISOString()
    const existing = input.id ? this.getModelRow(input.id) : undefined
    const id = existing?.id ?? randomUUID()
    const createdAt = existing?.created_at ?? now

    if (existing) {
      this.database
        .prepare(
          `
            UPDATE model_configs
            SET name = ?, provider_id = ?, model = ?, updated_at = ?
            WHERE id = ?
          `
        )
        .run(input.name, input.providerId, input.model, now, id)
    } else {
      this.database
        .prepare(
          `
            INSERT INTO model_configs (
              id,
              name,
              provider_id,
              model,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `
        )
        .run(id, input.name, input.providerId, input.model, createdAt, now)
    }

    return {
      id,
      name: input.name,
      providerId: input.providerId,
      model: input.model,
      createdAt,
      updatedAt: now
    }
  }

  listModels(): ModelConfigRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM model_configs ORDER BY created_at DESC, rowid DESC')
      .all() as unknown as ModelConfigRow[]

    return rows.map(mapModelRow)
  }

  getModel(id: string): ModelConfigRecord | undefined {
    const row = this.getModelRow(id)

    return row ? mapModelRow(row) : undefined
  }

  getRunnableModel(modelId: string): RunnableModel {
    const modelRow = this.getModelRow(modelId)
    if (!modelRow) {
      throw new Error('模型配置不存在')
    }

    const providerRow = this.getProviderRow(modelRow.provider_id)
    if (!providerRow) {
      throw new Error('模型绑定的提供商不存在')
    }

    if (!providerRow.api_key_ciphertext) {
      throw new Error('提供商尚未配置 API Key')
    }

    return {
      model: mapModelRow(modelRow),
      provider: {
        id: providerRow.id,
        name: providerRow.name,
        provider: providerRow.provider,
        baseUrl: providerRow.base_url,
        apiKey: this.secretCodec.decrypt(providerRow.api_key_ciphertext)
      }
    }
  }

  close(): void {
    this.database.close()
  }

  private getProviderRow(id: string): ModelProviderRow | undefined {
    return this.database.prepare('SELECT * FROM model_providers WHERE id = ?').get(id) as
      | ModelProviderRow
      | undefined
  }

  private getModelRow(id: string): ModelConfigRow | undefined {
    return this.database.prepare('SELECT * FROM model_configs WHERE id = ?').get(id) as
      | ModelConfigRow
      | undefined
  }
}

function mapProviderRow(row: ModelProviderRow): ModelProviderRecord {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.base_url,
    hasApiKey: Boolean(row.api_key_ciphertext),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapModelRow(row: ModelConfigRow): ModelConfigRecord {
  return {
    id: row.id,
    name: row.name,
    providerId: row.provider_id,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
