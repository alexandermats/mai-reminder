import { describe, expect, it } from 'vitest'
import { getReminderSeriesBaseId } from '../../src/utils/reminderSeries'

describe('getReminderSeriesBaseId', () => {
  it('returns id unchanged for canonical ids', () => {
    expect(getReminderSeriesBaseId('abc-123')).toBe('abc-123')
  })

  it('strips generated next suffix', () => {
    expect(getReminderSeriesBaseId('abc-123-next-1772796900000')).toBe('abc-123')
  })

  it('strips generated missed suffix', () => {
    expect(getReminderSeriesBaseId('abc-123-missed-1772793660000')).toBe('abc-123')
  })

  it('strips chained generated suffixes', () => {
    expect(getReminderSeriesBaseId('abc-123-missed-1772793660000-next-1772796900000')).toBe(
      'abc-123'
    )
    expect(
      getReminderSeriesBaseId(
        'abc-123-missed-1772793300000-missed-1772793720000-next-1772797320000'
      )
    ).toBe('abc-123')
  })
})
