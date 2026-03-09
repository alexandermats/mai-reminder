/**
 * DateTime utilities for timezone-safe operations
 *
 * All storage uses UTC (ISO-8601 with 'Z' suffix).
 * Display converts to local timezone.
 */

/**
 * Convert a Date to UTC ISO-8601 string for storage
 * @param date Date object (can be local or UTC)
 * @returns ISO-8601 string with 'Z' suffix
 * @throws Error if date is invalid
 */
export function toUTCString(date: Date): string {
  if (!isValidDate(date)) {
    throw new Error('Invalid date: toUTCString received non-Date or invalid Date')
  }
  return date.toISOString()
}

/**
 * Parse a UTC ISO-8601 string to Date
 * @param utcString ISO-8601 string with 'Z' suffix
 * @returns Date object in UTC
 * @throws Error if string is invalid or not in UTC format
 */
export function fromUTCString(utcString: string): Date {
  if (!utcString || typeof utcString !== 'string') {
    throw new Error('Invalid UTC date string')
  }

  // Validate UTC format (must end with Z)
  if (!utcString.endsWith('Z')) {
    throw new Error('Invalid UTC date string: must end with Z')
  }

  const date = new Date(utcString)

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid UTC date string')
  }

  return date
}

/**
 * Format a Date for local display
 * @param date Date object (will be interpreted as UTC epoch time)
 * @param timeFormat Optional time format overriding locale ('12h' or '24h')
 * @returns Formatted string in local timezone
 * @throws Error if date is invalid
 */
export function toDisplayString(date: Date, timeFormat?: '12h' | '24h'): string {
  if (!isValidDate(date)) {
    throw new Error('Invalid date: toDisplayString received non-Date or invalid Date')
  }

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }

  if (timeFormat) {
    options.hour12 = timeFormat === '12h'
  }

  return date.toLocaleString(undefined, options)
}

/**
 * Check if a value is a valid Date object
 * @param value Value to check
 * @returns true if value is a valid Date
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/**
 * Compare two UTC dates for sorting/scheduling
 * @param date1 First date
 * @param date2 Second date
 * @returns negative if date1 < date2, positive if date1 > date2, 0 if equal
 * @throws Error if either date is invalid
 */
export function compareUTCDates(date1: Date, date2: Date): number {
  if (!isValidDate(date1) || !isValidDate(date2)) {
    throw new Error('Invalid date')
  }

  return date1.getTime() - date2.getTime()
}

/**
 * Check if a date is in the past relative to now
 * @param date Date to check
 * @returns true if date is before now, false if date is now or in the future
 * @throws Error if date is invalid
 * @note Returns false for dates exactly at the current moment
 */
export function isInPast(date: Date): boolean {
  return compareUTCDates(date, new Date()) < 0
}

/**
 * Check if a date is in the future relative to now
 * @param date Date to check
 * @returns true if date is after now, false if date is now or in the past
 * @throws Error if date is invalid
 * @note Returns false for dates exactly at the current moment
 */
export function isInFuture(date: Date): boolean {
  return compareUTCDates(date, new Date()) > 0
}
