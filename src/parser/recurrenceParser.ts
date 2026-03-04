import { normalizeRRule } from './rrule'
import type { ParseInput } from './types'

interface RecurrenceMatch {
  rule: string
  matchedText: string
}

const EN_DAY_TO_TOKEN: Array<{ pattern: string; token: string }> = [
  { pattern: 'monday|mon', token: 'MO' },
  { pattern: 'tuesday|tue|tues', token: 'TU' },
  { pattern: 'wednesday|wed', token: 'WE' },
  { pattern: 'thursday|thu|thur|thurs', token: 'TH' },
  { pattern: 'friday|fri', token: 'FR' },
  { pattern: 'saturday|sat', token: 'SA' },
  { pattern: 'sunday|sun', token: 'SU' },
]

const RU_DAY_TO_TOKEN: Array<{ pattern: string; token: string }> = [
  { pattern: 'понедельник(?:ам|ах|у|а|е|и|ов)?', token: 'MO' },
  { pattern: 'вторник(?:ам|ах|у|а|е|и|ов)?', token: 'TU' },
  { pattern: 'сред(?:а|у|ы|е|ам|ах|ой|ою)?', token: 'WE' },
  { pattern: 'четверг(?:ам|ах|у|а|е|и|ов)?', token: 'TH' },
  { pattern: 'пятниц(?:а|у|ы|е|ам|ах|ой|ою)', token: 'FR' },
  { pattern: 'суббот(?:а|у|ы|е|ам|ах|ой|ою)', token: 'SA' },
  { pattern: 'воскресень(?:е|я|ю|ям|ях|и)', token: 'SU' },
]

const EN_NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
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
}

const RU_NUMBER_WORDS: Record<string, number> = {
  один: 1,
  одна: 1,
  одно: 1,
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
}

const EN_NUMBER_PATTERN = '(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)'
const RU_NUMBER_PATTERN =
  '(\\d+|один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)'

const EN_DAY_PATTERN = EN_DAY_TO_TOKEN.map((d) => d.pattern).join('|')
const RU_DAY_PATTERN = RU_DAY_TO_TOKEN.map((d) => d.pattern).join('|')

function parseInterval(rawValue: string, language: ParseInput['language']): number | undefined {
  if (/^\d+$/.test(rawValue)) {
    const parsed = Number(rawValue)
    return parsed > 0 ? parsed : undefined
  }

  if (language === 'en') {
    return EN_NUMBER_WORDS[rawValue.toLowerCase()]
  }

  return RU_NUMBER_WORDS[rawValue.toLowerCase()]
}

function dayTokenFromMatch(rawDay: string, language: ParseInput['language']): string | undefined {
  const normalizedDay = rawDay.toLowerCase()
  const table = language === 'en' ? EN_DAY_TO_TOKEN : RU_DAY_TO_TOKEN
  const found = table.find((entry) => new RegExp(`^(?:${entry.pattern})$`, 'i').test(normalizedDay))
  return found?.token
}

function buildRule(base: string, extras: string[] = []): string | undefined {
  const candidate = [base, ...extras].join(';')
  return normalizeRRule(candidate)
}

