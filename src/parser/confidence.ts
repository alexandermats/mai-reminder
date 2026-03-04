/**
 * Confidence scoring and ambiguity detection (E2-05)
 * Determines whether a parse result requires manual user confirmation.
 */

import type { ParseResult } from './types'

// ─── Public constants ─────────────────────────────────────────────────────────

/**
 * Results with confidence below this threshold require manual confirmation.
 * Per ticket spec: < 0.7 triggers user confirmation.
 */
export const CONFIDENCE_THRESHOLD = 0.7

// ─── Ambiguity indicators (vague relative time words) ────────────────────────

const VAGUE_TIME_PATTERNS = [
  /\bsoon\b/i,
  /\blater\b/i,
  /\bsomeday\b/i,
  /\beventually\b/i,
  /\bпотом\b/i, // Russian "then/later"
  /\bвскоре\b/i, // Russian "soon"
  /\bкогда-нибудь\b/i, // Russian "someday"
]

// ─── ConfidenceInput ─────────────────────────────────────────────────────────

/**
 * Inputs needed to compute a refined confidence score.
 * Combines the raw parser result with contextual signals.
 */
export interface ConfidenceInput {
  /** The raw parse result from LLM or local parser */
  result: ParseResult
  /** The original user text (used for ambiguity detection) */
  originalText: string
  /**
   * Whether an explicit clock time was found in the text.
   * (e.g. "3pm", "15:00" = true; "tomorrow", "next week" = false)
   */
  hasExplicitTime: boolean
}

// ─── calculateConfidence ─────────────────────────────────────────────────────

/**
 * Compute a refined confidence score in [0.0, 1.0] using heuristic rules.
 *
 * Rule priority (hard zeroes first):
 *  1. Missing title → 0
 *  2. Past scheduledAt → 0
 *  3. Otherwise start from result.confidence and apply penalties:
 *     - No explicit time     → −0.15
 *     - Vague time wording   → −0.20 (additional)
 */
export function calculateConfidence(input: ConfidenceInput): number {
  const { result, originalText, hasExplicitTime } = input

  // Hard zero: missing title
  if (!result.title || result.title.trim().length === 0) {
    return 0
  }

  // Hard zero: scheduled in the past
  if (result.scheduledAt <= new Date()) {
    return 0
  }

  let score = result.confidence

  // Penalty: no explicit time
  if (!hasExplicitTime) {
    score -= 0.15
  }

  // Additional penalty: vague relative phrasing
  const isVague = VAGUE_TIME_PATTERNS.some((pattern) => pattern.test(originalText))
  if (isVague) {
    score -= 0.2
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, score))
}

// ─── needsConfirmation ────────────────────────────────────────────────────────

/**
 * Returns true if the parse result should be shown to the user for confirmation
 * before saving, based on the pre-computed confidence score on the result.
 */
export function needsConfirmation(result: ParseResult): boolean {
  return result.confidence < CONFIDENCE_THRESHOLD
}
