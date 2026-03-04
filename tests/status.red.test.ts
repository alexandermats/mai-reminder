import { describe, it, expect } from 'vitest'
import {
  createReminder,
  isValidReminder,
  ReminderSource,
  ReminderParserMode,
  ReminderLanguage,
  ReminderStatus,
} from '../src/types/reminder'

describe('Reminder Status (Green Phase)', () => {
  const validInput = {
    title: 'Test reminder',
    originalText: 'Remind me to test tomorrow at 3pm',
    language: ReminderLanguage.EN,
    scheduledAt: new Date('2030-01-01T15:00:00Z'),
    source: ReminderSource.TEXT,
    parserMode: ReminderParserMode.LLM,
  }

  it('createReminder sets default status to PENDING', () => {
    const reminder = createReminder(validInput)
    expect(reminder.status).toBe(ReminderStatus.PENDING)
  })

  it('isValidReminder validates the status field', () => {
    const reminder = createReminder(validInput)
    // @ts-expect-error - Testing runtime validation with invalid string
    reminder.status = 'invalid_status'
    expect(isValidReminder(reminder)).toBe(false)
  })

  it('ReminderStatus enum has expected values', () => {
    expect(ReminderStatus.PENDING).toBe('pending')
    expect(ReminderStatus.SENT).toBe('sent')
    expect(ReminderStatus.CANCELLED).toBe('cancelled')
  })
})
