import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, runMigrations, type DatabaseConnection } from '../src/db/connection'
import { ElectronReminderRepository } from '../src/db/electronReminderRepository'
import {
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
  type ReminderInput,
} from '../src/types/reminder'

describe('ReminderRepository', () => {
  let db: DatabaseConnection
  let repository: ElectronReminderRepository
  beforeEach(() => {
    db = createDatabase(':memory:')
    runMigrations(db)
    repository = new ElectronReminderRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('create', () => {
    it('inserts a reminder and returns it with generated ID', async () => {
      const input: ReminderInput = {
        title: 'Test reminder',
        originalText: 'Remind me to test',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2026-02-25T15:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
        parseConfidence: 0.85,
      }

      const reminder = await repository.create(input)

      expect(reminder.id).toBeDefined()
      expect(reminder.title).toBe(input.title)
      expect(reminder.originalText).toBe(input.originalText)
      expect(reminder.language).toBe(input.language)
      expect(reminder.scheduledAt).toEqual(input.scheduledAt)
      expect(reminder.source).toBe(input.source)
      expect(reminder.parserMode).toBe(input.parserMode)
      expect(reminder.parseConfidence).toBe(input.parseConfidence)
      expect(reminder.createdAt).toBeInstanceOf(Date)
      expect(reminder.updatedAt).toBeInstanceOf(Date)
    })

    it('inserts a reminder without parseConfidence', async () => {
      const input: ReminderInput = {
        title: 'Simple reminder',
        originalText: 'Test',
        language: ReminderLanguage.RU,
        scheduledAt: new Date('2026-02-25T10:00:00Z'),
        source: ReminderSource.VOICE,
        parserMode: ReminderParserMode.LOCAL,
      }

      const reminder = await repository.create(input)

      expect(reminder.title).toBe(input.title)
      expect(reminder.parseConfidence).toBeUndefined()
    })

    it('persists recurrenceRule when provided', async () => {
      const input: ReminderInput = {
        title: 'Weekly reminder',
        originalText: 'Every Monday at 9',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2026-02-25T10:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LOCAL,
        recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
      }

      const reminder = await repository.create(input)

      expect(reminder.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO')
    })

    it('persists the reminder in the database', async () => {
      const input: ReminderInput = {
        title: 'Persist test',
        originalText: 'Check persistence',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2026-02-25T12:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
      }

      const created = await repository.create(input)
      const fetched = await repository.getById(created.id)

      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.title).toBe(input.title)
    })
  })

  describe('getById', () => {
    it('returns null for non-existent reminder', async () => {
      const result = await repository.getById('non-existent-id')
      expect(result).toBeNull()
    })

    it('returns the correct reminder by ID', async () => {
      const input1: ReminderInput = {
        title: 'First reminder',
        originalText: 'First',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2026-02-25T10:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
      }
      const input2: ReminderInput = {
        title: 'Second reminder',
        originalText: 'Second',
        language: ReminderLanguage.RU,
        scheduledAt: new Date('2026-02-25T11:00:00Z'),
        source: ReminderSource.VOICE,
        parserMode: ReminderParserMode.LOCAL,
      }

      const reminder1 = await repository.create(input1)
      const reminder2 = await repository.create(input2)

      // Verify both exist
      expect(reminder1.id).toBeDefined()
      expect(reminder2.id).toBeDefined()

      const fetched = await repository.getById(reminder2.id)

      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(reminder2.id)
      expect(fetched!.title).toBe('Second reminder')
    })

    it('correctly deserializes dates from database', async () => {
      const scheduledAt = new Date('2026-02-25T15:30:00Z')
      const input: ReminderInput = {
        title: 'Date test',
        originalText: 'Check dates',
        language: ReminderLanguage.EN,
        scheduledAt,
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
      }

      const created = await repository.create(input)
      const fetched = await repository.getById(created.id)

      expect(fetched!.scheduledAt).toBeInstanceOf(Date)
      expect(fetched!.scheduledAt.toISOString()).toBe(scheduledAt.toISOString())
      expect(fetched!.createdAt).toBeInstanceOf(Date)
      expect(fetched!.updatedAt).toBeInstanceOf(Date)
    })

    it('correctly handles parseConfidence as null when not set', async () => {
      const input: ReminderInput = {
        title: 'No confidence',
        originalText: 'Test',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2026-02-25T12:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
      }

      const created = await repository.create(input)
      const fetched = await repository.getById(created.id)

      expect(fetched!.parseConfidence).toBeUndefined()
    })
  })

  describe('list', () => {
    it('returns empty array when no reminders exist', async () => {
      const reminders = await repository.list()
      expect(reminders).toEqual([])
    })

    it('returns all reminders ordered by scheduledAt ASC', async () => {
      const inputs: ReminderInput[] = [
        {
          title: 'Third',
          originalText: '3',
          language: ReminderLanguage.EN,
          scheduledAt: new Date('2026-02-25T15:00:00Z'),
          source: ReminderSource.TEXT,
          parserMode: ReminderParserMode.LLM,
        },
        {
          title: 'First',
          originalText: '1',
          language: ReminderLanguage.EN,
          scheduledAt: new Date('2026-02-25T10:00:00Z'),
          source: ReminderSource.TEXT,
          parserMode: ReminderParserMode.LLM,
        },
        {
          title: 'Second',
          originalText: '2',
          language: ReminderLanguage.EN,
          scheduledAt: new Date('2026-02-25T12:00:00Z'),
          source: ReminderSource.TEXT,
          parserMode: ReminderParserMode.LLM,
        },
      ]

      for (const input of inputs) {
        await repository.create(input)
      }

      const reminders = await repository.list()

      expect(reminders).toHaveLength(3)
      expect(reminders[0].title).toBe('First')
      expect(reminders[1].title).toBe('Second')
      expect(reminders[2].title).toBe('Third')
    })

    it('supports pagination with limit and offset', async () => {
      // Create 5 reminders
      for (let i = 0; i < 5; i++) {
        await repository.create({
          title: `Reminder ${i}`,
          originalText: `Text ${i}`,
          language: ReminderLanguage.EN,
          scheduledAt: new Date(`2026-02-25T${10 + i}:00:00Z`),
          source: ReminderSource.TEXT,
          parserMode: ReminderParserMode.LLM,
        })
      }

      const page1 = await repository.list({ limit: 2, offset: 0 })
      expect(page1).toHaveLength(2)
      expect(page1[0].title).toBe('Reminder 0')
      expect(page1[1].title).toBe('Reminder 1')

      const page2 = await repository.list({ limit: 2, offset: 2 })
      expect(page2).toHaveLength(2)
      expect(page2[0].title).toBe('Reminder 2')
      expect(page2[1].title).toBe('Reminder 3')

      const page3 = await repository.list({ limit: 2, offset: 4 })
      expect(page3).toHaveLength(1)
      expect(page3[0].title).toBe('Reminder 4')
    })

    it('returns reminders with all fields populated', async () => {
      const input: ReminderInput = {
        title: 'Complete reminder',
        originalText: 'All fields',
        language: ReminderLanguage.RU,
        scheduledAt: new Date('2026-02-25T14:00:00Z'),
        source: ReminderSource.VOICE,
        parserMode: ReminderParserMode.LOCAL,
        parseConfidence: 0.92,
      }

      await repository.create(input)
      const reminders = await repository.list()

      expect(reminders).toHaveLength(1)
      const reminder = reminders[0]

      expect(reminder.id).toBeDefined()
      expect(reminder.title).toBe(input.title)
      expect(reminder.originalText).toBe(input.originalText)
      expect(reminder.language).toBe(input.language)
      expect(reminder.scheduledAt).toEqual(input.scheduledAt)
      expect(reminder.source).toBe(input.source)
      expect(reminder.parserMode).toBe(input.parserMode)
      expect(reminder.parseConfidence).toBe(input.parseConfidence)
    })
  })

  describe('listUpcoming', () => {
    it('returns only reminders scheduled at or after the provided date', async () => {
      const inputs: ReminderInput[] = [
        {
          title: 'Past',
          originalText: '1',
          language: ReminderLanguage.EN,
          scheduledAt: new Date('2026-02-25T10:00:00Z'),
          source: ReminderSource.TEXT,
          parserMode: ReminderParserMode.LLM,
        },
        {
          title: 'Present',
          originalText: '2',
          language: ReminderLanguage.EN,
          scheduledAt: new Date('2026-02-25T12:00:00Z'),
          source: ReminderSource.TEXT,
          parserMode: ReminderParserMode.LLM,
        },
        {
          title: 'Future',
          originalText: '3',
          language: ReminderLanguage.EN,
          scheduledAt: new Date('2026-02-25T15:00:00Z'),
          source: ReminderSource.TEXT,
          parserMode: ReminderParserMode.LLM,
        },
      ]

      for (const input of inputs) {
        await repository.create(input)
      }

      // Query from "present"
      const upcoming = await repository.listUpcoming(new Date('2026-02-25T12:00:00Z'))

      expect(upcoming).toHaveLength(2)
      expect(upcoming[0].title).toBe('Present')
      expect(upcoming[1].title).toBe('Future')
    })
  })

  describe('SQL injection prevention', () => {
    it('handles malicious input in title safely', async () => {
      const maliciousTitle = "Test'; DROP TABLE reminders; --"
      const input: ReminderInput = {
        title: maliciousTitle,
        originalText: 'Test',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2026-02-25T12:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
      }

      const reminder = await repository.create(input)
      expect(reminder.title).toBe(maliciousTitle)

      // Verify table still exists and we can fetch the reminder
      const fetched = await repository.getById(reminder.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.title).toBe(maliciousTitle)
    })
  })

  describe('Error handling', () => {
    it('throws RepositoryError on database failure', async () => {
      // Close the database to simulate failure
      db.close()

      const input: ReminderInput = {
        title: 'Test',
        originalText: 'Test',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2026-02-25T12:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
      }

      await expect(repository.create(input)).rejects.toThrow()
    })
  })
})