function parseEnglishRecurrence(text: string): RecurrenceMatch | undefined {
  // Multi-day patterns: "every Mon, Wed and Fri" / "every Tue, Thu"
  const multiDayMatch = text.match(
    new RegExp(
      `\\b(?:every|each)\\s+((?:(?:${EN_DAY_PATTERN})(?:\\s*,\\s*|\\s+and\\s+))+(?:${EN_DAY_PATTERN}))\\b`,
      'i'
    )
  )
  if (multiDayMatch) {
    const daySegment = multiDayMatch[1]
    const tokens: string[] = []
    const dayRe = new RegExp(`(${EN_DAY_PATTERN})`, 'gi')
    let dayM: RegExpExecArray | null
    while ((dayM = dayRe.exec(daySegment)) !== null) {
      const token = dayTokenFromMatch(dayM[1], 'en')
      if (token && !tokens.includes(token)) tokens.push(token)
    }
    if (tokens.length > 1) {
      const rule = buildRule('FREQ=WEEKLY', [`BYDAY=${tokens.join(',')}`])
      if (rule) {
        return { rule, matchedText: multiDayMatch[0] }
      }
    }
  }

  const weekdayMatch = text.match(new RegExp(`\\b(?:every|each)\\s+(${EN_DAY_PATTERN})\\b`, 'i'))
  if (weekdayMatch) {
    const token = dayTokenFromMatch(weekdayMatch[1], 'en')
    if (token) {
      const rule = buildRule('FREQ=WEEKLY', [`BYDAY=${token}`])
      if (rule) {
        return { rule, matchedText: weekdayMatch[0] }
      }
    }
  }

  const weekdaysMatch = text.match(/\b(?:every|each)\s+(?:weekdays?|workdays?)\b/i)
  if (weekdaysMatch) {
    const rule = buildRule('FREQ=WEEKLY', ['BYDAY=MO,TU,WE,TH,FR'])
    if (rule) {
      return { rule, matchedText: weekdaysMatch[0] }
    }
  }

  const weekendMatch = text.match(/\b(?:every\s+weekend|on\s+weekends?)\b/i)
  if (weekendMatch) {
    const rule = buildRule('FREQ=WEEKLY', ['BYDAY=SA,SU'])
    if (rule) {
      return { rule, matchedText: weekendMatch[0] }
    }
  }

  const hourlyIntervalMatch = text.match(
    new RegExp(`\\b(?:every|each)\\s+${EN_NUMBER_PATTERN}\\s+hours?\\b`, 'i')
  )
  if (hourlyIntervalMatch) {
    const interval = parseInterval(hourlyIntervalMatch[1], 'en')
    if (interval) {
      const rule = buildRule('FREQ=HOURLY', [`INTERVAL=${interval}`])
      if (rule) {
        return { rule, matchedText: hourlyIntervalMatch[0] }
      }
    }
  }

  const hourlyMatch = text.match(/\b(?:every|each)\s+hour(?:ly)?\b/i)
  if (hourlyMatch) {
    const rule = buildRule('FREQ=HOURLY', ['INTERVAL=1'])
    if (rule) {
      return { rule, matchedText: hourlyMatch[0] }
    }
  }

  const dailyIntervalMatch = text.match(
    new RegExp(`\\b(?:every|each)\\s+${EN_NUMBER_PATTERN}\\s+days?\\b`, 'i')
  )
  if (dailyIntervalMatch) {
    const interval = parseInterval(dailyIntervalMatch[1], 'en')
    if (interval) {
      const extras = interval > 1 ? [`INTERVAL=${interval}`] : []
      const rule = buildRule('FREQ=DAILY', extras)
      if (rule) {
        return { rule, matchedText: dailyIntervalMatch[0] }
      }
    }
  }

  const dailyMatch = text.match(
    /\b(?:every|each)\s+day\b|\bdaily\b|\b(?:every|each)\s+(?:morning|evening|night|noon)\b/i
  )
  if (dailyMatch) {
    const rule = buildRule('FREQ=DAILY')
    if (rule) {
      return { rule, matchedText: dailyMatch[0] }
    }
  }

  const everyOtherDayMatch = text.match(/\b(?:every|each)\s+other\s+day\b/i)
  if (everyOtherDayMatch) {
    const rule = buildRule('FREQ=DAILY', ['INTERVAL=2'])
    if (rule) {
      return { rule, matchedText: everyOtherDayMatch[0] }
    }
  }

  const weeklyIntervalMatch = text.match(
    new RegExp(
      `\\b(?:every|each)\\s+${EN_NUMBER_PATTERN}\\s+weeks?(?:\\s+on\\s+(${EN_DAY_PATTERN}))?\\b`,
      'i'
    )
  )
  if (weeklyIntervalMatch) {
    const interval = parseInterval(weeklyIntervalMatch[1], 'en')
    if (interval) {
      const extras = [`INTERVAL=${interval}`]
      if (weeklyIntervalMatch[2]) {
        const token = dayTokenFromMatch(weeklyIntervalMatch[2], 'en')
        if (token) {
          extras.push(`BYDAY=${token}`)
        }
      }
      const rule = buildRule('FREQ=WEEKLY', extras)
      if (rule) {
        return { rule, matchedText: weeklyIntervalMatch[0] }
      }
    }
  }

  const biweeklyMatch = text.match(/\b(?:bi-?weekly|fortnightly)\b/i)
  if (biweeklyMatch) {
    const rule = buildRule('FREQ=WEEKLY', ['INTERVAL=2'])
    if (rule) {
      return { rule, matchedText: biweeklyMatch[0] }
    }
  }

  const weeklyMatch = text.match(/\b(?:every|each)\s+week(?:ly)?\b|(?<!bi-?)\bweekly\b/i)
  if (weeklyMatch) {
    const rule = buildRule('FREQ=WEEKLY')
    if (rule) {
      return { rule, matchedText: weeklyMatch[0] }
    }
  }

  const monthlyIntervalMatch = text.match(
    new RegExp(`\\b(?:every|each)\\s+${EN_NUMBER_PATTERN}\\s+months?\\b`, 'i')
  )
  if (monthlyIntervalMatch) {
    const interval = parseInterval(monthlyIntervalMatch[1], 'en')
    if (interval) {
      const extras = interval > 1 ? [`INTERVAL=${interval}`] : []
      const rule = buildRule('FREQ=MONTHLY', extras)
      if (rule) {
        return { rule, matchedText: monthlyIntervalMatch[0] }
      }
    }
  }

  const monthlyMatch = text.match(/\b(?:every|each)\s+month(?:ly)?\b/i)
  if (monthlyMatch) {
    const rule = buildRule('FREQ=MONTHLY')
    if (rule) {
      return { rule, matchedText: monthlyMatch[0] }
    }
  }

  return undefined
}

