import { RRule } from 'rrule'

/**
 * Normalize and validate RRULE text.
 * Returns undefined when the rule is invalid.
 */
export function normalizeRRule(rule: string | null | undefined): string | undefined {
  if (!rule || typeof rule !== 'string') {
    return undefined
  }

  const normalizedInput = rule
    .trim()
    .replace(/^RRULE:/i, '')
    .toUpperCase()
  if (!normalizedInput.startsWith('FREQ=')) {
    return undefined
  }

  try {
    const parsed = RRule.fromString(normalizedInput)
    return parsed.toString().replace(/^RRULE:/, '')
  } catch {
    return undefined
  }
}
