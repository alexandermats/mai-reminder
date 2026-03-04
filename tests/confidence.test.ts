import { describe, it, expect } from 'vitest'
import {
  calculateConfidence,
  needsConfirmation,
  type ConfidenceInput,
  CONFIDENCE_THRESHOLD,
} from '../src/parser/confidence'
import type { ParseResult } from '../src/parser/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FUTURE_DATE = new Date(Date.now() + 86400000) // tomorrow
const PAST_DATE = new Date(Date.now() - 86400000) // yesterday

function makeResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    title: 'Doctor appointment',
    scheduledAt: FUTURE_DATE,
    confidence: 0.8,
    usedMode: 'llm',
    ...overrides,
  }
}

// ─── calculateConfidence ──────────────────────────────────────────────────────

describe('calculateConfidence (E2-05)', () => {
  describe('confidence = 0 cases', () => {
    it('returns 0 when title is empty', () => {
      const input: ConfidenceInput = {
        result: makeResult({ title: '' }),
        originalText: 'something tomorrow',
        hasExplicitTime: true,
      }
      expect(calculateConfidence(input)).toBe(0)
    })

    it('returns 0 when title is whitespace-only', () => {
      const input: ConfidenceInput = {
        result: makeResult({ title: '   ' }),
        originalText: 'something tomorrow',
        hasExplicitTime: true,
      }
      expect(calculateConfidence(input)).toBe(0)
    })

    it('returns 0 when scheduledAt is in the past', () => {
      const input: ConfidenceInput = {
        result: makeResult({ scheduledAt: PAST_DATE }),
        originalText: 'doctor tomorrow',
        hasExplicitTime: true,
      }
      expect(calculateConfidence(input)).toBe(0)
    })
  })

  describe('ambiguity penalties', () => {
    it('has lower confidence when no explicit time (defaults to next occurrence)', () => {
      const withTime: ConfidenceInput = {
        result: makeResult(),
        originalText: 'doctor tomorrow at 3pm',
        hasExplicitTime: true,
      }
      const withoutTime: ConfidenceInput = {
        result: makeResult(),
        originalText: 'doctor tomorrow',
        hasExplicitTime: false,
      }

      expect(calculateConfidence(withTime)).toBeGreaterThan(calculateConfidence(withoutTime))
    })

    it('has lower confidence for vague relative words like "soon" or "later"', () => {
      const precise: ConfidenceInput = {
        result: makeResult(),
        originalText: 'meeting tomorrow at 2pm',
        hasExplicitTime: true,
      }
      const vague: ConfidenceInput = {
        result: makeResult(),
        originalText: 'call me soon',
        hasExplicitTime: false,
      }

      expect(calculateConfidence(precise)).toBeGreaterThan(calculateConfidence(vague))
    })

    it('has lower confidence for ambiguous words "later"', () => {
      const input: ConfidenceInput = {
        result: makeResult(),
        originalText: 'remind me later',
        hasExplicitTime: false,
      }
      const score = calculateConfidence(input)
      expect(score).toBeLessThan(0.7)
    })
  })

  describe('confidence range', () => {
    it('returns a value between 0.0 and 1.0 inclusive', () => {
      const input: ConfidenceInput = {
        result: makeResult(),
        originalText: 'meeting tomorrow at 2pm',
        hasExplicitTime: true,
      }
      const score = calculateConfidence(input)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    })
  })
})

// ─── needsConfirmation ────────────────────────────────────────────────────────

describe('needsConfirmation (E2-05)', () => {
  it('returns true when confidence is below threshold (< 0.7)', () => {
    const result = makeResult({ confidence: 0.5 })
    expect(needsConfirmation(result)).toBe(true)
  })

  it('returns true when confidence equals 0', () => {
    const result = makeResult({ confidence: 0 })
    expect(needsConfirmation(result)).toBe(true)
  })

  it('returns false when confidence is at or above threshold (>= 0.7)', () => {
    const result = makeResult({ confidence: 0.7 })
    expect(needsConfirmation(result)).toBe(false)

    const highConf = makeResult({ confidence: 1.0 })
    expect(needsConfirmation(highConf)).toBe(false)
  })

  it('returns false for high-confidence LLM result', () => {
    const result = makeResult({ confidence: 0.85, usedMode: 'llm' })
    expect(needsConfirmation(result)).toBe(false)
  })

  it('returns true for low-confidence local result', () => {
    const result = makeResult({ confidence: 0.55, usedMode: 'local' })
    expect(needsConfirmation(result)).toBe(true)
  })
})

// ─── CONFIDENCE_THRESHOLD export ─────────────────────────────────────────────

describe('CONFIDENCE_THRESHOLD', () => {
  it('is 0.7', () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.7)
  })
})
