import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type PageKind = 'web' | 'mobile' | 'custom'
export type TargetFramework = 'html' | 'vue2' | 'vue3' | 'react'

export interface CreateJobInput {
  inputPath: string
  outputDir: string
  provider: string
  model: string
  targetFramework: TargetFramework
  pageKind: PageKind
}

export interface JobRecord extends CreateJobInput {
  id: string
  status: JobStatus
  createdAt: string
  updatedAt: string
}

interface JobRow {
  id: string
  input_path: string
  output_dir: string
  provider: string
  model: string
  target_framework: TargetFramework
  page_kind: PageKind
  status: JobStatus
  created_at: string
  updated_at: string
}

export class JobStore {
  private readonly database: Database.Database

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true })
    this.database = new Database(databasePath)
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        input_path TEXT NOT NULL,
        output_dir TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        target_framework TEXT NOT NULL CHECK (target_framework IN ('html', 'vue2', 'vue3', 'react')),
        page_kind TEXT NOT NULL CHECK (page_kind IN ('web', 'mobile', 'custom')),
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
  }

  createJob(input: CreateJobInput): JobRecord {
    const now = new Date().toISOString()
    const record: JobRecord = {
      ...input,
      id: randomUUID(),
      status: 'queued',
      createdAt: now,
      updatedAt: now
    }

    this.database
      .prepare(
        `
          INSERT INTO jobs (
            id,
            input_path,
            output_dir,
            provider,
            model,
            target_framework,
            page_kind,
            status,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.id,
        record.inputPath,
        record.outputDir,
        record.provider,
        record.model,
        record.targetFramework,
        record.pageKind,
        record.status,
        record.createdAt,
        record.updatedAt
      )

    return record
  }

  updateStatus(id: string, status: JobStatus): void {
    this.database
      .prepare(
        `
          UPDATE jobs
          SET status = ?, updated_at = ?
          WHERE id = ?
        `
      )
      .run(status, new Date().toISOString(), id)
  }

  getJob(id: string): JobRecord | undefined {
    const row = this.database.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
      | JobRow
      | undefined

    return row ? mapJobRow(row) : undefined
  }

  listJobs(): JobRecord[] {
    const rows = this.database.prepare('SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC').all() as JobRow[]

    return rows.map(mapJobRow)
  }

  close(): void {
    this.database.close()
  }
}

function mapJobRow(row: JobRow): JobRecord {
  return {
    id: row.id,
    inputPath: row.input_path,
    outputDir: row.output_dir,
    provider: row.provider,
    model: row.model,
    targetFramework: row.target_framework,
    pageKind: row.page_kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
