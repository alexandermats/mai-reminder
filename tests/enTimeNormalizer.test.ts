import { describe, it, expect } from 'vitest'
import { normalizeEnglishText } from '../src/parser/enTimeNormalizer'

describe('normalizeEnglishText', () => {
  it('converts simple number words to digits', () => {
    const result = normalizeEnglishText('remind me in fifteen minutes')
    expect(result).toBe('remind me in 15 minutes')
  })

  it('converts compound number words to digits', () => {
    const result = normalizeEnglishText('check every twenty five minutes')
    expect(result).toBe('check every 25 minutes')
  })

  it('keeps spoken clock phrases parseable after number conversion', () => {
    const result = normalizeEnglishText('go at eleven thirty am')
    expect(result).toBe('go at 11:30 am')
  })

  it('converts hour words in am/pm phrases', () => {
    const result = normalizeEnglishText('walk at six pm')
    expect(result).toBe('walk at 6 pm')
  })

  it('does not convert non-number words', () => {
    const text = 'an apple tomorrow'
    expect(normalizeEnglishText(text)).toBe(text)
  })
})
