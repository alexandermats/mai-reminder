import { describe, it, expect } from 'vitest'
import {
  applyHourlyRecurrenceWindow,
  normalizeHourlyRecurrenceRule,
  isWithinHourlyWindow,
  snapToHourlyWindow,
} from '../src/utils/hourlyRecurrence'
import type { ParseResult } from '../src/parser/types'

function makeResult(rule: string | undefined, scheduledAt: Date): ParseResult {
  return {
    title: 'Test',
    scheduledAt,
    confidence: 0.8,
    usedMode: 'local',
    recurrenceRule: rule,
  }
}

describe('applyHourlyRecurrenceWindow', () => {
  it('keeps non-hourly recurrence untouched', () => {
    const input = makeResult('FREQ=DAILY', new Date(2026, 2, 1, 10, 0, 0))
    const output = applyHourlyRecurrenceWindow(
      input,
      new Date(2026, 2, 1, 10, 15, 0),
      '09:00',
      '22:00'
    )

    expect(output).toEqual(input)
  })

  it('normalizes hourly rule to simple RRULE without BYHOUR', () => {
    const input = makeResult('FREQ=HOURLY;INTERVAL=2', new Date(2026, 2, 1, 10, 0, 0))
    const now = new Date(2026, 2, 1, 10, 15, 0)
    const output = applyHourlyRecurrenceWindow(input, now, '09:00', '22:00')

    // RRULE should NOT contain BYHOUR — window is applied dynamically
    expect(output.recurrenceRule).toBe('FREQ=HOURLY;INTERVAL=2;BYMINUTE=0;BYSECOND=0')
    expect(output.recurrenceRule).not.toContain('BYHOUR')
    // scheduledAt should be next in-window slot after now
    expect(output.scheduledAt.getHours()).toBe(12)
    expect(output.scheduledAt.getMinutes()).toBe(0)
    expect(output.scheduledAt.getDate()).toBe(now.getDate())
  })

  it('preserves BYDAY when normalizing hourly rule', () => {
    const input = makeResult(
      'FREQ=HOURLY;INTERVAL=2;BYDAY=MO,WE,FR',
      new Date(2026, 2, 1, 10, 0, 0)
    )
    const now = new Date(2026, 2, 1, 10, 15, 0)
    const output = applyHourlyRecurrenceWindow(input, now, '09:00', '22:00')

    expect(output.recurrenceRule).toBe(
      'FREQ=HOURLY;INTERVAL=2;BYMINUTE=0;BYSECOND=0;BYDAY=MO,WE,FR'
    )
  })

  it('keeps selected future time when creating recurring reminder', () => {
    const selected = new Date(2026, 2, 1, 11, 37, 0)
    const input = makeResult('FREQ=HOURLY;INTERVAL=1', selected)
    const now = new Date(2026, 2, 1, 10, 15, 0)
    const output = applyHourlyRecurrenceWindow(input, now, '09:00', '22:00')

    expect(output.scheduledAt.getTime()).toBe(selected.getTime())
    // Simple RRULE with anchor minute, no BYHOUR
    expect(output.recurrenceRule).toBe('FREQ=HOURLY;INTERVAL=1;BYMINUTE=37;BYSECOND=0')
    expect(output.recurrenceRule).not.toContain('BYHOUR')
  })

  it('schedules first occurrence tomorrow when no future slot remains today', () => {
    const input = makeResult('FREQ=HOURLY;INTERVAL=2', new Date(2026, 2, 1, 10, 0, 0))
    const now = new Date(2026, 2, 1, 22, 30, 0)
    const output = applyHourlyRecurrenceWindow(input, now, '09:00', '22:00')

    expect(output.scheduledAt.getDate()).toBe(now.getDate() + 1)
    expect(output.scheduledAt.getHours()).toBe(10)
    expect(output.scheduledAt.getMinutes()).toBe(0)
  })
})

