/**
 * Returns a canonical recurring-series base id.
 * Strips generated trailing segments used by runtime transitions:
 * - `-next-<timestamp>`
 * - `-missed-<timestamp>`
 *
 * Examples:
 * - `abc` -> `abc`
 * - `abc-next-1` -> `abc`
 * - `abc-missed-2` -> `abc`
 * - `abc-missed-2-next-3` -> `abc`
 */
export function getReminderSeriesBaseId(reminderId: string): string {
  return reminderId.replace(/(?:-(?:next|missed)-\d+)+$/u, '')
}
