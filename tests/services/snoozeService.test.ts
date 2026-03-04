import { describe, it, expect } from 'vitest'
import {
  SNOOZE_DURATIONS_MS,
  SNOOZE_ACTION_TO_MS,
  calcSnoozedAt,
} from '../../src/services/snoozeService'

describe('snoozeService', () => {
  describe('SNOOZE_DURATIONS_MS', () => {
    it('SNOOZE_15_MIN is 900 000 ms', () => {
      expect(SNOOZE_DURATIONS_MS.SNOOZE_15_MIN).toBe(900_000)
    })

    it('SNOOZE_1_H is 3 600 000 ms', () => {
      expect(SNOOZE_DURATIONS_MS.SNOOZE_1_H).toBe(3_600_000)
    })

    it('SNOOZE_1_DAY is 86 400 000 ms', () => {
      expect(SNOOZE_DURATIONS_MS.SNOOZE_1_DAY).toBe(86_400_000)
    })
  })

  describe('SNOOZE_ACTION_TO_MS', () => {
    it('maps snooze-15m to SNOOZE_15_MIN', () => {
      expect(SNOOZE_ACTION_TO_MS['snooze-15m']).toBe(SNOOZE_DURATIONS_MS.SNOOZE_15_MIN)
    })

    it('maps snooze-1h to SNOOZE_1_H', () => {
      expect(SNOOZE_ACTION_TO_MS['snooze-1h']).toBe(SNOOZE_DURATIONS_MS.SNOOZE_1_H)
    })

    it('maps snooze-1d to SNOOZE_1_DAY', () => {
      expect(SNOOZE_ACTION_TO_MS['snooze-1d']).toBe(SNOOZE_DURATIONS_MS.SNOOZE_1_DAY)
    })
  })

  describe('calcSnoozedAt', () => {
    it('adds the correct duration to the base date', () => {
      const base = new Date('2026-03-01T10:00:00.000Z')
      const result = calcSnoozedAt(base, SNOOZE_DURATIONS_MS.SNOOZE_15_MIN)
      expect(result).toEqual(new Date('2026-03-01T10:15:00.000Z'))
    })

    it('returns a new Date object (not mutating original)', () => {
      const base = new Date('2026-03-01T10:00:00.000Z')
      const result = calcSnoozedAt(base, SNOOZE_DURATIONS_MS.SNOOZE_1_H)
      expect(result).not.toBe(base)
      expect(base.toISOString()).toBe('2026-03-01T10:00:00.000Z')
    })

    it('correctly adds 1 day', () => {
      const base = new Date('2026-03-01T10:00:00.000Z')
      const result = calcSnoozedAt(base, SNOOZE_DURATIONS_MS.SNOOZE_1_DAY)
      expect(result).toEqual(new Date('2026-03-02T10:00:00.000Z'))
    })
  })
})
