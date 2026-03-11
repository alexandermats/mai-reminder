import { RRule } from 'rrule'
import type { ParseResult } from '../parser/types'

export const DEFAULT_HOURLY_WINDOW_START = '09:00'
export const DEFAULT_HOURLY_WINDOW_END = '22:00'

interface TimeParts {
  hour: number
  minute: number
}

function parseTime(value: string, fallback: string): TimeParts {
  const source = /^\d{2}:\d{2}$/.test(value) ? value : fallback
  const [h, m] = source.split(':').map((x) => Number(x))
  const hour = Number.isInteger(h) ? Math.min(23, Math.max(0, h)) : 0
  const minute = Number.isInteger(m) ? Math.min(59, Math.max(0, m)) : 0
  return { hour, minute }
}

function parseHourlyInterval(rule: string): number | null {
  const normalized = rule.replace(/^RRULE:/i, '').toUpperCase()
  if (!normalized.includes('FREQ=HOURLY')) {
    return null
  }

  const intervalMatch = normalized.match(/(?:^|;)INTERVAL=(\d+)(?:;|$)/)
  if (!intervalMatch) {
    return 1
  }

  const interval = Number(intervalMatch[1])
  if (!Number.isInteger(interval) || interval <= 0) {
    return null
  }
  return interval
}

function parseHourlyByweekday(rule: string): number[] | null {
  const normalized = rule.replace(/^RRULE:/i, '').toUpperCase()
  if (!normalized.includes('FREQ=HOURLY')) {
    return null
  }
  const bydayMatch = normalized.match(/(?:^|;)BYDAY=([^;]+)(?:;|$)/)
  if (!bydayMatch) return null

  const days = bydayMatch[1].split(',')
  const dayMap = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
  const parsed = days.map((d) => dayMap.indexOf(d.trim())).filter((idx) => idx !== -1)
  return parsed.length > 0 ? parsed : null
}

function buildAllowedHours(
  interval: number,
  startHour: number,
  endHour: number,
  anchorHour?: number,
  anchorMinute?: number,
  endMinute?: number
): number[] {
  let firstHour = startHour
  if (
    anchorHour !== undefined &&
    Number.isInteger(anchorHour) &&
    anchorHour >= startHour &&
    anchorHour <= endHour
  ) {
    const offset = (((anchorHour - startHour) % interval) + interval) % interval
    firstHour = startHour + offset
  }

  const hours: number[] = []
  for (let h = firstHour; h <= endHour; h += interval) {
    // If we're at the last hour, check if the minutes would exceed the end time
    if (h === endHour && anchorMinute !== undefined && endMinute !== undefined) {
      if (anchorMinute > endMinute) {
        continue
      }
    }
    hours.push(h)
  }
  return hours
}

function nextWindowDate(
  now: Date,
  start: TimeParts,
  end: TimeParts,
  interval: number,
  anchorHour?: number,
  anchorMinute?: number
): Date {
  const allowedHours = buildAllowedHours(
    interval,
    start.hour,
    end.hour,
    anchorHour,
    anchorMinute,
    end.minute
  )
  if (allowedHours.length === 0) {
    return new Date(now.getTime())
  }

  const minute =
    anchorMinute !== undefined && Number.isInteger(anchorMinute) && anchorMinute >= 0
      ? Math.min(59, Math.max(0, anchorMinute))
      : start.minute

  const todaySlots = allowedHours.map((hour) => {
    const slot = new Date(now.getTime())
    slot.setHours(hour, minute, 0, 0)
    return slot
  })

  const nextToday = todaySlots.find((slot) => slot.getTime() > now.getTime())
  if (nextToday) {
    return nextToday
  }

  const nextDay = new Date(now.getTime())
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(allowedHours[0], minute, 0, 0)
  return nextDay
}

export function buildHourlyRecurrenceRule(
  interval: number,
  _start: TimeParts,
  _end: TimeParts,
  _anchorHour?: number,
  anchorMinute?: number,
  byweekday?: number[] | null
): string {
  const minute =
    anchorMinute !== undefined && Number.isInteger(anchorMinute) && anchorMinute >= 0
      ? Math.min(59, Math.max(0, anchorMinute))
      : 0
  const options: Partial<import('rrule').Options> = {
    freq: RRule.HOURLY,
    interval,
    byminute: [minute],
    bysecond: [0],
  }

  if (byweekday && byweekday.length > 0) {
    options.byweekday = byweekday
  }

  return new RRule(options).toString().replace(/^RRULE:/, '')
}

export function normalizeHourlyRecurrenceRule(
  rule: string,
  anchorDate: Date,
  startTime: string,
  endTime: string
): string | undefined {
  const interval = parseHourlyInterval(rule)
  if (!interval) {
    return undefined
  }

  const byweekday = parseHourlyByweekday(rule)

  const start = parseTime(startTime, DEFAULT_HOURLY_WINDOW_START)
  const end = parseTime(endTime, DEFAULT_HOURLY_WINDOW_END)
  const safeEnd =
    end.hour < start.hour ? parseTime(DEFAULT_HOURLY_WINDOW_END, DEFAULT_HOURLY_WINDOW_END) : end
  const anchorHour = anchorDate.getHours()
  const anchorMinute = anchorDate.getMinutes()
  return buildHourlyRecurrenceRule(interval, start, safeEnd, anchorHour, anchorMinute, byweekday)
}

