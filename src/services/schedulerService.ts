import { RRule } from 'rrule'
import type { ReminderStatus } from '../types/reminder'
import { isHourlyRule, snapToHourlyWindow } from '../utils/hourlyRecurrence'

export interface SchedulerReminder {
  id: string
  title: string
  scheduledAt: Date
  status: ReminderStatus
  recurrenceRule?: string
}

export interface SeriesSchedulerReminder extends SchedulerReminder {
  seriesStartAt?: Date
}

function parseRule(reminder: SeriesSchedulerReminder): RRule | undefined {
  const recurrenceRule = reminder.recurrenceRule?.trim().replace(/^RRULE:/i, '')
  if (!recurrenceRule) {
    return undefined
  }

  try {
    const parsedOptions = RRule.parseString(recurrenceRule)
    return new RRule({
      ...parsedOptions,
      dtstart: reminder.seriesStartAt ?? reminder.scheduledAt,
    })
  } catch {
    return undefined
  }
}

export function getNextScheduledAt(reminder: SeriesSchedulerReminder): Date | undefined {
  const rule = parseRule(reminder)
  if (!rule) {
    return undefined
  }

  const next = rule.after(reminder.scheduledAt, false) ?? undefined
  if (!next) {
    return undefined
  }

  if (next.getTime() <= reminder.scheduledAt.getTime()) {
    return undefined
  }

  return next
}

export function alignRecurrenceRuleTime(rule: string, scheduledAt: Date): string {
  const recurrenceRule = rule.trim().replace(/^RRULE:/i, '')
  const parsedOptions = RRule.parseString(recurrenceRule)

  // For hourly rules, only align minute and second — do NOT touch byhour
  // because the window is applied dynamically at notification time.
  if (parsedOptions.freq === RRule.HOURLY) {
    const aligned = new RRule({
      ...parsedOptions,
      byminute: [scheduledAt.getMinutes()],
      bysecond: [scheduledAt.getSeconds()],
    })
    return aligned.toString().replace(/^RRULE:/, '')
  }

  const aligned = new RRule({
    ...parsedOptions,
    byhour: [scheduledAt.getHours()],
    byminute: [scheduledAt.getMinutes()],
    bysecond: [scheduledAt.getSeconds()],
  })
  return aligned.toString().replace(/^RRULE:/, '')
}

export function resolveNotificationScheduledAt(
  reminder: SeriesSchedulerReminder,
  now: Date = new Date()
): Date | undefined {
  if (!reminder.recurrenceRule || reminder.scheduledAt.getTime() > now.getTime()) {
    return reminder.scheduledAt
  }

  const rule = parseRule(reminder)
  if (!rule) {
    return reminder.scheduledAt
  }

  return rule.after(now, false) ?? undefined
}

/**
 * Resolve the latest occurrence at or before `now` for a reminder series.
 * For one-time reminders, returns scheduledAt when it is in the past.
 */
export function resolveLatestMissedScheduledAt(
  reminder: SeriesSchedulerReminder,
  now: Date = new Date()
): Date | undefined {
  if (reminder.scheduledAt.getTime() > now.getTime()) {
    return undefined
  }

  if (!reminder.recurrenceRule) {
    return reminder.scheduledAt
  }

  const rule = parseRule(reminder)
  if (!rule) {
    return reminder.scheduledAt
  }

  const latest = rule.before(now, true) ?? undefined
  if (!latest) {
    return reminder.scheduledAt
  }

  if (latest.getTime() < reminder.scheduledAt.getTime()) {
    return reminder.scheduledAt
  }

  return latest
}

/**
 * Resolve the notification time for an hourly-recurrence reminder,
 * snapping it into the configured hourly window.
 * For non-hourly rules, falls back to the standard resolution.
 */
export function resolveNotificationWindowedAt(
  reminder: SeriesSchedulerReminder,
  windowStart: string,
  windowEnd: string,
  now: Date = new Date()
): Date | undefined {
  // For non-hourly rules, use standard resolution
  if (!isHourlyRule(reminder.recurrenceRule)) {
    return resolveNotificationScheduledAt(reminder, now)
  }

  const base = resolveNotificationScheduledAt(reminder, now)
  if (!base) return undefined

  // Parse interval from rule for snapToHourlyWindow
  const ruleStr = (reminder.recurrenceRule ?? '').replace(/^RRULE:/i, '')
  const intervalMatch = ruleStr.match(/INTERVAL=(\d+)/i)
  const interval = intervalMatch ? Number(intervalMatch[1]) : 1

  return snapToHourlyWindow(base, windowStart, windowEnd, interval)
}
