/**
 * Unit tests for the Russian time normalizer (E12-03).
 * Tests the normalizer in isolation before chrono-node integration.
 */
import { describe, it, expect } from 'vitest'
import { normalizeRussianText } from '../src/parser/ruTimeNormalizer'

describe('normalizeRussianText', () => {
  // ── Bug 1: space-separated digit times ──────────────────────────────────────

  describe('space-separated digit times', () => {
    it('normalizes "в 14 55" → "в 14:55"', () => {
      expect(normalizeRussianText('напомни в 14 55 про кофе')).toContain('14:55')
    })

    it('normalizes "в 7 30" → "в 7:30"', () => {
      expect(normalizeRussianText('встреча в 7 30')).toContain('7:30')
    })

    it('normalizes "в 9 00" → "в 9:00"', () => {
      expect(normalizeRussianText('будильник в 9 00')).toContain('9:00')
    })

    it('does NOT collapse "14 55" without a time indicator context', () => {
      // lone digits not after "в" should not be collapsed
      const result = normalizeRussianText('позиция 14 55 в отчёте')
      // "в" in "в отчёте" is followed by "отчёте", not digits — should not match
      expect(result).not.toContain('14:55')
    })

    it('handles single-digit hour: "в 8 45"', () => {
      expect(normalizeRussianText('позвонить в 8 45')).toContain('8:45')
    })
  })

  // ── Bug 2: spelled-out hour + minute words ───────────────────────────────────

  describe('spelled-out hour + minute combinations', () => {
    it('normalizes "в четырнадцать пятьдесят пять" → "в 14:55"', () => {
      const result = normalizeRussianText('напомни в четырнадцать пятьдесят пять')
      expect(result).toContain('14:55')
    })

    it('normalizes "в семь тридцать" → "в 7:30"', () => {
      const result = normalizeRussianText('встреча в семь тридцать')
      expect(result).toContain('7:30')
    })

    it('normalizes "в девять ноль ноль" → "в 9:00"', () => {
      const result = normalizeRussianText('совещание в девять ноль ноль')
      expect(result).toContain('9:00')
    })

    it('normalizes "в двенадцать сорок пять" → "в 12:45"', () => {
      const result = normalizeRussianText('обед в двенадцать сорок пять')
      expect(result).toContain('12:45')
    })

    it('normalizes "в восемнадцать двадцать" → "в 18:20"', () => {
      const result = normalizeRussianText('ужин в восемнадцать двадцать')
      expect(result).toContain('18:20')
    })

    it('normalizes "в шесть вечера" → "в 18:00"', () => {
      const result = normalizeRussianText('пойти на улицу в шесть вечера')
      expect(result).toContain('18:00')
    })

    it('normalizes "в шесть тридцать вечера" → "в 18:30"', () => {
      const result = normalizeRussianText('прогулка в шесть тридцать вечера')
      expect(result).toContain('18:30')
    })
  })

  // ── No false positives ───────────────────────────────────────────────────────

  describe('no false positives', () => {
    it('does not change EN text', () => {
      const text = 'call me at 14:55 tomorrow'
      expect(normalizeRussianText(text)).toBe(text)
    })

    it('does not alter already-colon-formatted time', () => {
      const text = 'напомни в 14:55'
      expect(normalizeRussianText(text)).toBe(text)
    })

    it('does not collapse three-digit sequences (not a time)', () => {
      // "14 550" should not become "14:550"
      const result = normalizeRussianText('код в 14 550')
      expect(result).not.toContain('14:550')
    })
  })
})
