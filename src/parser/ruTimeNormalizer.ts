/**
 * Russian text normalizer for time expressions (E12-03).
 *
 * Fixes two parsing bugs that chrono-node cannot handle on its own:
 *  1. Space-separated digit times: "в 14 55" → "в 14:55"
 *  2. Spelled-out hour+minute words: "в четырнадцать пятьдесят пять" → "в 14:55"
 *
 * This runs as a pre-processing step in ChronoLocalParser before the text is
 * passed to chrono-node. It is intentionally scoped to Russian locale only.
 *
 * Note: \b word boundaries are not used because they do not work correctly
 * for Cyrillic characters in JavaScript regexes. Instead we use lookbehind
 * (start-of-string or whitespace) and lookahead (end-of-string or whitespace).
 */

// ─── Number-word tables ───────────────────────────────────────────────────────

/** Mapping of RU cardinal words to their integer values (1–20 for valid hours). */
const RU_HOUR_WORDS: Record<string, number> = {
  один: 1,
  одна: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
  двадцать: 20,
  // 21–23 are composed; handled by tens+units look-up below
}

/**
 * Tens place for minutes (0, 10, 20 … 50).
 * Includes teen values (10–19) so they can be used as standalone minute values.
 */
const RU_TENS: Record<string, number> = {
  ноль: 0,
  нуль: 0,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
}

/** Units 1–9 for building minute values from tens+units. */
const RU_UNITS: Record<string, number> = {
  один: 1,
  одна: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
}

// ─── Regex helpers ────────────────────────────────────────────────────────────

// Sort longer keys first to prevent shorter prefixes from matching first in alternation.
// E.g. "пятьдесят" must come before "пять" so the regex doesn't stop at "пять".
function buildPattern(words: Record<string, number>): string {
  return Object.keys(words)
    .sort((a, b) => b.length - a.length)
    .join('|')
}

const HOUR_WORDS_PATTERN = buildPattern(RU_HOUR_WORDS)
const TENS_PATTERN = buildPattern(RU_TENS)
const UNITS_PATTERN = buildPattern(RU_UNITS)

/**
 * Matches: "в <hour_word> <tens_word> [units_word]"
 * e.g. "в четырнадцать пятьдесят пять" or "в семь тридцать"
 *
 * Uses lookbehind (^|\s) instead of \b because \b does not work for Cyrillic.
 */
const SPELLED_TIME_RE = new RegExp(
  `(?:^|(?<=\\s))в\\s+(${HOUR_WORDS_PATTERN})\\s+(${TENS_PATTERN})(?:\\s+(${UNITS_PATTERN}))?(?=\\s|$)`,
  'giu'
)

/**
 * Matches: "в <1–2 digit hour> <exactly 2 digit minute>" (space-separated).
 * e.g. "в 14 55" or "в 7 30"
 * Negative lookahead (?!\d) prevents matching three-digit sequences like "14 550".
 */
const DIGIT_SPACE_TIME_RE = /(?:^|(?<=\s))в\s+(\d{1,2})\s+(\d{2})(?!\d)/giu

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Normalize Russian time expressions so that chrono-node can parse them.
 *
 * Transformations applied (in order):
 *  1. Spelled-out words: "в четырнадцать пятьдесят пять" → "в 14:55"
 *  2. Space-separated digits: "в 14 55" → "в 14:55"
 *
 * Only text following the Russian time preposition "в" is matched.
 * English text and already-colon-formatted times are left unchanged.
 */
export function normalizeRussianText(text: string): string {
  // Step 1: spelled-out words first (longer patterns; removes potential false digit matches)
  let result = text.replace(
    SPELLED_TIME_RE,
    (_match: string, hourWord: string, tensWord: string, unitWord?: string) => {
      const hour = RU_HOUR_WORDS[hourWord.toLowerCase()]
      if (hour === undefined) return _match

      const tens = RU_TENS[tensWord.toLowerCase()]
      if (tens === undefined) return _match

      // Teen values (10–19) already encode the full minute; no additional unit word
      const isTeen = tens >= 10 && tens <= 19
      let minute: number
      if (isTeen) {
        minute = tens
      } else {
        const unit = unitWord ? (RU_UNITS[unitWord.toLowerCase()] ?? 0) : 0
        minute = tens + unit
      }

      if (minute < 0 || minute > 59) return _match

      return `в ${hour}:${String(minute).padStart(2, '0')}`
    }
  )

  // Step 2: space-separated digit times
  result = result.replace(
    DIGIT_SPACE_TIME_RE,
    (_match: string, hour: string, minute: string) => `в ${hour}:${minute}`
  )

  return result
}
