import { describe, it, expect, vi } from 'vitest'
import {
  ReminderLanguage,
  ReminderParserMode,
  ReminderSource,
  ReminderStatus,
  type Reminder,
} from '../../src/types/reminder'
import { applyTriggeredReminderTransition } from '../../src/services/reminderOccurrenceService'

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  const now = new Date('2026-03-01T09:00:00.000Z')
  return {
    id: 'recurring-1',
    title: 'Stand up',
    originalText: 'Stand up every hour',
    language: ReminderLanguage.EN,
    scheduledAt: new Date('2026-03-01T10:00:00.000Z'),
    source: ReminderSource.TEXT,
    parserMode: ReminderParserMode.LOCAL,
    status: ReminderStatus.PENDING,
    recurrenceRule: 'FREQ=HOURLY;INTERVAL=1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('applyTriggeredReminderTransition', () => {
  it('marks a non-recurring reminder as sent without creating a new one', async () => {
    const reminder = makeReminder({ recurrenceRule: undefined })
    const update = vi.fn().mockResolvedValue({ ...reminder, status: ReminderStatus.SENT })
    const create = vi.fn()

    const result = await applyTriggeredReminderTransition(reminder, { update, create })

    expect(update).toHaveBeenCalledWith(
      reminder.id,
      expect.objectContaining({ status: ReminderStatus.SENT })
    )
    expect(create).not.toHaveBeenCalled()
    expect(result.nextReminder).toBeUndefined()
    expect(result.sentReminder.status).toBe(ReminderStatus.SENT)
  })

  it('marks a recurring reminder as sent and creates the next occurrence', async () => {
    const reminder = makeReminder()
    const nextScheduledAt = new Date('2026-03-01T11:00:00.000Z')
    const update = vi.fn().mockResolvedValue({ ...reminder, status: ReminderStatus.SENT })
    const create = vi.fn().mockResolvedValue({
      ...reminder,
      id: 'recurring-1-next',
      scheduledAt: nextScheduledAt,
      status: ReminderStatus.PENDING,
    })

    const result = await applyTriggeredReminderTransition(reminder, { update, create })

    expect(create).toHaveBeenCalledWith({
      id: `recurring-1-next-${nextScheduledAt.getTime()}`,
      title: reminder.title,
      originalText: reminder.originalText,
      language: reminder.language,
      scheduledAt: nextScheduledAt,
      source: reminder.source,
      parserMode: reminder.parserMode,
      status: ReminderStatus.PENDING,
      recurrenceRule: reminder.recurrenceRule,
    })
    expect(result.nextReminder?.id).toBe('recurring-1-next')
  })

  it('supports overriding sent scheduledAt and suppressing sync triggers', async () => {
    const reminder = makeReminder()
    const nextScheduledAt = new Date('2026-03-01T11:00:00.000Z')
    const sentScheduledAt = new Date('2026-03-01T10:30:00.000Z')
    const update = vi.fn().mockResolvedValue({
      ...reminder,
      status: ReminderStatus.SENT,
      scheduledAt: sentScheduledAt,
    })
    const create = vi.fn().mockResolvedValue({
      ...reminder,
      id: `recurring-1-next-${nextScheduledAt.getTime()}`,
      scheduledAt: nextScheduledAt,
      status: ReminderStatus.PENDING,
    })

    await applyTriggeredReminderTransition(
      reminder,
      { update, create },
      nextScheduledAt,
      sentScheduledAt,
      true
    )

    expect(update).toHaveBeenCalledWith(
      reminder.id,
      expect.objectContaining({
        status: ReminderStatus.SENT,
        scheduledAt: sentScheduledAt,
        _isSync: true,
      })
    )
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ _isSync: true }))
  })

  it('creates next occurrence from canonical series id when current id contains generated suffixes', async () => {
    const reminder = makeReminder({
      id: 'recurring-1-missed-1772793300000',
      scheduledAt: new Date('2026-03-01T10:00:00.000Z'),
    })
    const nextScheduledAt = new Date('2026-03-01T11:00:00.000Z')
    const update = vi.fn().mockResolvedValue({ ...reminder, status: ReminderStatus.SENT })
    const create = vi.fn().mockResolvedValue({
      ...reminder,
      id: `recurring-1-next-${nextScheduledAt.getTime()}`,
      scheduledAt: nextScheduledAt,
      status: ReminderStatus.PENDING,
    })

    await applyTriggeredReminderTransition(reminder, { update, create }, nextScheduledAt)

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `recurring-1-next-${nextScheduledAt.getTime()}`,
      })
    )
  })
})
