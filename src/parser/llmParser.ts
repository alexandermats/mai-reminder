/**
 * LLM parser client for Cerebras (E2-02)
 * Calls the Cerebras API to extract structured reminder data from free text.
 */

import type { ParseInput, ParseResult, Parser } from './types'
import { isParseError } from './types'
import { normalizeRRule } from './rrule'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface CerebrasParserConfig {
  /** Cerebras API key getter */
  apiKey: () => string
  /** Request timeout in ms. Default: 5000 */
  timeoutMs?: number
  /** Maximum number of attempts (including first try). Default: 3 */
  maxRetries?: number
  /** Base delay between retries in ms (for exponential backoff). Default: 500 */
  retryDelayMs?: number
  /** Cerebras API base URL. Default: https://api.cerebras.ai/v1 */
  apiBaseUrl?: string
}

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 500
const DEFAULT_API_BASE_URL = 'https://api.cerebras.ai/v1'

// ─── Response shape from Cerebras ────────────────────────────────────────────

interface CerebrasChoice {
  message: {
    content: string
  }
}

interface CerebrasResponse {
  choices: CerebrasChoice[]
}

/** Shape that should be embedded in the LLM's JSON content field */
interface ParsedContent {
  title: string
  scheduledAt: string
  language?: string
  recurrenceRule?: string | null
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(input: ParseInput): string {
  const nowISO = new Date().toISOString()
  return `You are a reminder-extraction assistant. Extract the reminder details from the user text and return ONLY valid JSON.

Current time (UTC): ${nowISO}
User language: ${input.language}

User text: "${input.text}"

Respond with ONLY this JSON structure (no markdown, no extra text):
{
  "title": "<short reminder title extracted from the text>",
  "scheduledAt": "<ISO-8601 UTC datetime string, e.g. 2026-02-24T15:00:00.000Z>",
  "language": "${input.language}",
  "recurrenceRule": "<optional RRULE string, or null when no recurrence>"
}

Rules:
- title: concise summary of what to be reminded about (required)
- scheduledAt: exact UTC datetime for the reminder (required)
- recurrenceRule: include only when user asks for repetition. Use iCalendar RRULE format.
- recurrenceRule examples:
  - every day: FREQ=DAILY
  - every Monday at 09:00: FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0
  - every 2 weeks on Tuesday: FREQ=WEEKLY;INTERVAL=2;BYDAY=TU
  - every hour: FREQ=HOURLY;INTERVAL=1
- Do not include any text outside the JSON object`
}

// ─── CerebrasParser ──────────────────────────────────────────────────────────

/**
 * Parser implementation that calls the Cerebras API.
 * Implements the Parser interface from E2-01.
 */
export class CerebrasParser implements Parser {
  readonly timeoutMs: number
  readonly maxRetries: number
  readonly retryDelayMs: number

  private readonly getApiKey: () => string
  private readonly apiBaseUrl: string

  constructor(config: CerebrasParserConfig) {
    this.getApiKey = config.apiKey
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL
  }

