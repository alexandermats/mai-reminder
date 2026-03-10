import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import type { Reminder, ReminderInput } from '../types/reminder'
import {
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
  ReminderStatus,
} from '../types/reminder'
import type { IReminderRepository, ListOptions } from '../types/repository'
import { toUTCString, fromUTCString } from '../utils/datetime'

// Repository Error for Capacitor operations
export class CapacitorRepositoryError extends Error {
  cause?: Error

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'CapacitorRepositoryError'
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

/**
 * Repository for Reminder database operations (Capacitor/Mobile implementation)
 * Uses @capacitor-community/sqlite
 */
export class CapacitorReminderRepository implements IReminderRepository {
  private sqlite: SQLiteConnection
  private db: SQLiteDBConnection | null = null
  private dbName: string = 'reminders.db'

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite)
  }

  private async ensureConnection(): Promise<SQLiteDBConnection> {
    if (this.db) return this.db

    try {
      const ret = await this.sqlite.checkConnectionsConsistency()
      const isConn = (await this.sqlite.isConnection(this.dbName, false)).result

      if (ret.result && isConn) {
        this.db = await this.sqlite.retrieveConnection(this.dbName, false)
      } else {
        this.db = await this.sqlite.createConnection(this.dbName, false, 'no-encryption', 1, false)
      }

      await this.db.open()
      await this.initializeSchema()
      return this.db
    } catch (err) {
      throw new CapacitorRepositoryError('Failed to initialize database connection', err)
    }
  }

  private async initializeSchema(): Promise<void> {
    if (!this.db) return

    const query = `
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        original_text TEXT NOT NULL,
        language TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        source TEXT NOT NULL,
        parser_mode TEXT NOT NULL,
        parse_confidence REAL,
        recurrence_rule TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `
    await this.db.execute(query)
  }

  private ensureDate(value: Date | string): Date {
    if (value instanceof Date) return value
    return new Date(value)
  }

  async create(input: ReminderInput): Promise<Reminder> {
    const db = await this.ensureConnection()
    try {
      const id = input.id || generateUUID()
      const now = toUTCString(new Date())
      const createdAtISO = input.createdAt ? toUTCString(this.ensureDate(input.createdAt)) : now
      const updatedAtISO = input.updatedAt ? toUTCString(this.ensureDate(input.updatedAt)) : now
      const scheduledAt = this.ensureDate(input.scheduledAt)
      const scheduledAtISO = toUTCString(scheduledAt)

      const query = `
        INSERT INTO reminders (
          id, title, original_text, language, scheduled_at,
          source, parser_mode, parse_confidence, recurrence_rule, status, created_at, updated_at, priority
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

      const params = [
        id,
        input.title,
        input.originalText,
        input.language,
        scheduledAtISO,
        input.source,
        input.parserMode,
        input.parseConfidence ?? null,
        input.recurrenceRule ?? null,
        input.status || 'pending',
        createdAtISO,
        updatedAtISO,
        input.priority ? 1 : 0,
      ]

      await db.run(query, params)

      const reminder = await this.getById(id)
      if (!reminder) {
        throw new CapacitorRepositoryError('Failed to fetch created reminder')
      }

      return reminder
    } catch (err) {
      if (err instanceof CapacitorRepositoryError) throw err
      throw new CapacitorRepositoryError('Failed to create reminder', err)
    }
  }

  async getById(id: string): Promise<Reminder | null> {
    const db = await this.ensureConnection()
    try {
      const query = `SELECT * FROM reminders WHERE id = ?`
      const res = await db.query(query, [id])

      if (!res.values || res.values.length === 0) return null

      return rowToReminder(res.values[0])
    } catch (err) {
      throw new CapacitorRepositoryError('Failed to fetch reminder', err)
    }
  }

  async list(options: ListOptions = {}): Promise<Reminder[]> {
    const db = await this.ensureConnection()
    try {
      const limit = Math.max(0, Math.floor(options.limit ?? 100))
      const offset = Math.max(0, Math.floor(options.offset ?? 0))

      const query = `SELECT * FROM reminders ORDER BY scheduled_at ASC LIMIT ? OFFSET ?`
      const res = await db.query(query, [limit, offset])

      if (!res.values) return []
      return res.values.map(rowToReminder)
    } catch (err) {
      throw new CapacitorRepositoryError('Failed to list reminders', err)
    }
  }

  async listUpcoming(fromDate: Date | string = new Date()): Promise<Reminder[]> {
    const db = await this.ensureConnection()
    try {
      const fromDateObj = fromDate instanceof Date ? fromDate : new Date(fromDate)
      const fromDateString = toUTCString(fromDateObj)

      const query = `SELECT * FROM reminders WHERE scheduled_at >= ? AND status = 'pending' ORDER BY scheduled_at ASC`
      const res = await db.query(query, [fromDateString])

      if (!res.values) return []
      return res.values.map(rowToReminder)
    } catch (err) {
      throw new CapacitorRepositoryError('Failed to list upcoming reminders', err)
    }
  }

  async listMissedPriorityReminders(now: Date | string = new Date()): Promise<Reminder[]> {
    const db = await this.ensureConnection()
    try {
      const nowDate = now instanceof Date ? now : new Date(now)
      const nowString = toUTCString(nowDate)

      const query = `SELECT * FROM reminders WHERE scheduled_at <= ? AND status = 'pending' AND priority = 1 ORDER BY scheduled_at ASC`
      const res = await db.query(query, [nowString])

      if (!res.values) return []
      return res.values.map(rowToReminder)
    } catch (err) {
      throw new CapacitorRepositoryError('Failed to list missed priority reminders', err)
    }
  }

  async update(id: string, changes: Partial<ReminderInput>): Promise<Reminder> {
    const db = await this.ensureConnection()
    try {
      const existing = await this.getById(id)
      if (!existing) {
        throw new CapacitorRepositoryError(`Reminder with id ${id} not found`)
      }

      const updates: string[] = []
      const values: (string | number | null)[] = []

      if (changes.title !== undefined) {
        updates.push('title = ?')
        values.push(changes.title)
      }
      if (changes.originalText !== undefined) {
        updates.push('original_text = ?')
        values.push(changes.originalText)
      }
      if (changes.language !== undefined) {
        updates.push('language = ?')
        values.push(changes.language)
      }
      if (changes.scheduledAt !== undefined) {
        updates.push('scheduled_at = ?')
        values.push(toUTCString(this.ensureDate(changes.scheduledAt)))
      }
      if (changes.source !== undefined) {
        updates.push('source = ?')
        values.push(changes.source)
      }
      if (changes.parserMode !== undefined) {
        updates.push('parser_mode = ?')
        values.push(changes.parserMode)
      }
      if (changes.parseConfidence !== undefined) {
        updates.push('parse_confidence = ?')
        values.push(changes.parseConfidence)
      } else if ('parseConfidence' in changes) {
        updates.push('parse_confidence = ?')
        values.push(null)
      }
      if (changes.recurrenceRule !== undefined) {
        updates.push('recurrence_rule = ?')
        values.push(changes.recurrenceRule)
      } else if ('recurrenceRule' in changes) {
        updates.push('recurrence_rule = ?')
        values.push(null)
      }
      if (changes.status !== undefined) {
        updates.push('status = ?')
        values.push(changes.status)
      }
      if (changes.priority !== undefined) {
        updates.push('priority = ?')
        values.push(changes.priority ? 1 : 0)
      }

      updates.push('updated_at = ?')
      values.push(
        changes.updatedAt
          ? toUTCString(this.ensureDate(changes.updatedAt))
          : toUTCString(new Date())
      )

      values.push(id)

      const query = `UPDATE reminders SET ${updates.join(', ')} WHERE id = ?`
      await db.run(query, values)

      const updated = await this.getById(id)
      if (!updated) {
        throw new CapacitorRepositoryError(`Failed to fetch updated reminder with id ${id}`)
      }

      return updated
    } catch (err) {
      if (err instanceof CapacitorRepositoryError) throw err
      throw new CapacitorRepositoryError('Failed to update reminder', err)
    }
  }

  async delete(id: string): Promise<boolean> {
    const db = await this.ensureConnection()
    try {
      const query = `DELETE FROM reminders WHERE id = ?`
      const res = await db.run(query, [id])
      return (res.changes?.changes ?? 0) > 0
    } catch (err) {
      throw new CapacitorRepositoryError('Failed to delete reminder', err)
    }
  }

  async clearOldReminders(includeSent: boolean = true): Promise<number> {
    const db = await this.ensureConnection()
    try {
      const statuses = ['cancelled']
      if (includeSent) {
        statuses.push('sent', 'dismissed')
      }

      const placeholders = statuses.map(() => '?').join(', ')
      const query = `DELETE FROM reminders WHERE status IN (${placeholders})`
      const res = await db.run(query, statuses)

      return res.changes?.changes ?? 0
    } catch (err) {
      throw new CapacitorRepositoryError('Failed to clear old reminders', err)
    }
  }

  async cleanupPastPendingReminders(now: Date | string = new Date()): Promise<number> {
    const db = await this.ensureConnection()
    try {
      const nowDate = now instanceof Date ? now : new Date(now)
      const nowString = toUTCString(nowDate)

      const query = `UPDATE reminders SET status = 'sent', updated_at = ? WHERE scheduled_at < ? AND status = 'pending'`
      const res = await db.run(query, [nowString, nowString])

      return res.changes?.changes ?? 0
    } catch (err) {
      throw new CapacitorRepositoryError('Failed to cleanup past pending reminders', err)
    }
  }
}

/**
 * Raw database row structure from SQLite
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToReminder(row: any): Reminder {
  return {
    id: row.id,
    title: row.title,
    originalText: row.original_text,
    language: row.language as ReminderLanguage,
    scheduledAt: fromUTCString(row.scheduled_at),
    source: row.source as ReminderSource,
    parserMode: row.parser_mode as ReminderParserMode,
    parseConfidence: row.parse_confidence ?? undefined,
    recurrenceRule: row.recurrence_rule ?? undefined,
    status: (row.status as ReminderStatus) || ReminderStatus.PENDING,
    createdAt: fromUTCString(row.created_at),
    updatedAt: fromUTCString(row.updated_at),
    priority: row.priority === 1,
  }
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
