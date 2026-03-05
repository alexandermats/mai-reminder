import { describe, it, expect, beforeEach } from 'vitest'
import { ChronoLocalParser } from '../src/parser/localParser'
import type { ParseInput } from '../src/parser/types'
import { isParseFailureError } from '../src/parser/types'

describe('ChronoLocalParser (E2-03)', () => {
  // Pin reference date so all relative expressions are deterministic
  const REF_DATE = new Date('2026-02-23T10:00:00.000Z') // Mon 2026-02-23 10:00 UTC

  // ── Construction ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates a parser with a custom reference date', () => {
      expect(() => new ChronoLocalParser({ referenceDate: REF_DATE })).not.toThrow()
    })

    it('creates a parser without a reference date (defaults to now)', () => {
      expect(() => new ChronoLocalParser()).not.toThrow()
    })
  })

  // ── English expressions ─────────────────────────────────────────────────────

  describe('parse() – English phrases', () => {
    let parser: ChronoLocalParser

    beforeEach(() => {
      parser = new ChronoLocalParser({ referenceDate: REF_DATE })
    })

    it('parses "tomorrow at 3pm"', async () => {
      const input: ParseInput = { text: 'Call Jane tomorrow at 3pm', language: 'en' }
      const result = await parser.parse(input)

      expect(result.title).toBeTruthy()
      expect(result.scheduledAt).toBeInstanceOf(Date)
      expect(result.scheduledAt.getHours()).toBe(15) // chrono resolves wall-clock time in local timezone
      expect(result.usedMode).toBe('local')
    })

    it('parses "at six pm"', async () => {
      const input: ParseInput = { text: 'Remind me to go for a walk at six pm', language: 'en' }
      const result = await parser.parse(input)

      expect(result.scheduledAt).toBeInstanceOf(Date)
      expect(result.scheduledAt.getHours()).toBe(18)
      expect(result.scheduledAt.getMinutes()).toBe(0)
    })

    it('parses "at eleven thirty am"', async () => {
      const input: ParseInput = { text: 'take a break at eleven thirty am', language: 'en' }
      const result = await parser.parse(input)

      expect(result.scheduledAt).toBeInstanceOf(Date)
      expect(result.scheduledAt.getHours()).toBe(11)
      expect(result.scheduledAt.getMinutes()).toBe(30)
    })

    it('parses "in 2 hours"', async () => {
      const input: ParseInput = { text: 'remind me in 2 hours', language: 'en' }
      const result = await parser.parse(input)

      expect(result.scheduledAt).toBeInstanceOf(Date)
      // Should be approximately REF_DATE + 2 hours
      const expectedMs = REF_DATE.getTime() + 2 * 60 * 60 * 1000
      expect(Math.abs(result.scheduledAt.getTime() - expectedMs)).toBeLessThan(60 * 1000)
    })

    it('parses "next Tuesday"', async () => {
      const input: ParseInput = { text: 'Team meeting next Tuesday', language: 'en' }
      const result = await parser.parse(input)

      expect(result.scheduledAt).toBeInstanceOf(Date)
      // Next Tuesday from Mon Feb 23 is Tue Mar 03
      expect(result.scheduledAt.getUTCDay()).toBe(2) // Tuesday
    })

    it('extracts title by removing date fragment from text', async () => {
      const input: ParseInput = { text: 'Doctor appointment tomorrow at 3pm', language: 'en' }
      const result = await parser.parse(input)

      expect(result.title).toBeTruthy()
      expect(typeof result.title).toBe('string')
      expect(result.title.length).toBeGreaterThan(0)
    })

    it('uses referenceDate when provided', async () => {
      const customRef = new Date('2026-03-01T12:00:00.000Z')
      const customParser = new ChronoLocalParser({ referenceDate: customRef })
      const input: ParseInput = { text: 'meeting in 1 hour', language: 'en' }
      const result = await customParser.parse(input)

      // 1 hour after March 1 = March 1, 13:00:00 UTC
      const expectedMs = customRef.getTime() + 60 * 60 * 1000
      expect(Math.abs(result.scheduledAt.getTime() - expectedMs)).toBeLessThan(60 * 1000)
    })

    it('returns confidence between 0.0 and 1.0', async () => {
      const input: ParseInput = { text: 'dentist tomorrow at 10am', language: 'en' }
      const result = await parser.parse(input)

      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })

    it('returns usedMode "local"', async () => {
      const input: ParseInput = { text: 'remind me tonight at 8pm', language: 'en' }
      const result = await parser.parse(input)

      expect(result.usedMode).toBe('local')
    })

    it('extracts weekly recurrence rule from "every Monday"', async () => {
      const input: ParseInput = { text: 'Workout every Monday at 7am', language: 'en' }
      const result = await parser.parse(input)

      expect(result.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO')
    })

    it('extracts interval recurrence rule from "every 2 hours"', async () => {
      const input: ParseInput = { text: 'Drink water every 2 hours', language: 'en' }
      const result = await parser.parse(input)

      expect(result.recurrenceRule).toBe('FREQ=HOURLY;INTERVAL=2')
    })
  })

  // ── Russian expressions ─────────────────────────────────────────────────────

  describe('parse() – Russian phrases', () => {
    let parser: ChronoLocalParser

    beforeEach(() => {
      parser = new ChronoLocalParser({ referenceDate: REF_DATE })
    })

    it('parses "завтра в 15:00"', async () => {
      const input: ParseInput = { text: 'Напомни завтра в 15:00', language: 'ru' }
      const result = await parser.parse(input)

      expect(result.scheduledAt).toBeInstanceOf(Date)
      expect(result.scheduledAt.getHours()).toBe(15) // chrono resolves wall-clock time in local timezone
    })

    it('parses "через два часа"', async () => {
      const input: ParseInput = { text: 'позвонить через два часа', language: 'ru' }
      const result = await parser.parse(input)

      expect(result.scheduledAt).toBeInstanceOf(Date)
      const expectedMs = REF_DATE.getTime() + 2 * 60 * 60 * 1000
      expect(Math.abs(result.scheduledAt.getTime() - expectedMs)).toBeLessThan(60 * 1000)
    })

    it('parses "в шесть вечера" as 18:00', async () => {
      const input: ParseInput = { text: 'пойти на улицу в шесть вечера', language: 'ru' }
      const result = await parser.parse(input)

      expect(result.scheduledAt).toBeInstanceOf(Date)
      expect(result.scheduledAt.getHours()).toBe(18)
      expect(result.scheduledAt.getMinutes()).toBe(0)
    })

    it('parses "в следующий вторник"', async () => {
      const input: ParseInput = { text: 'встреча в следующий вторник', language: 'ru' }
      const result = await parser.parse(input)

      expect(result.scheduledAt).toBeInstanceOf(Date)
      expect(result.scheduledAt.getUTCDay()).toBe(2) // Tuesday
    })

    it('extracts weekly recurrence rule from "каждый понедельник"', async () => {
      const input: ParseInput = { text: 'Тренировка каждый понедельник в 07:00', language: 'ru' }
      const result = await parser.parse(input)

      expect(result.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO')
    })

    it('extracts interval recurrence rule from "каждые 2 часа"', async () => {
      const input: ParseInput = { text: 'Пить воду каждые 2 часа', language: 'ru' }
      const result = await parser.parse(input)

      expect(result.recurrenceRule).toBe('FREQ=HOURLY;INTERVAL=2')
    })
  })

  // ── Russian time-parsing bugs (E12-03) ──────────────────────────────────────

  describe('parse() – Russian time-parsing bugs (E12-03)', () => {
    let parser: ChronoLocalParser

    beforeEach(() => {
      parser = new ChronoLocalParser({ referenceDate: REF_DATE })
    })

    it('parses space-separated digits "в 14 55" as 14:55', async () => {
      const input: ParseInput = {
        text: 'напомни мне в 14 55 что у меня кофе',
        language: 'ru',
      }
      const result = await parser.parse(input)
      expect(result.scheduledAt.getHours()).toBe(14)
      expect(result.scheduledAt.getMinutes()).toBe(55)
    })

    it('parses fully spelled-out "четырнадцать пятьдесят пять" as 14:55', async () => {
      const input: ParseInput = {
        text: 'напомни в четырнадцать пятьдесят пять',
        language: 'ru',
      }
      const result = await parser.parse(input)
      expect(result.scheduledAt.getHours()).toBe(14)
      expect(result.scheduledAt.getMinutes()).toBe(55)
    })

    it('parses partially spelled-out "семь тридцать" as 7:30', async () => {
      const input: ParseInput = {
        text: 'встреча в семь тридцать',
        language: 'ru',
      }
      const result = await parser.parse(input)
      expect(result.scheduledAt.getHours()).toBe(7)
      expect(result.scheduledAt.getMinutes()).toBe(30)
    })

    it('parses "в 7 00" as 7:00', async () => {
      const input: ParseInput = {
        text: 'будильник в 7 00',
        language: 'ru',
      }
      const result = await parser.parse(input)
      expect(result.scheduledAt.getHours()).toBe(7)
      expect(result.scheduledAt.getMinutes()).toBe(0)
    })
  })

  // ── Unparsable text ─────────────────────────────────────────────────────────

  describe('parse() – unparsable text', () => {
    let parser: ChronoLocalParser

    beforeEach(() => {
      parser = new ChronoLocalParser({ referenceDate: REF_DATE })
    })

    it('throws ParseFailureError when no date found in text', async () => {
      const input: ParseInput = { text: 'remember to buy groceries', language: 'en' }
      await expect(parser.parse(input)).rejects.toSatisfy(isParseFailureError)
    })

    it('throws ParseFailureError for completely unparsable text', async () => {
      const input: ParseInput = { text: 'xyzzy foobar baz', language: 'en' }
      await expect(parser.parse(input)).rejects.toSatisfy(isParseFailureError)
    })

    it('throws ParseFailureError for empty text', async () => {
      const input: ParseInput = { text: '', language: 'en' }
      await expect(parser.parse(input)).rejects.toSatisfy(isParseFailureError)
    })
  })

  // ── Performance ─────────────────────────────────────────────────────────────

  describe('performance', () => {
    it('parses a phrase in under 500ms', async () => {
      const parser = new ChronoLocalParser({ referenceDate: REF_DATE })
      const input: ParseInput = { text: 'doctor Tuesday at 2pm', language: 'en' }

      const start = Date.now()
      await parser.parse(input)
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(500)
    })
  })
})
