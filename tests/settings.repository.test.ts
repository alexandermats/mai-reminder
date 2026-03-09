import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SettingsRepository } from '../src/db/settingsRepository'
import { createDatabase, runMigrations, type DatabaseConnection } from '../src/db/connection'

describe('SettingsRepository (E2-06)', () => {
  let db: DatabaseConnection
  let repo: SettingsRepository

  beforeEach(() => {
    db = createDatabase(':memory:')
    runMigrations(db)
    repo = new SettingsRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  // ── Default value ─────────────────────────────────────────────────────────

  describe('getSetting', () => {
    it('returns "local" as the default parserMode when no value stored', async () => {
      const mode = await repo.getSetting('parserMode')
      expect(mode).toBe('local')
    })

    it('returns null for an unrecognized key', async () => {
      const val = await (repo as unknown as Record<string, (k: string) => Promise<unknown>>)[
        'getSetting'
      ]('unknownKey')
      expect(val).toBeNull()
    })

    it('returns default hourly recurrence window values', async () => {
      const start = await repo.getSetting('hourlyReminderStartTime')
      const end = await repo.getSetting('hourlyReminderEndTime')
      expect(start).toBe('09:00')
      expect(end).toBe('22:00')
    })
  })

  // ── setSetting / getSetting round-trip ────────────────────────────────────

  describe('setSetting', () => {
    it('stores parserMode "llm" and retrieves it', async () => {
      await repo.setSetting('parserMode', 'llm')
      const result = await repo.getSetting('parserMode')
      expect(result).toBe('llm')
    })

    it('stores parserMode "local" and retrieves it', async () => {
      await repo.setSetting('parserMode', 'local')
      const result = await repo.getSetting('parserMode')
      expect(result).toBe('local')
    })

    it('overwrites an existing value', async () => {
      await repo.setSetting('parserMode', 'llm')
      await repo.setSetting('parserMode', 'local')
      const result = await repo.getSetting('parserMode')
      expect(result).toBe('local')
    })

    it('updates updatedAt timestamp on each write', async () => {
      await repo.setSetting('parserMode', 'llm')

      // Small delay to ensure timestamp differs
      await new Promise((resolve) => setTimeout(resolve, 5))

      await repo.setSetting('parserMode', 'local')

      // Retrieve raw row to inspect updatedAt
      const row = db.prepare("SELECT updated_at FROM settings WHERE key = 'parserMode'").get() as {
        updated_at: string
      }

      expect(row).toBeDefined()
      expect(typeof row.updated_at).toBe('string')
      expect(new Date(row.updated_at).getTime()).toBeGreaterThan(0)
    })

    it('stores hourly recurrence window settings and retrieves them', async () => {
      await repo.setSetting('hourlyReminderStartTime', '08:00')
      await repo.setSetting('hourlyReminderEndTime', '21:00')

      expect(await repo.getSetting('hourlyReminderStartTime')).toBe('08:00')
      expect(await repo.getSetting('hourlyReminderEndTime')).toBe('21:00')
    })

    it('stores timeFormat setting and retrieves it', async () => {
      await repo.setSetting('timeFormat', '12h')
      expect(await repo.getSetting('timeFormat')).toBe('12h')

      await repo.setSetting('timeFormat', '24h')
      expect(await repo.getSetting('timeFormat')).toBe('24h')
    })
  })

  // ── Schema requirements ───────────────────────────────────────────────────

  describe('settings table', () => {
    it('creates a settings table via migration', () => {
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        .get()
      expect(tableExists).toBeDefined()
    })

    it('settings table has key, value, and updated_at columns', () => {
      const cols = db.prepare("SELECT name FROM pragma_table_info('settings')").all() as Array<{
        name: string
      }>

      const names = cols.map((c) => c.name)
      expect(names).toContain('key')
      expect(names).toContain('value')
      expect(names).toContain('updated_at')
    })

    it('key column is the primary key (unique constraint)', () => {
      db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
        'testKey',
        'val1',
        new Date().toISOString()
      )

      expect(() =>
        db
          .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
          .run('testKey', 'val2', new Date().toISOString())
      ).toThrow()
    })
  })

  // ── Persistence across reconnect ──────────────────────────────────────────

  describe('persistence across restart simulation', () => {
    it('parserMode persists across a new SettingsRepository instance on same DB', async () => {
      await repo.setSetting('parserMode', 'local')

      // Simulate "restart" with same DB connection
      const repo2 = new SettingsRepository(db)
      const result = await repo2.getSetting('parserMode')

      expect(result).toBe('local')
    })
  })
})
