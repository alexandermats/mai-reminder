/**
 * Local parser adapter using chrono-node (E2-03)
 * Parses natural language date/time expressions offline (no network required).
 * Supports English and Russian.
 */

import * as chrono from 'chrono-node'
import type { ParseInput, ParseResult, Parser } from './types'
import { parseRecurrence } from './recurrenceParser'
import { normalizeEnglishText } from './enTimeNormalizer'
import { normalizeRussianText } from './ruTimeNormalizer'
import { RRule } from 'rrule'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ChronoLocalParserConfig {
  /**
   * Reference date for resolving relative expressions ("tomorrow", "in 2 hours").
   * Defaults to now if not provided.
   */
  referenceDate?: Date
}

// ─── ChronoLocalParser ───────────────────────────────────────────────────────

/**
 * Parser adapter that wraps chrono-node for offline date/time extraction.
 * Implements the Parser interface from E2-01.
 */
export class ChronoLocalParser implements Parser {
  private readonly referenceDate?: Date

  constructor(config: ChronoLocalParserConfig = {}) {
    this.referenceDate = config.referenceDate
  }

  async parse(input: ParseInput): Promise<ParseResult> {
    const refDate = this.referenceDate ?? new Date()
    const recurrence = parseRecurrence(input.text, input.language)

    if (!input.text || input.text.trim().length === 0) {
      throw {
        kind: 'ParseFailureError' as const,
        message: 'Cannot parse empty text',
        reason: 'Input text is empty',
      }
    }

    // Select locale-specific chrono parser
    const chronoParser = input.language === 'ru' ? chrono.ru : chrono.casual

    // Pre-process locale-specific expressions that chrono misses.
    const textForChrono = normalizeTextForChrono(input.text, input.language)

    // Parse with forwardDate=true so relative expressions prefer the future
    let results = chronoParser.parse(textForChrono, refDate, { forwardDate: true })

    // If there is a recurrence phrase, parsing the text without the recurrence segment
    // prevents chrono from interpreting "every 2 days" as "in 2 days" (which shifts the start date).
    // It also helps chrono extract explicit time fragments like "at 7am".
    if (recurrence?.matchedText) {
      const withoutRecurrence = input.text
        .replace(recurrence.matchedText, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (withoutRecurrence.length > 0) {
        const normalizedWithoutRecurrence = normalizeTextForChrono(
          withoutRecurrence,
          input.language
        )
        const withoutResults = chronoParser.parse(normalizedWithoutRecurrence, refDate, {
          forwardDate: true,
        })
        if (withoutResults.length > 0) {
          results = withoutResults
        }
      }
    }

    if (results.length === 0) {
      if (recurrence) {
        const firstOccurrence = computeFirstOccurrenceFromRule(recurrence.rule, refDate)
        return {
          title: extractTitle(input.text, '', recurrence.matchedText),
          scheduledAt: firstOccurrence,
          confidence: 0.7,
          usedMode: 'local',
          recurrenceRule: recurrence.rule,
        }
      }

      throw {
        kind: 'ParseFailureError' as const,
        message: 'No date/time found in the text',
        reason: `chrono-node could not extract a date from: "${input.text.slice(0, 80)}"`,
      }
    }

    // Use the first parsed result (most prominent date expression)
    const parsed = results[0]
    const scheduledAt = parsed.date()

    // Extract title by removing the matched date text from original input
    const matchedRecurrenceText = recurrence?.matchedText
      ? normalizeTextForChrono(recurrence.matchedText, input.language)
      : undefined
    const title = extractTitle(textForChrono, parsed.text, matchedRecurrenceText)

    // Confidence is higher when an explicit time is present
    const hasExplicitTime = parsed.start.isCertain('hour')
    const confidence = hasExplicitTime ? 0.8 : 0.55

    return {
      title,
      scheduledAt,
      confidence,
      usedMode: 'local',
      recurrenceRule: recurrence?.rule,
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeTextForChrono(text: string, language: ParseInput['language']): string {
  if (language === 'ru') {
    return normalizeRussianText(text)
  }
  return normalizeEnglishText(text)
}

/**
 * Remove the matched date fragment from text to derive the reminder title.
 * Falls back to the full original text if removal yields nothing useful.
 */
function extractTitle(
  fullText: string,
  matchedDateText: string,
  matchedRecurrenceText?: string
): string {
  let cleaned = fullText
  if (matchedRecurrenceText) {
    cleaned = cleaned.replace(matchedRecurrenceText, '')
  }
  cleaned = cleaned
    .replace(matchedDateText || '', '')
    // Remove common reminder lead-in phrases
    .replace(
      /^\s*(remind me|напомнить мне|напомнить|напомни мне|напомни|reminder|set a reminder|reminder:)\s*/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()

  // If removing the date left something meaningful, use it; otherwise use original
  return cleaned.length >= 2 ? cleaned : fullText.trim()
}

function computeFirstOccurrenceFromRule(rule: string, referenceDate: Date): Date {
  const parsed = RRule.fromString(rule)
  const withReferenceStart = new RRule({
    ...parsed.origOptions,
    dtstart: referenceDate,
  })
  const next = withReferenceStart.after(referenceDate, true)
  return next ?? referenceDate
}
