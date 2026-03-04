/**
 * E1-06: Restart Persistence Reliability
 *
 * Integration tests verifying that reminders survive a simulated application
 * restart when using a file-based SQLite database.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initializeDatabase,
  closeDatabase,
  verifyDatabaseIntegrity,
  type DatabaseConnection,
} from '../src/db/connection'
import { ElectronReminderRepository } from '../src/db/electronReminderRepository'
import { ReminderLanguage, ReminderSource, ReminderParserMode } from '../src/types/reminder'

describe('E1-06: Restart persistence reliability', () => {
  // Keep track of temp dirs so we can clean them up after each test
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // best-effort cleanup
      }
    }
    tempDirs.length = 0
    vi.restoreAllMocks()
  })

  function makeTempDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'mai-e1-06-'))
    tempDirs.push(dir)
    return join(dir, 'reminders.db')
  }

  describe('Restart simulation', () => {
    it('data created before restart is queryable after restart', async () => {
      const dbPath = makeTempDbPath()

      // ── Session 1: create a reminder and close ──────────────────────────
      const db1: DatabaseConnection = initializeDatabase(dbPath)
      const repo1 = new ElectronReminderRepository(db1)

      const created = await repo1.create({
        title: 'Survive restart',
        originalText: 'Remind me to survive restart',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2026-06-01T10:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
      })
      closeDatabase(db1)

      // ── Session 2: re-open the same file (simulated restart) ────────────
      const db2: DatabaseConnection = initializeDatabase(dbPath)
      const repo2 = new ElectronReminderRepository(db2)

      const fetched = await repo2.getById(created.id)
      closeDatabase(db2)

      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.title).toBe('Survive restart')
    })

    it('all reminders survive restart', async () => {
      const dbPath = makeTempDbPath()

      // ── Session 1 ───────────────────────────────────────────────────────
      const db1: DatabaseConnection = initializeDatabase(dbPath)
      const repo1 = new ElectronReminderRepository(db1)

      for (let i = 0; i < 3; i++) {
        await repo1.create({
          title: `Reminder ${i}`,
          originalText: `Text ${i}`,
          language: ReminderLanguage.EN,
          scheduledAt: new Date(`2026-06-0${i + 1}T10:00:00Z`),
          source: ReminderSource.TEXT,
          parserMode: ReminderParserMode.LLM,
        })
      }
      closeDatabase(db1)

      // ── Session 2 ───────────────────────────────────────────────────────
      const db2: DatabaseConnection = initializeDatabase(dbPath)
      const repo2 = new ElectronReminderRepository(db2)

      const allReminders = await repo2.list()
      closeDatabase(db2)

      expect(allReminders).toHaveLength(3)
    })
  })

  describe('DB path logging on startup', () => {
    it('logs the resolved DB file path at debug level during initialization', () => {
      const dbPath = makeTempDbPath()
      const debugSpy = vi.spyOn(console, 'debug')

      const db = initializeDatabase(dbPath)
      closeDatabase(db)

      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining(dbPath))
    })
  })

  describe('Database integrity check', () => {
    it('verifyDatabaseIntegrity passes on a healthy database', () => {
      const dbPath = makeTempDbPath()
      const db = initializeDatabase(dbPath)

      expect(() => verifyDatabaseIntegrity(db)).not.toThrow()

      closeDatabase(db)
    })

    it('initializeDatabase throws when the DB file is corrupted (not a crash)', () => {
      const dbPath = makeTempDbPath()

      // Create a valid DB first, then close it
      const db = initializeDatabase(dbPath)
      closeDatabase(db)

      // Overwrite with garbage bytes to corrupt the file
      writeFileSync(dbPath, Buffer.from('THIS IS NOT SQLITE DATA !!!!!!'))

      // Should throw some error (not silently continue or crash the process)
      expect(() => {
        const corruptDb = initializeDatabase(dbPath)
        closeDatabase(corruptDb)
      }).toThrow()
    })

    it('verifyDatabaseIntegrity wraps PRAGMA errors as DatabaseIntegrityError', () => {
      // Use a fresh in-memory DB, then stub the pragma method to throw
      const db = initializeDatabase(':memory:')
      const original = db.pragma.bind(db)
      db.pragma = (name: string) => {
        if (name === 'integrity_check') {
          throw new Error('simulated sqlite error')
        }
        return original(name)
      }

      let thrownError: unknown
      try {
        verifyDatabaseIntegrity(db)
      } catch (e) {
        thrownError = e
      } finally {
        // Restore pragma before closing
        db.pragma = original
        closeDatabase(db)
      }

      expect(thrownError).toBeDefined()
      expect((thrownError as Error).name).toBe('DatabaseIntegrityError')
      expect((thrownError as Error).message).toContain('Database integrity check failed')
    })
  })
})
