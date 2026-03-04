/**
 * Snooze duration constants and helpers for notification action buttons (E15-01).
 */

export const SNOOZE_DURATIONS_MS = {
  SNOOZE_15_MIN: 15 * 60 * 1000,
  SNOOZE_1_H: 60 * 60 * 1000,
  SNOOZE_1_DAY: 24 * 60 * 60 * 1000,
} as const

export type SnoozeAction = 'snooze-15m' | 'snooze-1h' | 'snooze-1d' | 'dismiss'

/** Map from SnoozeAction identifier to duration in milliseconds. */
export const SNOOZE_ACTION_TO_MS: Readonly<Record<Exclude<SnoozeAction, 'dismiss'>, number>> = {
  'snooze-15m': SNOOZE_DURATIONS_MS.SNOOZE_15_MIN,
  'snooze-1h': SNOOZE_DURATIONS_MS.SNOOZE_1_H,
  'snooze-1d': SNOOZE_DURATIONS_MS.SNOOZE_1_DAY,
}

/**
 * Calculate a future Date by adding `durationMs` milliseconds to `base`.
 */
export function calcSnoozedAt(base: Date, durationMs: number): Date {
  return new Date(base.getTime() + durationMs)
}
