import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, runMigrations, type DatabaseConnection } from '../src/db/connection'
import { ElectronReminderRepository, RepositoryError } from '../src/db/electronReminderRepository'
import {
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
  ReminderStatus,
  type ReminderInput,
} from '../src/types/reminder'

describe('ReminderRepository - Update/Delete', () => {
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

  async function createTestReminder(overrides: Partial<ReminderInput> = {}) {
    const input: ReminderInput = {
      title: 'Test reminder',
      originalText: 'Remind me to test',
      language: ReminderLanguage.EN,
      scheduledAt: new Date('2026-02-25T15:00:00Z'),
      source: ReminderSource.TEXT,
      parserMode: ReminderParserMode.LLM,
      ...overrides,
    }
    return repository.create(input)
  }

  describe('update', () => {
    it('updates only provided fields', async () => {
      const reminder = await createTestReminder({
        title: 'Original title',
        originalText: 'Original text',
        scheduledAt: new Date('2026-02-25T10:00:00Z'),
      })

      const updated = await repository.update(reminder.id, {
        title: 'Updated title',
      })

      expect(updated.title).toBe('Updated title')
      expect(updated.originalText).toBe('Original text')
      expect(updated.scheduledAt.toISOString()).toBe('2026-02-25T10:00:00.000Z')
      expect(updated.id).toBe(reminder.id)
      expect(updated.createdAt).toEqual(reminder.createdAt)
    })

    it('updates multiple fields at once', async () => {
      const reminder = await createTestReminder({
        title: 'Original',
        scheduledAt: new Date('2026-02-25T10:00:00Z'),
        parseConfidence: 0.5,
      })

      const updated = await repository.update(reminder.id, {
        title: 'New title',
        scheduledAt: new Date('2026-02-26T12:00:00Z'),
        parseConfidence: 0.9,
      })

      expect(updated.title).toBe('New title')
      expect(updated.scheduledAt.toISOString()).toBe('2026-02-26T12:00:00.000Z')
      expect(updated.parseConfidence).toBe(0.9)
    })

    it('updates updatedAt timestamp', async () => {
      const reminder = await createTestReminder()
      const originalUpdatedAt = reminder.updatedAt

      // Small delay to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10))

      const updated = await repository.update(reminder.id, { title: 'Updated' })

      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })

    it('preserves createdAt timestamp', async () => {
      const reminder = await createTestReminder()
      const originalCreatedAt = reminder.createdAt

      const updated = await repository.update(reminder.id, { title: 'Updated' })

      expect(updated.createdAt).toEqual(originalCreatedAt)
    })

    it('persists update to the database', async () => {
      const reminder = await createTestReminder({ title: 'Original' })

      await repository.update(reminder.id, { title: 'Updated' })

      const fetched = await repository.getById(reminder.id)
      expect(fetched?.title).toBe('Updated')
    })

    it('throws RepositoryError for non-existent reminder', async () => {
      await expect(repository.update('non-existent-id', { title: 'Updated' })).rejects.toThrow(
        RepositoryError
      )
    })

    it('can clear parseConfidence by setting to undefined', async () => {
      const reminder = await createTestReminder({ parseConfidence: 0.8 })
      expect(reminder.parseConfidence).toBe(0.8)

      const updated = await repository.update(reminder.id, {
        parseConfidence: undefined,
      })

      expect(updated.parseConfidence).toBeUndefined()
    })

    it('updates recurrenceRule value', async () => {
      const reminder = await createTestReminder()

      const updated = await repository.update(reminder.id, {
        recurrenceRule: 'FREQ=DAILY;INTERVAL=2',
      })

      expect(updated.recurrenceRule).toBe('FREQ=DAILY;INTERVAL=2')
    })

    it('handles update with all fields', async () => {
      const reminder = await createTestReminder()

      const updated = await repository.update(reminder.id, {
        title: 'Completely updated',
        originalText: 'New original',
        language: ReminderLanguage.RU,
        scheduledAt: new Date('2026-03-01T10:00:00Z'),
        source: ReminderSource.VOICE,
        parserMode: ReminderParserMode.LOCAL,
        parseConfidence: 0.95,
      })

      expect(updated.title).toBe('Completely updated')
      expect(updated.originalText).toBe('New original')
      expect(updated.language).toBe(ReminderLanguage.RU)
      expect(updated.scheduledAt.toISOString()).toBe('2026-03-01T10:00:00.000Z')
      expect(updated.source).toBe(ReminderSource.VOICE)
      expect(updated.parserMode).toBe(ReminderParserMode.LOCAL)
      expect(updated.parseConfidence).toBe(0.95)
    })
  })

  describe('delete', () => {
    it('deletes existing reminder and returns true', async () => {
      const reminder = await createTestReminder()

      const result = await repository.delete(reminder.id)

      expect(result).toBe(true)
      const fetched = await repository.getById(reminder.id)
      expect(fetched).toBeNull()
    })

    it('returns false for non-existent reminder (idempotent)', async () => {
      const result = await repository.delete('non-existent-id')

      expect(result).toBe(false)
    })

    it('returns false when deleting same reminder twice', async () => {
      const reminder = await createTestReminder()

      const result1 = await repository.delete(reminder.id)
      const result2 = await repository.delete(reminder.id)

      expect(result1).toBe(true)
      expect(result2).toBe(false)
    })

    it('only deletes the specified reminder', async () => {
      const reminder1 = await createTestReminder({ title: 'First' })
      const reminder2 = await createTestReminder({ title: 'Second' })
      const reminder3 = await createTestReminder({ title: 'Third' })

      await repository.delete(reminder2.id)

      expect(await repository.getById(reminder1.id)).not.toBeNull()
      expect(await repository.getById(reminder2.id)).toBeNull()
      expect(await repository.getById(reminder3.id)).not.toBeNull()
    })

    it('removes reminder from list results', async () => {
      const reminder1 = await createTestReminder({
        title: 'First',
        scheduledAt: new Date('2026-02-25T10:00:00Z'),
      })
      const reminder2 = await createTestReminder({
        title: 'Second',
        scheduledAt: new Date('2026-02-25T11:00:00Z'),
      })

      let list = await repository.list()
      expect(list).toHaveLength(2)

      await repository.delete(reminder1.id)

      list = await repository.list()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(reminder2.id)
    })
  })

  describe('full CRUD flow', () => {
    it('supports complete create-read-update-delete cycle', async () => {
      // Create
      const created = await createTestReminder({ title: 'Original' })
      expect(created.title).toBe('Original')

      // Read
      const fetched = await repository.getById(created.id)
      expect(fetched?.title).toBe('Original')

      // Update
      const updated = await repository.update(created.id, { title: 'Updated' })
      expect(updated.title).toBe('Updated')

      // Verify update persisted
      const refetched = await repository.getById(created.id)
      expect(refetched?.title).toBe('Updated')

      // Delete
      const deleted = await repository.delete(created.id)
      expect(deleted).toBe(true)

      // Verify deletion
      const gone = await repository.getById(created.id)
      expect(gone).toBeNull()
    })
  })

  describe('clearOldReminders', () => {
    it('removes both sent and cancelled reminders when includeSent is true', async () => {
      await createTestReminder({ title: 'Sent', status: ReminderStatus.SENT })
      await createTestReminder({ title: 'Cancelled', status: ReminderStatus.CANCELLED })
      await createTestReminder({ title: 'Pending', status: ReminderStatus.PENDING })

      const deletedCount = await repository.clearOldReminders(true)

      expect(deletedCount).toBe(2)
      const reminders = await repository.list()
      expect(reminders).toHaveLength(1)
      expect(reminders[0].title).toBe('Pending')
    })

    it('removes only cancelled reminders and preserves sent ones when includeSent is false', async () => {
      await createTestReminder({ title: 'Sent', status: ReminderStatus.SENT })
      await createTestReminder({ title: 'Cancelled', status: ReminderStatus.CANCELLED })
      await createTestReminder({ title: 'Pending', status: ReminderStatus.PENDING })

      const deletedCount = await repository.clearOldReminders(false)

      expect(deletedCount).toBe(1)
      const reminders = await repository.list()
      expect(reminders).toHaveLength(2)
      const titles = reminders.map((r) => r.title)
      expect(titles).toContain('Sent')
      expect(titles).toContain('Pending')
      expect(titles).not.toContain('Cancelled')
    })

    it('returns 0 if no reminders match the criteria', async () => {
      await createTestReminder({ title: 'Pending', status: ReminderStatus.PENDING })

      const deletedCount = await repository.clearOldReminders(true)

      expect(deletedCount).toBe(0)
      const reminders = await repository.list()
      expect(reminders).toHaveLength(1)
    })
  })
})