function parseRussianRecurrence(text: string): RecurrenceMatch | undefined {
  // Multi-day patterns: "по понедельникам и средам", "по вторникам и четвергам"
  const multiDayRuMatch = text.match(
    new RegExp(
      `(?:^|\\s)по\\s+(${RU_DAY_PATTERN})\\s+и\\s+(${RU_DAY_PATTERN})(?=\\s|$|[,.!?:;])`,
      'iu'
    )
  )
  if (multiDayRuMatch) {
    const token1 = dayTokenFromMatch(multiDayRuMatch[1], 'ru')
    const token2 = dayTokenFromMatch(multiDayRuMatch[2], 'ru')
    if (token1 && token2) {
      const rule = buildRule('FREQ=WEEKLY', [`BYDAY=${token1},${token2}`])
      if (rule) {
        return { rule, matchedText: multiDayRuMatch[0].trim() }
      }
    }
  }

  const weekdayMatch = text.match(
    new RegExp(`(?:^|\\s)(?:кажд[\\p{L}]*|по)\\s+(${RU_DAY_PATTERN})(?=\\s|$|[,.!?:;])`, 'iu')
  )
  if (weekdayMatch) {
    const token = dayTokenFromMatch(weekdayMatch[1], 'ru')
    if (token) {
      const rule = buildRule('FREQ=WEEKLY', [`BYDAY=${token}`])
      if (rule) {
        return { rule, matchedText: weekdayMatch[0].trim() }
      }
    }
  }

  // Workdays: каждый рабочий день
  const workdayRuMatch = text.match(
    /(?:^|\s)кажд[\p{L}]*\s+рабоч[\p{L}]*\s+день(?=\s|$|[,.!?:;])/iu
  )
  if (workdayRuMatch) {
    const rule = buildRule('FREQ=WEEKLY', ['BYDAY=MO,TU,WE,TH,FR'])
    if (rule) {
      return { rule, matchedText: workdayRuMatch[0].trim() }
    }
  }

  const weekdaysMatch = text.match(
    /(?:^|\s)(?:кажд[\p{L}]*\s+будн(?:ий|ие|им|их)\s+дн(?:и|ям|ях)|по\s+будням)(?=\s|$|[,.!?:;])/iu
  )
  if (weekdaysMatch) {
    const rule = buildRule('FREQ=WEEKLY', ['BYDAY=MO,TU,WE,TH,FR'])
    if (rule) {
      return { rule, matchedText: weekdaysMatch[0].trim() }
    }
  }

  // Weekend: по выходным / каждые выходные
  const weekendRuMatch = text.match(
    /(?:^|\s)(?:по\s+выходным|кажд[\p{L}]*\s+выходн[\p{L}]*)(?=\s|$|[,.!?:;])/iu
  )
  if (weekendRuMatch) {
    const rule = buildRule('FREQ=WEEKLY', ['BYDAY=SA,SU'])
    if (rule) {
      return { rule, matchedText: weekendRuMatch[0].trim() }
    }
  }

  const hourlyIntervalMatch = text.match(
    new RegExp(
      `(?:^|\\s)кажд[\\p{L}]*\\s+${RU_NUMBER_PATTERN}\\s+час(?:а|ов)?(?=\\s|$|[,.!?:;])`,
      'iu'
    )
  )
  if (hourlyIntervalMatch) {
    const interval = parseInterval(hourlyIntervalMatch[1], 'ru')
    if (interval) {
      const rule = buildRule('FREQ=HOURLY', [`INTERVAL=${interval}`])
      if (rule) {
        return { rule, matchedText: hourlyIntervalMatch[0].trim() }
      }
    }
  }

  const hourlyMatch = text.match(/(?:^|\s)кажд[\p{L}]*\s+час(?=\s|$|[,.!?:;])/iu)
  if (hourlyMatch) {
    const rule = buildRule('FREQ=HOURLY', ['INTERVAL=1'])
    if (rule) {
      return { rule, matchedText: hourlyMatch[0].trim() }
    }
  }

  const dailyIntervalMatch = text.match(
    new RegExp(
      `(?:^|\\s)кажд[\\p{L}]*\\s+${RU_NUMBER_PATTERN}\\s+дн(?:я|ей|и)(?=\\s|$|[,.!?:;])`,
      'iu'
    )
  )
  if (dailyIntervalMatch) {
    const interval = parseInterval(dailyIntervalMatch[1], 'ru')
    if (interval) {
      const extras = interval > 1 ? [`INTERVAL=${interval}`] : []
      const rule = buildRule('FREQ=DAILY', extras)
      if (rule) {
        return { rule, matchedText: dailyIntervalMatch[0].trim() }
      }
    }
  }

  const dailyMatch = text.match(
    /(?:^|\s)(?:кажд[\p{L}]*\s+(?:день|утро|вечер|ночь)|ежедневно)(?=\s|$|[,.!?:;])/iu
  )
  if (dailyMatch) {
    const rule = buildRule('FREQ=DAILY')
    if (rule) {
      return { rule, matchedText: dailyMatch[0].trim() }
    }
  }

  // через день → DAILY;INTERVAL=2
  const everyOtherDayRuMatch = text.match(/(?:^|\s)через\s+день(?=\s|$|[,.!?:;])/iu)
  if (everyOtherDayRuMatch) {
    const rule = buildRule('FREQ=DAILY', ['INTERVAL=2'])
    if (rule) {
      return { rule, matchedText: everyOtherDayRuMatch[0].trim() }
    }
  }

  // раз в день / раз в неделю / раз в месяц
  const razVDenMatch = text.match(/(?:^|\s)раз\s+в\s+день(?=\s|$|[,.!?:;])/iu)
  if (razVDenMatch) {
    const rule = buildRule('FREQ=DAILY')
    if (rule) {
      return { rule, matchedText: razVDenMatch[0].trim() }
    }
  }

  const razVNedeluMatch = text.match(/(?:^|\s)раз\s+в\s+недел[\p{L}]*(?=\s|$|[,.!?:;])/iu)
  if (razVNedeluMatch) {
    const rule = buildRule('FREQ=WEEKLY')
    if (rule) {
      return { rule, matchedText: razVNedeluMatch[0].trim() }
    }
  }

  const razVMesyatsMatch = text.match(/(?:^|\s)раз\s+в\s+месяц(?=\s|$|[,.!?:;])/iu)
  if (razVMesyatsMatch) {
    const rule = buildRule('FREQ=MONTHLY')
    if (rule) {
      return { rule, matchedText: razVMesyatsMatch[0].trim() }
    }
  }

  const weeklyIntervalMatch = text.match(
    new RegExp(
      `(?:^|\\s)кажд[\\p{L}]*\\s+${RU_NUMBER_PATTERN}\\s+недел(?:ю|и|ь|ям|ях)(?=\\s|$|[,.!?:;])`,
      'iu'
    )
  )
  if (weeklyIntervalMatch) {
    const interval = parseInterval(weeklyIntervalMatch[1], 'ru')
    if (interval) {
      const rule = buildRule('FREQ=WEEKLY', [`INTERVAL=${interval}`])
      if (rule) {
        return { rule, matchedText: weeklyIntervalMatch[0].trim() }
      }
    }
  }

  const weeklyMatch = text.match(
    /(?:^|\s)(?:кажд[\p{L}]*\s+недел(?:ю|е|и)|еженедельно)(?=\s|$|[,.!?:;])/iu
  )
  if (weeklyMatch) {
    const rule = buildRule('FREQ=WEEKLY')
    if (rule) {
      return { rule, matchedText: weeklyMatch[0].trim() }
    }
  }

  const monthlyIntervalMatch = text.match(
    new RegExp(
      `(?:^|\\s)кажд[\\p{L}]*\\s+${RU_NUMBER_PATTERN}\\s+месяц(?:а|ев)?(?=\\s|$|[,.!?:;])`,
      'iu'
    )
  )
  if (monthlyIntervalMatch) {
    const interval = parseInterval(monthlyIntervalMatch[1], 'ru')
    if (interval) {
      const extras = interval > 1 ? [`INTERVAL=${interval}`] : []
      const rule = buildRule('FREQ=MONTHLY', extras)
      if (rule) {
        return { rule, matchedText: monthlyIntervalMatch[0].trim() }
      }
    }
  }

  const monthlyMatch = text.match(/(?:^|\s)(?:кажд[\p{L}]*\s+месяц|ежемесячно)(?=\s|$|[,.!?:;])/iu)
  if (monthlyMatch) {
    const rule = buildRule('FREQ=MONTHLY')
    if (rule) {
      return { rule, matchedText: monthlyMatch[0].trim() }
    }
  }

  return undefined
}

export function parseRecurrence(
  text: string,
  language: ParseInput['language']
): RecurrenceMatch | undefined {
  if (!text || !text.trim()) {
    return undefined
  }

  return language === 'ru' ? parseRussianRecurrence(text) : parseEnglishRecurrence(text)
}
