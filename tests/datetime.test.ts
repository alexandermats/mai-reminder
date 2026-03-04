import { describe, it, expect } from 'vitest'
import {
  toUTCString,
  fromUTCString,
  toDisplayString,
  isValidDate,
  compareUTCDates,
} from '../src/utils/datetime'

describe('datetime utilities', () => {
  describe('toUTCString', () => {
    it('converts local Date to ISO-8601 UTC string with Z suffix', () => {
      // Create a date at a known UTC time
      const date = new Date('2026-02-25T15:30:00Z')
      const result = toUTCString(date)

      expect(result).toBe('2026-02-25T15:30:00.000Z')
      expect(result.endsWith('Z')).toBe(true)
    })

    it('converts local midnight to UTC correctly', () => {
      const localMidnight = new Date('2026-02-25T00:00:00')
      const result = toUTCString(localMidnight)

      // The result should be a valid ISO string with Z suffix
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(result.endsWith('Z')).toBe(true)
    })

    it('handles dates near midnight UTC', () => {
      // Just before midnight UTC
      const beforeMidnight = new Date('2026-02-25T23:59:59.999Z')
      const result = toUTCString(beforeMidnight)

      expect(result).toBe('2026-02-25T23:59:59.999Z')

      // Just after midnight UTC
      const afterMidnight = new Date('2026-02-26T00:00:00.001Z')
      const result2 = toUTCString(afterMidnight)

      expect(result2).toBe('2026-02-26T00:00:00.001Z')
    })

    it('throws for invalid Date', () => {
      const invalidDate = new Date('invalid')
      expect(() => toUTCString(invalidDate)).toThrow('Invalid date')
    })

    it('handles DST spring forward transition', () => {
      // US DST starts March 8, 2026 at 2:00 AM -> 3:00 AM
      const beforeDST = new Date('2026-03-08T06:00:00Z') // 1:00 AM EST
      const result = toUTCString(beforeDST)

      expect(result).toBe('2026-03-08T06:00:00.000Z')
    })

    it('handles DST fall back transition', () => {
      // US DST ends November 1, 2026 at 2:00 AM -> 1:00 AM
      const duringDST = new Date('2026-11-01T05:00:00Z') // 1:00 AM EDT
      const result = toUTCString(duringDST)

      expect(result).toBe('2026-11-01T05:00:00.000Z')
    })
  })

  describe('fromUTCString', () => {
    it('parses ISO-8601 UTC string to Date', () => {
      const utcString = '2026-02-25T15:30:00.000Z'
      const result = fromUTCString(utcString)

      expect(result).toBeInstanceOf(Date)
      expect(result.toISOString()).toBe(utcString)
    })

    it('parses dates near midnight UTC', () => {
      const beforeMidnight = '2026-02-25T23:59:59.999Z'
      const result = fromUTCString(beforeMidnight)

      expect(result.toISOString()).toBe(beforeMidnight)
    })

    it('throws for invalid ISO string', () => {
      expect(() => fromUTCString('invalid')).toThrow('Invalid UTC date string')
      expect(() => fromUTCString('')).toThrow('Invalid UTC date string')
    })

    it('throws for non-UTC strings without Z suffix', () => {
      // This should be rejected as it's not in UTC format
      expect(() => fromUTCString('2026-02-25T15:30:00')).toThrow(
        'Invalid UTC date string: must end with Z'
      )
      expect(() => fromUTCString('2026-02-25T15:30:00+05:00')).toThrow(
        'Invalid UTC date string: must end with Z'
      )
    })
  })

  describe('toDisplayString', () => {
    it('formats UTC Date to local display string', () => {
      const utcDate = new Date('2026-02-25T15:30:00Z')
      const result = toDisplayString(utcDate)

      // Should be a non-empty string (actual format depends on locale)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('includes date components in display', () => {
      const utcDate = new Date('2026-02-25T15:30:00Z')
      const result = toDisplayString(utcDate)

      // Should contain year, month, day somewhere in the string
      expect(result).toMatch(/2026/)
      expect(result).toMatch(/25/)
    })

    it('includes time components in display', () => {
      const utcDate = new Date('2026-02-25T15:30:00Z')
      const result = toDisplayString(utcDate)

      // Should contain time indicators
      expect(result).toMatch(/\d{1,2}/) // at least one number for time
    })

    it('throws for invalid Date', () => {
      const invalidDate = new Date('invalid')
      expect(() => toDisplayString(invalidDate)).toThrow('Invalid date')
    })
  })

  describe('isValidDate', () => {
    it('returns true for valid Date objects', () => {
      expect(isValidDate(new Date())).toBe(true)
      expect(isValidDate(new Date('2026-02-25'))).toBe(true)
      expect(isValidDate(new Date(0))).toBe(true)
    })

    it('returns false for invalid Date objects', () => {
      expect(isValidDate(new Date('invalid'))).toBe(false)
      expect(isValidDate(new Date(''))).toBe(false)
    })

    it('returns false for non-Date values', () => {
      expect(isValidDate(null)).toBe(false)
      expect(isValidDate(undefined)).toBe(false)
      expect(isValidDate('2026-02-25')).toBe(false)
      expect(isValidDate(1234567890)).toBe(false)
      expect(isValidDate({})).toBe(false)
    })
  })

  describe('compareUTCDates', () => {
    it('returns negative when first date is earlier', () => {
      const date1 = new Date('2026-02-25T10:00:00Z')
      const date2 = new Date('2026-02-25T15:00:00Z')

      expect(compareUTCDates(date1, date2)).toBeLessThan(0)
    })

    it('returns positive when first date is later', () => {
      const date1 = new Date('2026-02-25T15:00:00Z')
      const date2 = new Date('2026-02-25T10:00:00Z')

      expect(compareUTCDates(date1, date2)).toBeGreaterThan(0)
    })

    it('returns zero when dates are equal', () => {
      const date1 = new Date('2026-02-25T15:00:00Z')
      const date2 = new Date('2026-02-25T15:00:00Z')

      expect(compareUTCDates(date1, date2)).toBe(0)
    })

    it('handles millisecond precision', () => {
      const date1 = new Date('2026-02-25T15:00:00.000Z')
      const date2 = new Date('2026-02-25T15:00:00.001Z')

      expect(compareUTCDates(date1, date2)).toBeLessThan(0)
      expect(compareUTCDates(date2, date1)).toBeGreaterThan(0)
    })

    it('throws for invalid dates', () => {
      const valid = new Date('2026-02-25T15:00:00Z')
      const invalid = new Date('invalid')

      expect(() => compareUTCDates(valid, invalid)).toThrow('Invalid date')
      expect(() => compareUTCDates(invalid, valid)).toThrow('Invalid date')
    })
  })

  describe('round-trip consistency', () => {
    it('preserves UTC time through store and retrieve', () => {
      const original = new Date('2026-02-25T15:30:45.123Z')

      // Simulate storage (to UTC string)
      const stored = toUTCString(original)

      // Simulate retrieval (from UTC string)
      const retrieved = fromUTCString(stored)

      // Should be exactly equal
      expect(retrieved.getTime()).toBe(original.getTime())
      expect(retrieved.toISOString()).toBe(original.toISOString())
    })

    it('handles various UTC times correctly', () => {
      const testCases = [
        '2026-01-01T00:00:00.000Z', // Start of year
        '2026-06-15T12:30:45.000Z', // Mid year
        '2026-12-31T23:59:59.999Z', // End of year
        '2026-03-08T07:00:00.000Z', // During DST spring forward
        '2026-11-01T06:00:00.000Z', // During DST fall back
      ]

      for (const utcString of testCases) {
        const date = new Date(utcString)
        const stored = toUTCString(date)
        const retrieved = fromUTCString(stored)

        expect(retrieved.toISOString()).toBe(utcString)
      }
    })
  })

  describe('scheduling comparison', () => {
    it('correctly identifies past reminders using UTC comparison', () => {
      const now = new Date('2026-02-25T15:00:00Z')
      const pastReminder = new Date('2026-02-25T14:00:00Z')
      const futureReminder = new Date('2026-02-25T16:00:00Z')

      expect(compareUTCDates(pastReminder, now)).toBeLessThan(0)
      expect(compareUTCDates(futureReminder, now)).toBeGreaterThan(0)
    })

    it('handles same-moment comparisons correctly', () => {
      const moment1 = new Date('2026-02-25T15:00:00.000Z')
      const moment2 = new Date('2026-02-25T15:00:00.000Z')

      expect(compareUTCDates(moment1, moment2)).toBe(0)
    })
  })
})
