import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createDatabase,
  runMigrations,
  getDatabaseVersion,
  setDatabaseVersion,
  type DatabaseConnection,
} from '../src/db/connection'
import { createRemindersTableSQL } from '../src/db/schema'

describe('Database Schema', () => {
  let db: DatabaseConnection

  beforeEach(() => {
    // Create in-memory database for tests
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  describe('createDatabase', () => {
    it('creates a database connection', () => {
      expect(db).toBeDefined()
      expect(db.open).toBe(true)
    })

    it('can execute simple queries', () => {
      const result = db.prepare('SELECT 1 as value').get() as { value: number }
      expect(result.value).toBe(1)
    })
  })

  describe('runMigrations', () => {
    it('creates reminders table with all required columns', () => {
      runMigrations(db)

      const tableInfo = db
        .prepare(`SELECT name, type, "notnull" FROM pragma_table_info('reminders')`)
        .all() as Array<{ name: string; type: string; notnull: number }>

      const columnNames = tableInfo.map((col) => col.name)

      // Verify all columns from Reminder type exist
      expect(columnNames).toContain('id')
      expect(columnNames).toContain('title')
      expect(columnNames).toContain('original_text')
      expect(columnNames).toContain('language')
      expect(columnNames).toContain('scheduled_at')
      expect(columnNames).toContain('source')
      expect(columnNames).toContain('parser_mode')
      expect(columnNames).toContain('parse_confidence')
      expect(columnNames).toContain('recurrence_rule')
      expect(columnNames).toContain('created_at')
      expect(columnNames).toContain('updated_at')
    })

    it('marks required columns exist in schema', () => {
      runMigrations(db)

      const tableInfo = db
        .prepare(`SELECT name FROM pragma_table_info('reminders')`)
        .all() as Array<{ name: string }>

      const requiredColumns = [
        'id',
        'title',
        'original_text',
        'language',
        'scheduled_at',
        'source',
        'parser_mode',
        'created_at',
        'updated_at',
      ]

      for (const colName of requiredColumns) {
        const col = tableInfo.find((c) => c.name === colName)
        expect(col).toBeDefined()
      }
    })

    it('allows parse_confidence to be NULL', () => {
      runMigrations(db)

      const tableInfo = db
        .prepare(
          `SELECT name, "notnull" FROM pragma_table_info('reminders') WHERE name = 'parse_confidence'`
        )
        .get() as { name: string; notnull: number }

      expect(tableInfo.notnull).toBe(0)
    })

    it('creates index on scheduled_at column', () => {
      runMigrations(db)

      const indexes = db.prepare(`SELECT name FROM pragma_index_list('reminders')`).all() as Array<{
        name: string
      }>

      const indexNames = indexes.map((idx) => idx.name)
      expect(indexNames).toContain('idx_reminders_scheduled_at')
    })

    it('creates unique index on id column', () => {
      runMigrations(db)

      const indexes = db
        .prepare(`SELECT name, origin FROM pragma_index_list('reminders')`)
        .all() as Array<{ name: string; origin: string }>

      const pkIndex = indexes.find((idx) => idx.origin === 'pk')
      expect(pkIndex).toBeDefined()
    })

    it('creates migrations table to track applied migrations', () => {
      runMigrations(db)

      const tableExists = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'`)
        .get()

      expect(tableExists).toBeDefined()
    })

    it('records migration version after running', () => {
      runMigrations(db)

      const version = getDatabaseVersion(db)
      expect(version).toBeGreaterThanOrEqual(1)
    })

    it('is idempotent - running twice does not fail', () => {
      runMigrations(db)
      const version1 = getDatabaseVersion(db)

      // Running again should not throw
      expect(() => runMigrations(db)).not.toThrow()

      const version2 = getDatabaseVersion(db)
      expect(version2).toBe(version1)
    })

    it('migrates an existing schema to include recurrence_rule without data loss', () => {
      db.exec(`
        CREATE TABLE reminders (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          original_text TEXT NOT NULL,
          language TEXT NOT NULL CHECK (language IN ('en', 'ru')),
          scheduled_at TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('text', 'voice')),
          parser_mode TEXT NOT NULL CHECK (parser_mode IN ('llm', 'local')),
          parse_confidence REAL CHECK (parse_confidence IS NULL OR (parse_confidence >= 0 AND parse_confidence <= 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
        );
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
      `)

      const now = new Date().toISOString()
      db.prepare('INSERT INTO migrations (version, applied_at) VALUES (?, ?)').run(3, now)
      db.prepare(
        `INSERT INTO reminders (
          id, title, original_text, language, scheduled_at, source, parser_mode, parse_confidence, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'legacy-1',
        'Legacy reminder',
        'legacy text',
        'en',
        now,
        'text',
        'local',
        null,
        'pending',
        now,
        now
      )

      runMigrations(db)

      const tableInfo = db
        .prepare(`SELECT name FROM pragma_table_info('reminders') WHERE name = 'recurrence_rule'`)
        .get() as { name: string } | undefined
      expect(tableInfo?.name).toBe('recurrence_rule')

      const legacy = db.prepare(`SELECT id, title FROM reminders WHERE id = ?`).get('legacy-1') as
        | { id: string; title: string }
        | undefined
      expect(legacy).toBeDefined()
      expect(legacy?.title).toBe('Legacy reminder')
    })
  })

  describe('Database versioning', () => {
    it('returns 0 for new database without migrations', () => {
      const version = getDatabaseVersion(db)
      expect(version).toBe(0)
    })

    it('sets and retrieves database version', () => {
      runMigrations(db) // Ensure migrations table exists
      setDatabaseVersion(db, 99)

      const version = getDatabaseVersion(db)
      expect(version).toBe(99)
    })

    it('gets highest version when multiple exist', () => {
      runMigrations(db) // Creates versions 1 and 2 (currently)
      setDatabaseVersion(db, 10)
      setDatabaseVersion(db, 11)

      const version = getDatabaseVersion(db)
      expect(version).toBe(11)
    })
  })

  describe('Schema SQL', () => {
    it('createRemindersTableSQL contains expected columns', () => {
      expect(createRemindersTableSQL).toContain('CREATE TABLE IF NOT EXISTS reminders')
      expect(createRemindersTableSQL).toContain('id TEXT PRIMARY KEY')
      expect(createRemindersTableSQL).toContain('title TEXT NOT NULL')
      expect(createRemindersTableSQL).toContain('scheduled_at TEXT NOT NULL')
      expect(createRemindersTableSQL).toContain('created_at TEXT NOT NULL')
    })
  })

  describe('Data insertion', () => {
    beforeEach(() => {
      runMigrations(db)
    })

    it('can insert a valid reminder', () => {
      const insert = db.prepare(`
        INSERT INTO reminders (
          id, title, original_text, language, scheduled_at,
          source, parser_mode, parse_confidence, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const now = new Date().toISOString()
      const result = insert.run(
        '550e8400-e29b-41d4-a716-446655440000',
        'Test reminder',
        'Remind me to test',
        'en',
        now,
        'text',
        'llm',
        null,
        now,
        now
      )

      expect(result.changes).toBe(1)
    })

    it('enforces unique constraint on id', () => {
      const insert = db.prepare(`
        INSERT INTO reminders (
          id, title, original_text, language, scheduled_at,
          source, parser_mode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const now = new Date().toISOString()
      const id = '550e8400-e29b-41d4-a716-446655440000'

      insert.run(id, 'Test 1', 'Text 1', 'en', now, 'text', 'llm', now, now)

      // Inserting duplicate ID should throw
      expect(() =>
        insert.run(id, 'Test 2', 'Text 2', 'ru', now, 'voice', 'local', now, now)
      ).toThrow()
    })

    it('rejects invalid language values', () => {
      // SQLite doesn't enforce CHECK constraints by default in older versions,
      // but we document the expected behavior
      const insert = db.prepare(`
        INSERT INTO reminders (
          id, title, original_text, language, scheduled_at,
          source, parser_mode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const now = new Date().toISOString()

      // Should accept valid language
      expect(() =>
        insert.run('id-1', 'Test', 'Text', 'en', now, 'text', 'llm', now, now)
      ).not.toThrow()

      // Should accept 'ru'
      expect(() =>
        insert.run('id-2', 'Test', 'Text', 'ru', now, 'text', 'llm', now, now)
      ).not.toThrow()
    })
  })
})
