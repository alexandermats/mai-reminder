/**
 * Parser contract for E2-01
 * Defines the interfaces shared between LLM and local parser implementations.
 */

// ─── Input ────────────────────────────────────────────────────────────────────

/**
 * Input passed to any parser implementation.
 */
export interface ParseInput {
  /** The natural-language text to parse */
  text: string
  /** Language of the input text */
  language: 'en' | 'ru'
  /** Optional hint for which parser to prefer */
  preferredMode?: 'llm' | 'local'
}

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * Successful output from any parser implementation.
 */
export interface ParseResult {
  /** Extracted reminder title */
  title: string
  /** Parsed scheduled date/time (UTC) */
  scheduledAt: Date
  /** Confidence score in the range [0.0, 1.0] */
  confidence: number
  /** Which parser mode produced this result */
  usedMode: 'llm' | 'local'
  /** The original text that was parsed */
  originalText?: string
  /** The detected or provided language */
  language?: 'en' | 'ru'
  /** Optional iCalendar RRULE string for recurring reminders */
  recurrenceRule?: string
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Network-level error (e.g. DNS failure, connection refused).
 */
export interface NetworkError {
  kind: 'NetworkError'
  message: string
}

/**
 * Request timed out before the parser responded.
 */
export interface TimeoutError {
  kind: 'TimeoutError'
  message: string
  /** The configured timeout threshold in milliseconds */
  timeoutMs: number
}

/**
 * The parser returned a response but could not extract a valid reminder.
 */
export interface ParseFailureError {
  kind: 'ParseFailureError'
  message: string
  /** Human-readable explanation of why parsing failed */
  reason: string
}

/**
 * Discriminated union of all possible parse errors.
 * Use the type guard helpers below to narrow the type safely.
 */
export type ParseError = NetworkError | TimeoutError | ParseFailureError

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isNetworkError(error: unknown): error is NetworkError {
  return (
    typeof error === 'object' && error !== null && (error as NetworkError).kind === 'NetworkError'
  )
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return (
    typeof error === 'object' && error !== null && (error as TimeoutError).kind === 'TimeoutError'
  )
}

export function isParseFailureError(error: unknown): error is ParseFailureError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as ParseFailureError).kind === 'ParseFailureError'
  )
}

/** Returns true if the value is any of the ParseError variants. */
export function isParseError(error: unknown): error is ParseError {
  return isNetworkError(error) || isTimeoutError(error) || isParseFailureError(error)
}

// ─── Parser interface ─────────────────────────────────────────────────────────

/**
 * Contract that every parser implementation must satisfy.
 * Implementations throw a ParseError (or reject the promise with one) on failure.
 */
export interface Parser {
  /** Parse natural-language text and return a structured ParseResult. */
  parse(input: ParseInput): Promise<ParseResult>
}
