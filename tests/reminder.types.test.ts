import { describe, it, expect } from 'vitest'
import {
  createReminder,
  isValidReminder,
  ReminderSource,
  ReminderParserMode,
  ReminderLanguage,
  ReminderStatus,
  type Reminder,
  type ReminderInput,
} from '../src/types/reminder'

describe('Reminder Types', () => {
  describe('Type exports', () => {
    it('exports ReminderSource enum values', () => {
      expect(ReminderSource.TEXT).toBe('text')
      expect(ReminderSource.VOICE).toBe('voice')
    })

    it('exports ReminderParserMode enum values', () => {
      expect(ReminderParserMode.LLM).toBe('llm')
      expect(ReminderParserMode.LOCAL).toBe('local')
    })

    it('exports ReminderLanguage enum values', () => {
      expect(ReminderLanguage.EN).toBe('en')
      expect(ReminderLanguage.RU).toBe('ru')
    })
  })

  describe('createReminder', () => {
    const validInput: ReminderInput = {
      title: 'Test reminder',
      originalText: 'Remind me to test tomorrow at 3pm',
      language: ReminderLanguage.EN,
      scheduledAt: new Date('2030-01-01T15:00:00Z'),
      source: ReminderSource.TEXT,
      parserMode: ReminderParserMode.LLM,
    }

    it('creates a reminder with all required fields', () => {
      const reminder = createReminder(validInput)

      expect(reminder.id).toBeDefined()
      expect(reminder.id).toMatch(/^[0-9a-f-]{36}$/i) // UUID format
      expect(reminder.title).toBe(validInput.title)
      expect(reminder.originalText).toBe(validInput.originalText)
      expect(reminder.language).toBe(validInput.language)
      expect(reminder.scheduledAt).toEqual(validInput.scheduledAt)
      expect(reminder.source).toBe(validInput.source)
      expect(reminder.parserMode).toBe(validInput.parserMode)
      expect(reminder.createdAt).toBeInstanceOf(Date)
      expect(reminder.updatedAt).toBeInstanceOf(Date)
      expect(reminder.priority).toBe(false) // Default value
    })

    it('accepts optional parseConfidence', () => {
      const reminder = createReminder({
        ...validInput,
        parseConfidence: 0.85,
      })

      expect(reminder.parseConfidence).toBe(0.85)
    })

    it('accepts optional priority', () => {
      const reminder = createReminder({
        ...validInput,
        priority: true,
      })

      expect(reminder.priority).toBe(true)
    })

    it('defaults parseConfidence to undefined when not provided', () => {
      const reminder = createReminder(validInput)

      expect(reminder.parseConfidence).toBeUndefined()
    })

    it('generates unique IDs for each reminder', () => {
      const reminder1 = createReminder(validInput)
      const reminder2 = createReminder(validInput)

      expect(reminder1.id).not.toBe(reminder2.id)
    })

    it('throws error for empty title', () => {
      expect(() =>
        createReminder({
          ...validInput,
          title: '',
        })
      ).toThrow('Title is required')
    })

    it('throws error for title with only whitespace', () => {
      expect(() =>
        createReminder({
          ...validInput,
          title: '   ',
        })
      ).toThrow('Title is required')
    })

    it('throws error for scheduledAt in the past', () => {
      const pastDate = new Date('2020-01-01T00:00:00Z')

      expect(() =>
        createReminder({
          ...validInput,
          scheduledAt: pastDate,
        })
      ).toThrow('Scheduled time must be in the future')
    })

    it('throws error for invalid language', () => {
      expect(() =>
        createReminder({
          ...validInput,
          language: 'fr' as ReminderLanguage,
        })
      ).toThrow('Invalid language')
    })

    it('throws error for invalid source', () => {
      expect(() =>
        createReminder({
          ...validInput,
          source: 'email' as ReminderSource,
        })
      ).toThrow('Invalid source')
    })

    it('throws error for invalid parser mode', () => {
      expect(() =>
        createReminder({
          ...validInput,
          parserMode: 'hybrid' as ReminderParserMode,
        })
      ).toThrow('Invalid parser mode')
    })

    it('allows scheduledAt to be exactly now (within 1 second tolerance)', () => {
      const now = new Date()

      expect(() =>
        createReminder({
          ...validInput,
          scheduledAt: now,
        })
      ).not.toThrow()
    })
  })

  describe('isValidReminder', () => {
    it('returns true for valid reminder object', () => {
      const reminder = createReminder({
        title: 'Test',
        originalText: 'Test text',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2030-01-01T15:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
      })

      expect(isValidReminder(reminder)).toBe(true)
    })

    it('returns false for null', () => {
      expect(isValidReminder(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isValidReminder(undefined)).toBe(false)
    })

    it('returns false for non-object', () => {
      expect(isValidReminder('string')).toBe(false)
      expect(isValidReminder(123)).toBe(false)
    })

    it('returns false when required fields are missing', () => {
      expect(isValidReminder({})).toBe(false)
      expect(isValidReminder({ id: '123' })).toBe(false)
    })

    it('returns false for invalid language value', () => {
      const reminder = createReminder({
        title: 'Test',
        originalText: 'Test text',
        language: ReminderLanguage.EN,
        scheduledAt: new Date('2030-01-01T15:00:00Z'),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
      })

      // @ts-expect-error - Testing runtime validation
      reminder.language = 'invalid'

      expect(isValidReminder(reminder)).toBe(false)
    })
  })

  describe('Reminder type structure', () => {
    it('matches Requirements.md data model', () => {
      const now = new Date()
      const future = new Date(now.getTime() + 86400000) // tomorrow

      const reminder: Reminder = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Doctor appointment',
        originalText: 'Remind me about doctor appointment tomorrow at 2pm',
        language: ReminderLanguage.EN,
        scheduledAt: future,
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
        status: ReminderStatus.PENDING,
        parseConfidence: 0.92,
        createdAt: now,
        updatedAt: now,
        priority: true,
      }

      // Verify all required fields from Requirements.md section 8
      expect(reminder).toHaveProperty('id')
      expect(reminder).toHaveProperty('title')
      expect(reminder).toHaveProperty('originalText')
      expect(reminder).toHaveProperty('language')
      expect(reminder).toHaveProperty('scheduledAt')
      expect(reminder).toHaveProperty('source')
      expect(reminder).toHaveProperty('parserMode')
      expect(reminder).toHaveProperty('parseConfidence')
      expect(reminder).toHaveProperty('createdAt')
      expect(reminder).toHaveProperty('updatedAt')
      expect(reminder).toHaveProperty('priority')

      // Verify types
      expect(typeof reminder.id).toBe('string')
      expect(typeof reminder.title).toBe('string')
      expect(typeof reminder.originalText).toBe('string')
      expect(typeof reminder.language).toBe('string')
      expect(reminder.scheduledAt).toBeInstanceOf(Date)
      expect(typeof reminder.source).toBe('string')
      expect(typeof reminder.parserMode).toBe('string')
      expect(typeof reminder.parseConfidence).toBe('number')
      expect(reminder.createdAt).toBeInstanceOf(Date)
      expect(reminder.updatedAt).toBeInstanceOf(Date)
      expect(typeof reminder.priority).toBe('boolean')
    })
  })
})
