/**
 * Reminder repository for database operations
 * Provides CRUD operations with SQLite backend
 */

import type { DatabaseConnection } from './connection'
import type { Reminder, ReminderInput } from '../types/reminder'
import {
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
  ReminderStatus,
} from '../types/reminder'
import { toUTCString, fromUTCString } from '../utils/datetime'
import type { IReminderRepository, ListOptions } from '../types/repository'

/**
 * Column names for reminder queries - single source of truth
 */
const REMINDER_COLUMNS = [
  'id',
  'title',
  'original_text',
  'language',
  'scheduled_at',
  'source',
  'parser_mode',
  'parse_confidence',
  'recurrence_rule',
  'status',
  'created_at',
  'updated_at',
].join(', ')

/**
 * Custom error for repository operations
 */
export class RepositoryError extends Error {
  cause?: Error

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'RepositoryError'
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

/**
 * Repository for Reminder database operations (Electron/Node.js implementation)
 */
export class ElectronReminderRepository implements IReminderRepository {
  private db: DatabaseConnection

  constructor(db: DatabaseConnection) {
    this.db = db
  }

  private ensureDate(value: Date | string): Date {
    if (value instanceof Date) return value
    return new Date(value)
  }

  /**
   * Create a new reminder in the database
   * @param input Reminder data to create
   * @returns Created reminder with generated ID and timestamps
   * @throws RepositoryError if database operation fails
   */
  async create(input: ReminderInput): Promise<Reminder> {
    try {
      const id = input.id || generateUUID()
      const now = toUTCString(new Date())
      const createdAtISO = input.createdAt ? toUTCString(this.ensureDate(input.createdAt)) : now
      const updatedAtISO = input.updatedAt ? toUTCString(this.ensureDate(input.updatedAt)) : now
      const scheduledAt = this.ensureDate(input.scheduledAt)
      const scheduledAtISO = toUTCString(scheduledAt)

      const insert = this.db.prepare(`
        INSERT INTO reminders (
          id, title, original_text, language, scheduled_at,
          source, parser_mode, parse_confidence, recurrence_rule, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      insert.run(
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
        updatedAtISO
      )

      // Fetch the created reminder to return complete object
      const reminder = await this.getById(id)
      if (!reminder) {
        throw new RepositoryError('Failed to fetch created reminder')
      }

      return reminder
    } catch (err) {
      console.error('[ElectronReminderRepository] create failed with error:', err)
      if (err instanceof RepositoryError) throw err
      throw new RepositoryError('Failed to create reminder', err)
    }
  }

  /**
   * Get a reminder by its ID
   * @param id Reminder UUID
   * @returns Reminder or null if not found
   * @throws RepositoryError if database operation fails
   */
  async getById(id: string): Promise<Reminder | null> {
    try {
      const row = this.db
        .prepare(`SELECT ${REMINDER_COLUMNS} FROM reminders WHERE id = ?`)
        .get(id) as DatabaseReminderRow | undefined

      if (!row) return null

      return rowToReminder(row)
    } catch (err) {
      throw new RepositoryError('Failed to fetch reminder', err)
    }
  }

  /**
   * List all reminders ordered by scheduledAt (ascending)
   * @param options Pagination options
   * @returns Array of reminders
   * @throws RepositoryError if database operation fails
   */
  async list(options: ListOptions = {}): Promise<Reminder[]> {
    try {
      // Validate and sanitize pagination options
      const limit = Math.max(0, Math.floor(options.limit ?? 100))
      const offset = Math.max(0, Math.floor(options.offset ?? 0))

      const rows = this.db
        .prepare(
          `SELECT ${REMINDER_COLUMNS} FROM reminders ORDER BY scheduled_at ASC LIMIT ? OFFSET ?`
        )
        .all(limit, offset) as DatabaseReminderRow[]

      return rows.map(rowToReminder)
    } catch (err) {
      throw new RepositoryError('Failed to list reminders', err)
    }
  }

  /**
   * List upcoming reminders ordered by scheduledAt (ascending)
   * @param fromDate Optional date to filter from, defaults to now
   * @returns Array of reminders
   */
  async listUpcoming(fromDate: Date | string = new Date()): Promise<Reminder[]> {
    try {
      const fromDateObj = fromDate instanceof Date ? fromDate : new Date(fromDate)
      const fromDateString = toUTCString(fromDateObj)
      const rows = this.db
        .prepare(
          `SELECT ${REMINDER_COLUMNS} FROM reminders WHERE scheduled_at >= ? AND status = 'pending' ORDER BY scheduled_at ASC`
        )
        .all(fromDateString) as DatabaseReminderRow[]

      return rows.map(rowToReminder)
    } catch (err) {
      throw new RepositoryError('Failed to list upcoming reminders', err)
    }
  }

  /**
   * Transition any past pending reminders to 'sent' status.
   * Useful on startup to clean up missed reminders while app was closed.
   * @param now Current date/time
   * @returns Number of reminders updated
   */
  async cleanupPastPendingReminders(now: Date | string = new Date()): Promise<number> {
    try {
      const nowDate = now instanceof Date ? now : new Date(now)
      const nowString = toUTCString(nowDate)
      const result = this.db
        .prepare(
          "UPDATE reminders SET status = 'sent', updated_at = ? WHERE scheduled_at < ? AND status = 'pending'"
        )
        .run(nowString, nowString)
      return result.changes
    } catch (err) {
      throw new RepositoryError('Failed to cleanup past pending reminders', err)
    }
  }

  /**
   * Update a reminder with partial changes
   * @param id Reminder UUID to update
   * @param changes Partial reminder data to update
   * @returns Updated reminder
   * @throws RepositoryError if reminder not found or database operation fails
   */
  async update(id: string, changes: Partial<ReminderInput>): Promise<Reminder> {
    if (!id || typeof id !== 'string') {
      throw new RepositoryError('Valid id string is required')
    }
    if (!changes || typeof changes !== 'object') {
      throw new RepositoryError('Changes object is required')
    }

    try {
      // First check if reminder exists
      const existing = await this.getById(id)
      if (!existing) {
        throw new RepositoryError(`Reminder with id ${id} not found`)
      }

      // Build dynamic update query based on provided changes
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
        // Explicitly set to undefined - clear the value
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

      // Always update updated_at timestamp
      updates.push('updated_at = ?')
      values.push(
        changes.updatedAt
          ? toUTCString(this.ensureDate(changes.updatedAt))
          : toUTCString(new Date())
      )

      // Add id to values for WHERE clause
      values.push(id)

      const update = this.db.prepare(`
        UPDATE reminders
        SET ${updates.join(', ')}
        WHERE id = ?
      `)

      const result = update.run(...values)

      if (result.changes === 0) {
        throw new RepositoryError(`Reminder with id ${id} not found or no changes made`)
      }

      // Fetch and return updated reminder
      const updated = await this.getById(id)
      if (!updated) {
        throw new RepositoryError(`Failed to fetch updated reminder with id ${id}`)
      }

      return updated
    } catch (err) {
      if (err instanceof RepositoryError) throw err
      throw new RepositoryError('Failed to update reminder', err)
    }
  }

  /**
   * Delete a reminder by its ID
   * @param id Reminder UUID to delete
   * @returns true if reminder was deleted, false if not found
   * @throws RepositoryError if database operation fails
   */
  async delete(id: string): Promise<boolean> {
    try {
      const deleteStmt = this.db.prepare('DELETE FROM reminders WHERE id = ?')
      const result = deleteStmt.run(id)

      return result.changes > 0
    } catch (err) {
      throw new RepositoryError('Failed to delete reminder', err)
    }
  }

  /**
   * List missed reminders — those with status 'sent' whose scheduledAt is in
   * the past. These are reminders the notification fired for without an explicit
   * user acknowledgement (snooze moves the reminder back to 'pending').
   * Used by the tray badge service to compute the badge count.
   * @param before Optional upper bound for scheduledAt, defaults to now
   * @param since Optional lower bound for scheduledAt, to only fetch reminders missed after a certain time
   * @param timeoutSeconds Optional time in seconds to wait before a notification is considered missed.
   * @returns Array of minimally-shaped missed reminders
   */
  async listMissed(
    before: Date = new Date(),
    since?: Date,
    timeoutSeconds: number = 0
  ): Promise<{ id: string; scheduledAt: Date; status: string }[]> {
    try {
      const beforeWithTimeout = new Date(before.getTime() - timeoutSeconds * 1000)
      const beforeString = toUTCString(beforeWithTimeout)
      let query = `SELECT id, scheduled_at, status FROM reminders
           WHERE status = 'sent'
             AND scheduled_at <= ?`
      const params: string[] = [beforeString]

      if (since) {
        query += ` AND scheduled_at > ?`
        params.push(toUTCString(since))
      }

      query += ` ORDER BY scheduled_at DESC`

      const rows = this.db.prepare(query).all(...params) as {
        id: string
        scheduled_at: string
        status: string
      }[]

      return rows.map((row) => ({
        id: row.id,
        scheduledAt: fromUTCString(row.scheduled_at),
        status: row.status,
      }))
    } catch (err) {
      throw new RepositoryError('Failed to list missed reminders', err)
    }
  }

  /**
   * Clear old reminders from the database.
   * Always deletes cancelled reminders.
   * Optionally deletes sent reminders based on includeSent parameter.
   * @param includeSent Whether to also delete reminders with status 'sent'
   * @returns Number of reminders deleted
   * @throws RepositoryError if database operation fails
   */
  async clearOldReminders(includeSent: boolean = true): Promise<number> {
    try {
      const statuses = ['cancelled']
      if (includeSent) {
        statuses.push('sent', 'dismissed')
      }

      // Use parameterized query with placeholders to prevent SQL injection
      const placeholders = statuses.map(() => '?').join(', ')
      const result = this.db
        .prepare(`DELETE FROM reminders WHERE status IN (${placeholders})`)
        .run(...statuses)

      return result.changes
    } catch (err) {
      throw new RepositoryError('Failed to clear old reminders', err)
    }
  }
}

/**
 * Raw database row structure from SQLite
 */
interface DatabaseReminderRow {
  id: string
  title: string
  original_text: string
  language: string
  scheduled_at: string
  source: string
  parser_mode: string
  parse_confidence: number | null
  recurrence_rule: string | null
  status: string
  created_at: string
  updated_at: string
}

/**
 * Convert a database row to a Reminder object
 * Handles date parsing from ISO-8601 UTC strings
 */
function rowToReminder(row: DatabaseReminderRow): Reminder {
  try {
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
    }
  } catch (err) {
    throw new RepositoryError(
      `Invalid date value in database row: ${err instanceof Error ? err.message : String(err)}`
    )
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