/**
 * Adjust the scheduled time and recurrence rule to fit within the configured window.
 * For hourly reminders, it snaps to the window and ensures the rule is canonical.
 * For other recurring reminders, it ensures the scheduledAt is in the future.
 */
export function applyRecurrenceSnapping(
  result: ParseResult,
  now: Date,
  startTime: string,
  endTime: string
): ParseResult {
  if (!result.recurrenceRule) {
    return result
  }

  const interval = parseHourlyInterval(result.recurrenceRule)
  if (!interval) {
    // For non-hourly recurring reminders, ensure scheduledAt is in the future
    if (result.scheduledAt.getTime() > now.getTime()) {
      return result
    }

    try {
      const parsedOptions = RRule.parseString(result.recurrenceRule.replace(/^RRULE:/i, ''))
      const rule = new RRule({
        ...parsedOptions,
        dtstart: result.scheduledAt,
      })
      const next = rule.after(now, false)
      if (next) {
        return {
          ...result,
          scheduledAt: next,
        }
      }
    } catch (e) {
      console.error('[applyRecurrenceSnapping] Failed to snap non-hourly rule:', e)
    }
    return result
  }

  const byweekday = parseHourlyByweekday(result.recurrenceRule)

  const start = parseTime(startTime, DEFAULT_HOURLY_WINDOW_START)
  const end = parseTime(endTime, DEFAULT_HOURLY_WINDOW_END)
  const safeEnd =
    end.hour < start.hour ? parseTime(DEFAULT_HOURLY_WINDOW_END, DEFAULT_HOURLY_WINDOW_END) : end
  const anchorHour = result.scheduledAt.getHours()
  const anchorMinute = result.scheduledAt.getMinutes()

  const scheduledAt =
    result.scheduledAt.getTime() > now.getTime()
      ? result.scheduledAt
      : nextWindowDate(now, start, safeEnd, interval, anchorHour, anchorMinute)
  const recurrenceRule = buildHourlyRecurrenceRule(
    interval,
    start,
    safeEnd,
    anchorHour,
    anchorMinute,
    byweekday
  )

  return {
    ...result,
    scheduledAt,
    recurrenceRule,
  }
}

/**
 * Check whether the given RRULE string is an hourly recurrence.
 */
export function isHourlyRule(rule: string | undefined): boolean {
  if (!rule) return false
  return parseHourlyInterval(rule) !== null
}

/**
 * Returns true when `date` falls within the hourly window defined by
 * `startTime` and `endTime` (both in "HH:MM" format).
 * Supports windows that cross midnight (e.g., start=09:00, end=02:00).
 */
export function isWithinHourlyWindow(date: Date, startTime: string, endTime: string): boolean {
  const start = parseTime(startTime, DEFAULT_HOURLY_WINDOW_START)
  const end = parseTime(endTime, DEFAULT_HOURLY_WINDOW_END)

  const h = date.getHours()
  const m = date.getMinutes()
  const timeMinutes = h * 60 + m
  const startMinutes = start.hour * 60 + start.minute
  const endMinutes = end.hour * 60 + end.minute

  if (endMinutes >= startMinutes) {
    // Normal window (e.g., 09:00–22:00): time must be between start and end
    return timeMinutes >= startMinutes && timeMinutes <= endMinutes
  } else {
    // Day-rollover window (e.g., 09:00–02:00): time is valid if >= start OR <= end
    return timeMinutes >= startMinutes || timeMinutes <= endMinutes
  }
}

/**
 * For a given `scheduledAt` that may fall outside the hourly window,
 * return the next valid in-window time. If already inside, returns the input.
 * Supports windows that cross midnight (e.g., start=09:00, end=02:00).
 */
export function snapToHourlyWindow(
  scheduledAt: Date,
  startTime: string,
  endTime: string,
  interval: number
): Date {
  if (isWithinHourlyWindow(scheduledAt, startTime, endTime)) {
    return scheduledAt
  }

  const start = parseTime(startTime, DEFAULT_HOURLY_WINDOW_START)
  const end = parseTime(endTime, DEFAULT_HOURLY_WINDOW_END)

  // For day-rollover windows (e.g. 09:00–02:00), if we're in the gap
  // (e.g. 03:00–08:59), the next valid time is the start hour today.
  // For normal windows, nextWindowDate handles it.
  const endMinutes = end.hour * 60 + end.minute
  const startMinutes = start.hour * 60 + start.minute
  const safeEnd = endMinutes < startMinutes ? { hour: 23, minute: 59 } : end
  const anchorMinute = scheduledAt.getMinutes()

  return nextWindowDate(scheduledAt, start, safeEnd, interval, undefined, anchorMinute)
}
