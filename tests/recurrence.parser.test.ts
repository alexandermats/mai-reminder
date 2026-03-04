import { describe, it, expect } from 'vitest'
import { parseRecurrence } from '../src/parser/recurrenceParser'
import { normalizeRRule } from '../src/parser/rrule'

describe('recurrence parser', () => {
  describe('English phrases', () => {
    it('parses "every Monday"', () => {
      const result = parseRecurrence('Workout every Monday at 7am', 'en')
      expect(result?.rule).toBe('FREQ=WEEKLY;BYDAY=MO')
    })

    it('parses "every weekday"', () => {
      const result = parseRecurrence('Read every weekday at 6pm', 'en')
      expect(result?.rule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    })

    it('parses "every 2 hours"', () => {
      const result = parseRecurrence('Stand up every 2 hours', 'en')
      expect(result?.rule).toBe('FREQ=HOURLY;INTERVAL=2')
    })

    it('parses "every month"', () => {
      const result = parseRecurrence('Pay rent every month at 9am', 'en')
      expect(result?.rule).toBe('FREQ=MONTHLY')
    })
  })

  describe('Russian phrases', () => {
    it('parses "каждый понедельник"', () => {
      const result = parseRecurrence('Тренировка каждый понедельник в 07:00', 'ru')
      expect(result?.rule).toBe('FREQ=WEEKLY;BYDAY=MO')
    })

    it('parses "по будням"', () => {
      const result = parseRecurrence('Читать по будням в 18:00', 'ru')
      expect(result?.rule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    })

    it('parses "каждые 2 часа"', () => {
      const result = parseRecurrence('Пить воду каждые 2 часа', 'ru')
      expect(result?.rule).toBe('FREQ=HOURLY;INTERVAL=2')
    })

    it('parses "каждый месяц"', () => {
      const result = parseRecurrence('Платить аренду каждый месяц', 'ru')
      expect(result?.rule).toBe('FREQ=MONTHLY')
    })
  })
})

describe('rrule normalization', () => {
  it('normalizes RRULE prefix away', () => {
    expect(normalizeRRule('RRULE:FREQ=WEEKLY;BYDAY=MO')).toBe('FREQ=WEEKLY;BYDAY=MO')
  })

  it('returns undefined for invalid rules', () => {
    expect(normalizeRRule('every monday forever')).toBeUndefined()
  })
})
