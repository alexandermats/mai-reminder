import { describe, it, expect } from 'vitest'
import { normalizeRussianText } from '../src/parser/ruTimeNormalizer'

describe('normalizeRussianText', () => {
  it('converts simple number words to digits', () => {
    const result = normalizeRussianText('напомни через пятнадцать минут')
    expect(result).toBe('напомни через 15 минут')
  })

  it('converts compound number words to digits', () => {
    const result = normalizeRussianText('проверка через двадцать пять минут')
    expect(result).toBe('проверка через 25 минут')
  })

  it('converts hour words in daypart phrases', () => {
    const result = normalizeRussianText('пойти на улицу в шесть вечера')
    expect(result).toBe('пойти на улицу в 6 вечера')
  })

  it('keeps spoken clock phrases parseable after number conversion', () => {
    const result = normalizeRussianText('прогулка в шесть тридцать вечера')
    expect(result).toBe('прогулка в 6:30 вечера')
  })

  it('does not change EN text', () => {
    const text = 'call me in 15 minutes'
    expect(normalizeRussianText(text)).toBe(text)
  })
})
