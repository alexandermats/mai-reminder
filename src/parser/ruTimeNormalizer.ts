/**
 * Simplified Russian normalizer:
 * convert spelled-out numbers to digits before chrono parsing.
 */

const RU_SINGLE_NUMBERS: Record<string, number> = {
  ноль: 0,
  нуль: 0,
  один: 1,
  одна: 1,
  одну: 1,
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
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,
}

const RU_TENS: Record<string, number> = {
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,
}

const RU_UNITS: Record<string, number> = {
  один: 1,
  одна: 1,
  две: 2,
  два: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
}

function buildPattern(words: Record<string, number>): string {
  return Object.keys(words)
    .sort((a, b) => b.length - a.length)
    .join('|')
}

const TENS_PATTERN = buildPattern(RU_TENS)
const UNITS_PATTERN = buildPattern(RU_UNITS)
const SINGLE_PATTERN = buildPattern(RU_SINGLE_NUMBERS)

const RU_COMPOUND_RE = new RegExp(
  `(?<![\\p{L}\\p{N}_])(${TENS_PATTERN})[-\\s]+(${UNITS_PATTERN})(?![\\p{L}\\p{N}_])`,
  'giu'
)
const RU_SINGLE_RE = new RegExp(`(?<![\\p{L}\\p{N}_])(${SINGLE_PATTERN})(?![\\p{L}\\p{N}_])`, 'giu')
const RU_DIGIT_SPACE_TIME_RE = /(?:^|(?<=\s))в\s+(\d{1,2})\s+(\d{2})(?!\d)/giu

export function normalizeRussianText(text: string): string {
  let result = text.replace(
    RU_COMPOUND_RE,
    (_match: string, tensWord: string, unitWord: string) => {
      const tens = RU_TENS[tensWord.toLowerCase()]
      const unit = RU_UNITS[unitWord.toLowerCase()]
      if (tens === undefined || unit === undefined) return _match
      return String(tens + unit)
    }
  )

  result = result.replace(RU_SINGLE_RE, (match: string, word: string) => {
    const value = RU_SINGLE_NUMBERS[word.toLowerCase()]
    return value === undefined ? match : String(value)
  })

  // Keep this tiny post-step so "в шесть тридцать вечера" remains parseable.
  result = result.replace(
    RU_DIGIT_SPACE_TIME_RE,
    (_match: string, hour: string, minute: string) => `в ${hour}:${minute}`
  )

  return result
}