describe('normalizeHourlyRecurrenceRule', () => {
  it('builds simple RRULE with anchor minute, no BYHOUR', () => {
    const rule = 'FREQ=HOURLY;INTERVAL=3'
    const normalized = normalizeHourlyRecurrenceRule(
      rule,
      new Date(2026, 2, 1, 11, 15, 0),
      '09:00',
      '22:00'
    )

    expect(normalized).toBe('FREQ=HOURLY;INTERVAL=3;BYMINUTE=15;BYSECOND=0')
    expect(normalized).not.toContain('BYHOUR')
  })

  it('preserves BYDAY through normalization', () => {
    const rule = 'FREQ=HOURLY;INTERVAL=3;BYDAY=SA,SU'
    const normalized = normalizeHourlyRecurrenceRule(
      rule,
      new Date(2026, 2, 1, 11, 15, 0),
      '09:00',
      '22:00'
    )

    expect(normalized).toBe('FREQ=HOURLY;INTERVAL=3;BYMINUTE=15;BYSECOND=0;BYDAY=SA,SU')
  })
})

describe('isWithinHourlyWindow', () => {
  it('returns true when time is inside window', () => {
    const date = new Date(2026, 2, 1, 14, 30, 0)
    expect(isWithinHourlyWindow(date, '09:00', '22:00')).toBe(true)
  })

  it('returns false when time is before window start', () => {
    const date = new Date(2026, 2, 1, 7, 0, 0)
    expect(isWithinHourlyWindow(date, '09:00', '22:00')).toBe(false)
  })

  it('returns false when time is after window end', () => {
    const date = new Date(2026, 2, 1, 23, 0, 0)
    expect(isWithinHourlyWindow(date, '09:00', '22:00')).toBe(false)
  })

  it('returns true at exact window boundaries', () => {
    expect(isWithinHourlyWindow(new Date(2026, 2, 1, 9, 0, 0), '09:00', '22:00')).toBe(true)
    expect(isWithinHourlyWindow(new Date(2026, 2, 1, 22, 0, 0), '09:00', '22:00')).toBe(true)
  })

  // Day-rollover window tests (e.g., 09:00–02:00 crossing midnight)
  it('returns true for evening time in day-rollover window', () => {
    expect(isWithinHourlyWindow(new Date(2026, 2, 1, 23, 0, 0), '09:00', '02:00')).toBe(true)
  })

  it('returns true for early morning time in day-rollover window', () => {
    expect(isWithinHourlyWindow(new Date(2026, 2, 1, 1, 30, 0), '09:00', '02:00')).toBe(true)
  })

  it('returns false for time in gap of day-rollover window', () => {
    expect(isWithinHourlyWindow(new Date(2026, 2, 1, 5, 0, 0), '09:00', '02:00')).toBe(false)
    expect(isWithinHourlyWindow(new Date(2026, 2, 1, 8, 0, 0), '09:00', '02:00')).toBe(false)
  })

  it('returns true at boundaries of day-rollover window', () => {
    expect(isWithinHourlyWindow(new Date(2026, 2, 1, 9, 0, 0), '09:00', '02:00')).toBe(true)
    expect(isWithinHourlyWindow(new Date(2026, 2, 1, 2, 0, 0), '09:00', '02:00')).toBe(true)
  })
})

describe('snapToHourlyWindow', () => {
  it('returns same date if already inside window', () => {
    const date = new Date(2026, 2, 1, 14, 30, 0)
    const result = snapToHourlyWindow(date, '09:00', '22:00', 2)
    expect(result.getTime()).toBe(date.getTime())
  })

  it('snaps forward to next in-window slot when outside', () => {
    const date = new Date(2026, 2, 1, 23, 30, 0)
    const result = snapToHourlyWindow(date, '09:00', '22:00', 2)
    // Should snap to 9:30 or similar next-day in-window slot
    expect(result.getHours()).toBeGreaterThanOrEqual(9)
    expect(result.getHours()).toBeLessThanOrEqual(22)
    expect(result.getDate()).toBe(date.getDate() + 1)
  })

  it('returns same date if inside day-rollover window', () => {
    const date = new Date(2026, 2, 1, 1, 0, 0)
    const result = snapToHourlyWindow(date, '09:00', '02:00', 2)
    expect(result.getTime()).toBe(date.getTime())
  })

  it('snaps to start of window for time in gap of day-rollover window', () => {
    const date = new Date(2026, 2, 1, 5, 0, 0)
    const result = snapToHourlyWindow(date, '09:00', '02:00', 2)
    expect(result.getHours()).toBeGreaterThanOrEqual(9)
    expect(result.getDate()).toBe(date.getDate())
  })
})
