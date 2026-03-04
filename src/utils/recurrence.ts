/**
 * Recurrence rule humanization utilities
 */

export function formatRecurrenceRule(
  rule: string | undefined,
  t: (key: string, ...args: unknown[]) => string
): string {
  if (!rule) {
    return ''
  }

  const parts = rule.split(';').reduce(
    (acc, part) => {
      const [rawKey, rawValue] = part.split('=')
      if (!rawKey || !rawValue) {
        return acc
      }
      acc[rawKey.trim().toUpperCase()] = rawValue.trim().toUpperCase()
      return acc
    },
    {} as Record<string, string>
  )

  const freq = parts.FREQ
  const interval = Number(parts.INTERVAL || '1')
  const normalizedInterval = Number.isFinite(interval) && interval > 0 ? interval : 1

  if (freq === 'WEEKLY') {
    if (parts.BYDAY) {
      const dayTokens = parts.BYDAY.split(',')
        .map((day) => day.trim().toLowerCase())
        .filter((day) => ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].includes(day))
      if (dayTokens.length === 1) {
        return t(`reminder.repeatsEvery.${dayTokens[0]}`)
      }
      if (dayTokens.length > 1) {
        const translatedDays = dayTokens.map((day) => t(`reminder.weekdays.${day}`))
        return t('reminder.repeatsWeeklyOnDays', { days: translatedDays.join(', ') })
      }
    }
    return normalizedInterval === 1
      ? t('reminder.repeatsWeekly')
      : t('reminder.repeatsEveryNWeeks', normalizedInterval, { count: normalizedInterval })
  }

  if (freq === 'DAILY') {
    return normalizedInterval === 1
      ? t('reminder.repeatsDaily')
      : t('reminder.repeatsEveryNDays', normalizedInterval, { count: normalizedInterval })
  }

  if (freq === 'HOURLY') {
    return normalizedInterval === 1
      ? t('reminder.repeatsHourly')
      : t('reminder.repeatsEveryNHours', normalizedInterval, { count: normalizedInterval })
  }

  if (freq === 'MONTHLY') {
    return normalizedInterval === 1
      ? t('reminder.repeatsMonthly')
      : t('reminder.repeatsEveryNMonths', normalizedInterval, { count: normalizedInterval })
  }

  if (freq === 'YEARLY') {
    return normalizedInterval === 1
      ? t('reminder.repeatsYearly')
      : t('reminder.repeatsEveryNYears', normalizedInterval, { count: normalizedInterval })
  }

  return t('reminder.repeatsCustom', { rule })
}