  async parse(input: ParseInput): Promise<ParseResult> {
    let lastError: unknown

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.attemptParse(input)
      } catch (err) {
        lastError = err

        // Don't retry ParseFailureErrors — the LLM returned something
        // we can't use; retrying won't help
        if (isParseError(err) && err.kind === 'ParseFailureError') {
          throw err
        }

        // Don't retry TimeoutErrors
        if (isParseError(err) && err.kind === 'TimeoutError') {
          throw err
        }

        // Retry on NetworkError (includes 429 & 5xx)
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1) // exponential backoff
          await sleep(delay)
        }
      }
    }

    throw lastError
  }

  private async attemptParse(input: ParseInput): Promise<ParseResult> {
    const controller = new AbortController()

    // Timeout promise — resolves with a TimeoutError marker after timeoutMs
    const timeoutPromise = sleep(this.timeoutMs).then((): never => {
      controller.abort()
      throw {
        kind: 'TimeoutError' as const,
        message: `Cerebras API request timed out after ${this.timeoutMs}ms`,
        timeoutMs: this.timeoutMs,
      }
    })

    const fetchPromiseInternal = fetch(`${this.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getApiKey()}`,
      },
      body: JSON.stringify({
        model: 'gpt-oss-120b',
        messages: [{ role: 'user', content: buildPrompt(input) }],
        temperature: 0.1,
        max_tokens: 256,
      }),
    })

    console.log(`[CerebrasParser] Requesting parse for: "${input.text}"`)

    const fetchPromise = fetchPromiseInternal.catch((err: unknown) => {
      // Swallow AbortError — the timeout promise already threw
      if (err instanceof DOMException && err.name === 'AbortError') {
        return Promise.race([]) as never // hang forever; timeout won the race
      }
      throw {
        kind: 'NetworkError' as const,
        message: `Network error calling Cerebras API: ${err instanceof Error ? err.message : String(err)}`,
      }
    })

    // Race: whichever settles first wins
    const response = await Promise.race([fetchPromise, timeoutPromise])

    // HTTP-level errors
    if (!response.ok) {
      throw {
        kind: 'NetworkError' as const,
        message: `Cerebras API returned HTTP ${response.status}`,
      }
    }

    // Parse the API response
    let body: CerebrasResponse
    try {
      body = (await response.json()) as CerebrasResponse
    } catch {
      throw {
        kind: 'ParseFailureError' as const,
        message: 'Failed to parse Cerebras API response as JSON',
        reason: 'Invalid JSON in API response body',
      }
    }

    return extractParseResult(body)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractParseResult(body: CerebrasResponse): ParseResult {
  const firstChoice = body.choices?.[0]
  if (!firstChoice) {
    throw {
      kind: 'ParseFailureError' as const,
      message: 'Cerebras API returned empty choices array',
      reason: 'No choices in API response',
    }
  }

  const rawContent = firstChoice.message?.content
  if (!rawContent || typeof rawContent !== 'string') {
    throw {
      kind: 'ParseFailureError' as const,
      message: 'Cerebras API returned empty message content',
      reason: 'Missing or empty message content in API response',
    }
  }

  let cleanContent = rawContent.trim()

  // Strip markdown code blocks if present (E2-02 Robustness)
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()
  }

  let parsed: ParsedContent
  try {
    parsed = JSON.parse(cleanContent) as ParsedContent
  } catch {
    throw {
      kind: 'ParseFailureError' as const,
      message: 'LLM response content is not valid JSON',
      reason: `Content could not be parsed as JSON: ${cleanContent.slice(0, 100)}`,
    }
  }

  if (!parsed.title || typeof parsed.title !== 'string') {
    throw {
      kind: 'ParseFailureError' as const,
      message: 'LLM response missing required "title" field',
      reason: 'title field is absent or not a string',
    }
  }

  if (!parsed.scheduledAt || typeof parsed.scheduledAt !== 'string') {
    throw {
      kind: 'ParseFailureError' as const,
      message: 'LLM response missing required "scheduledAt" field',
      reason: 'scheduledAt field is absent or not a string',
    }
  }

  const scheduledAt = new Date(parsed.scheduledAt)
  if (isNaN(scheduledAt.getTime())) {
    throw {
      kind: 'ParseFailureError' as const,
      message: 'LLM response contains invalid scheduledAt date',
      reason: `Cannot parse "${parsed.scheduledAt}" as a valid date`,
    }
  }

  let recurrenceRule: string | undefined
  if (parsed.recurrenceRule !== undefined && parsed.recurrenceRule !== null) {
    if (typeof parsed.recurrenceRule !== 'string') {
      throw {
        kind: 'ParseFailureError' as const,
        message: 'LLM response contains invalid recurrenceRule type',
        reason: 'recurrenceRule must be a string or null',
      }
    }

    const normalized = normalizeRRule(parsed.recurrenceRule)
    if (!normalized) {
      throw {
        kind: 'ParseFailureError' as const,
        message: 'LLM response contains invalid recurrenceRule format',
        reason: `Invalid RRULE: ${parsed.recurrenceRule}`,
      }
    }
    recurrenceRule = normalized
  }

  return {
    title: parsed.title.trim(),
    scheduledAt,
    confidence: 0.85, // LLM results get a default high confidence; E2-05 will refine this
    usedMode: 'llm',
    recurrenceRule,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
