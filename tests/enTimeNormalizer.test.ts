import { describe, it, expect } from 'vitest'
import { normalizeEnglishText } from '../src/parser/enTimeNormalizer'

describe('normalizeEnglishText', () => {
  it('normalizes "at six pm" -> "at 6 pm"', () => {
    const result = normalizeEnglishText('Remind me to walk at six pm')
    expect(result).toContain('at 6 pm')
  })

  it('normalizes "at eleven thirty am" -> "at 11:30 am"', () => {
    const result = normalizeEnglishText('Call mom at eleven thirty am')
    expect(result).toContain('at 11:30 am')
  })

  it('normalizes "at six oh five pm" -> "at 6:05 pm"', () => {
    const result = normalizeEnglishText('Take medicine at six oh five pm')
    expect(result).toContain('at 6:05 pm')
  })

  it('does not alter already numeric times', () => {
    const text = 'Walk at 6 pm'
    expect(normalizeEnglishText(text)).toBe(text)
  })

  it('does not alter text without meridiem', () => {
    const text = 'Bring six apples tomorrow'
    expect(normalizeEnglishText(text)).toBe(text)
  })
})
