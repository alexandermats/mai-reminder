/**
 * English text normalizer for spelled-out time expressions.
 *
 * Converts common spoken-time forms that chrono-node misses:
 *  - "at six pm" -> "at 6 pm"
 *  - "at eleven thirty am" -> "at 11:30 am"
 */

const EN_HOUR_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

const EN_MINUTE_WORDS: Record<string, number> = {
  o: 0,
  oh: 0,
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
}

const EN_TENS_WORDS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
}

const EN_UNIT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
}

function buildPattern(words: Record<string, number>): string {
  return Object.keys(words)
    .sort((a, b) => b.length - a.length)
    .join('|')
}

const HOUR_PATTERN = buildPattern(EN_HOUR_WORDS)
const MINUTE_PATTERN = buildPattern(EN_MINUTE_WORDS)

const SPELLED_TIME_RE = new RegExp(
  `(?:^|(?<=\\s))(at\\s+)?(${HOUR_PATTERN})(?:\\s+(${MINUTE_PATTERN})(?:\\s+(${MINUTE_PATTERN}))?)?\\s*(a\\.?m\\.?|p\\.?m\\.?)\\b(?=\\s|$|[,.!?:;])`,
  'giu'
)

interface MinuteParseResult {
  value: number
  explicit: boolean
}

function parseMinuteWords(word1?: string, word2?: string): MinuteParseResult | undefined {
  if (!word1) {
    return { value: 0, explicit: false }
  }

  const first = word1.toLowerCase()
  const second = word2?.toLowerCase()

  if (!second) {
    const minute = EN_MINUTE_WORDS[first]
    if (minute === undefined) return undefined
    return { value: minute, explicit: true }
  }

  const tens = EN_TENS_WORDS[first]
  const unit = EN_UNIT_WORDS[second]
  if (tens !== undefined && unit !== undefined) {
    return { value: tens + unit, explicit: true }
  }

  if ((first === 'o' || first === 'oh' || first === 'zero') && unit !== undefined) {
    return { value: unit, explicit: true }
  }

  return undefined
}

export function normalizeEnglishText(text: string): string {
  return text.replace(
    SPELLED_TIME_RE,
    (
      match: string,
      atPrefix?: string,
      hourWord?: string,
      minuteWord1?: string,
      minuteWord2?: string,
      meridiem?: string
    ) => {
      if (!hourWord || !meridiem) return match

      const hour = EN_HOUR_WORDS[hourWord.toLowerCase()]
      if (hour === undefined) return match

      const minuteResult = parseMinuteWords(minuteWord1, minuteWord2)
      if (!minuteResult) return match

      const normalizedMeridiem = meridiem.toLowerCase().includes('p') ? 'pm' : 'am'
      const prefix = atPrefix ?? ''

      if (!minuteResult.explicit) {
        return `${prefix}${hour} ${normalizedMeridiem}`
      }

      return `${prefix}${hour}:${String(minuteResult.value).padStart(2, '0')} ${normalizedMeridiem}`
    }
  )
}
