/**
 * Simplified English normalizer:
 * convert spelled-out numbers to digits before chrono parsing.
 */

const EN_SINGLE_NUMBERS: Record<string, number> = {
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
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

const EN_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

const EN_UNITS: Record<string, number> = {
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

const TENS_PATTERN = buildPattern(EN_TENS)
const UNITS_PATTERN = buildPattern(EN_UNITS)
const SINGLE_PATTERN = buildPattern(EN_SINGLE_NUMBERS)

const EN_COMPOUND_RE = new RegExp(`\\b(${TENS_PATTERN})[-\\s]+(${UNITS_PATTERN})\\b`, 'giu')
const EN_SINGLE_RE = new RegExp(`\\b(${SINGLE_PATTERN})\\b`, 'giu')
const EN_DIGIT_TIME_WITH_MERIDIEM_RE =
  /(?:^|(?<=\s))(at\s+)?(\d{1,2})\s+(\d{2})\s*(a\.?m\.?|p\.?m\.?)(?=\s|$|[,.!?:;])/giu

export function normalizeEnglishText(text: string): string {
  let result = text.replace(
    EN_COMPOUND_RE,
    (_match: string, tensWord: string, unitWord: string) => {
      const tens = EN_TENS[tensWord.toLowerCase()]
      const unit = EN_UNITS[unitWord.toLowerCase()]
      if (tens === undefined || unit === undefined) return _match
      return String(tens + unit)
    }
  )

  result = result.replace(EN_SINGLE_RE, (match: string, word: string) => {
    const value = EN_SINGLE_NUMBERS[word.toLowerCase()]
    return value === undefined ? match : String(value)
  })

  // Keep this tiny post-step so "at eleven thirty am" becomes parseable.
  result = result.replace(
    EN_DIGIT_TIME_WITH_MERIDIEM_RE,
    (
      _match: string,
      atPrefix: string | undefined,
      hour: string,
      minute: string,
      meridiem: string
    ) => {
      const normalizedMeridiem = meridiem.toLowerCase().includes('p') ? 'pm' : 'am'
      return `${atPrefix ?? ''}${hour}:${minute} ${normalizedMeridiem}`
    }
  )

  return result
}
