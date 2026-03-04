import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CerebrasParser } from '../src/parser/llmParser'
import type { ParseInput } from '../src/parser/types'
import { isTimeoutError, isNetworkError, isParseFailureError } from '../src/parser/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FUTURE_ISO = '2026-02-24T15:00:00.000Z'

function makeSuccessResponse(overrides: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            title: 'Doctor appointment',
            scheduledAt: FUTURE_ISO,
            language: 'en',
            ...overrides,
          }),
        },
      },
    ],
  }
}

function mockFetch(status: number, body: unknown, delay = 0): typeof global.fetch {
  return vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(body),
            text: () => Promise.resolve(JSON.stringify(body)),
          } as Response)
        }, delay)
      })
  ) as unknown as typeof global.fetch
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CerebrasParser (E2-02)', () => {
  const validInput: ParseInput = {
    text: 'Doctor appointment tomorrow at 3pm',
    language: 'en',
  }

  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // ── Construction ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('accepts an API key', () => {
      expect(() => new CerebrasParser({ apiKey: () => 'test-key' })).not.toThrow()
    })

    it('uses default timeout of 5000ms when not provided', () => {
      const parser = new CerebrasParser({ apiKey: () => 'key' })
      expect(parser.timeoutMs).toBe(5000)
    })

    it('accepts a custom timeout', () => {
      const parser = new CerebrasParser({ apiKey: () => 'key', timeoutMs: 8000 })
      expect(parser.timeoutMs).toBe(8000)
    })

    it('uses default maxRetries of 3 when not provided', () => {
      const parser = new CerebrasParser({ apiKey: () => 'key' })
      expect(parser.maxRetries).toBe(3)
    })
  })

  // ── 200 Happy path ────────────────────────────────────────────────────────

  describe('parse() – 200 success', () => {
    it('returns a ParseResult with title, scheduledAt, confidence and usedMode', async () => {
      global.fetch = mockFetch(200, makeSuccessResponse())

      const parser = new CerebrasParser({ apiKey: () => 'key' })
      const result = await parser.parse(validInput)

      expect(result.title).toBe('Doctor appointment')
      expect(result.scheduledAt).toBeInstanceOf(Date)
      expect(typeof result.confidence).toBe('number')
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
      expect(result.usedMode).toBe('llm')
    })

    it('sends POST to Cerebras API endpoint', async () => {
      global.fetch = mockFetch(200, makeSuccessResponse())

      const parser = new CerebrasParser({ apiKey: () => 'key' })
      await parser.parse(validInput)

      expect(global.fetch).toHaveBeenCalledOnce()
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(url).toContain('cerebras')
    })

    it('includes Authorization header with api key', async () => {
      global.fetch = mockFetch(200, makeSuccessResponse())

      const parser = new CerebrasParser({ apiKey: () => 'test-api-key' })
      await parser.parse(validInput)

      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect((init as RequestInit).headers).toBeDefined()
      const headers = (init as RequestInit).headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer test-api-key')
    })

    it('parses scheduledAt ISO string to Date', async () => {
      global.fetch = mockFetch(200, makeSuccessResponse({ scheduledAt: FUTURE_ISO }))

      const parser = new CerebrasParser({ apiKey: () => 'key' })
      const result = await parser.parse(validInput)

      expect(result.scheduledAt.toISOString()).toBe(FUTURE_ISO)
    })

    it('extracts recurrenceRule when LLM returns it', async () => {
      global.fetch = mockFetch(
        200,
        makeSuccessResponse({ recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0' })
      )

      const parser = new CerebrasParser({ apiKey: () => 'key' })
      const result = await parser.parse(validInput)

      expect(result.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0')
    })

    it('omits recurrenceRule when LLM returns null', async () => {
      global.fetch = mockFetch(200, makeSuccessResponse({ recurrenceRule: null }))

      const parser = new CerebrasParser({ apiKey: () => 'key' })
      const result = await parser.parse(validInput)

      expect(result.recurrenceRule).toBeUndefined()
    })

    it('includes RRULE instructions in the prompt sent to Cerebras', async () => {
      global.fetch = mockFetch(200, makeSuccessResponse())

      const parser = new CerebrasParser({ apiKey: () => 'key' })
      await parser.parse(validInput)

      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const request = JSON.parse((init as RequestInit).body as string) as {
        messages: Array<{ content: string }>
      }
      const prompt = request.messages[0].content

      expect(prompt).toContain('recurrenceRule')
      expect(prompt).toContain('FREQ=WEEKLY;BYDAY=MO')
      expect(prompt).toContain('FREQ=DAILY')
    })
  })

  // ── Timeout ───────────────────────────────────────────────────────────────

  describe('parse() – timeout', () => {
    it('throws TimeoutError when request exceeds timeoutMs', async () => {
      // 50ms timeout, 200ms delay → should time out
      global.fetch = mockFetch(200, makeSuccessResponse(), 200)

      const parser = new CerebrasParser({ apiKey: () => 'key', timeoutMs: 50, maxRetries: 1 })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isTimeoutError)
    })

    it('TimeoutError includes timeoutMs value', async () => {
      global.fetch = mockFetch(200, makeSuccessResponse(), 200)

      const parser = new CerebrasParser({ apiKey: () => 'key', timeoutMs: 50, maxRetries: 1 })

      try {
        await parser.parse(validInput)
        expect.fail('should have thrown')
      } catch (err) {
        if (isTimeoutError(err)) {
          expect(err.timeoutMs).toBe(50)
        } else {
          throw err
        }
      }
    })
  })

  // ── 429 Rate limit ────────────────────────────────────────────────────────

  describe('parse() – 429 rate limit', () => {
    it('retries on 429 and eventually succeeds', async () => {
      let callCount = 0
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: () => Promise.resolve({ error: 'rate limit' }),
            text: () => Promise.resolve('rate limit'),
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(makeSuccessResponse()),
          text: () => Promise.resolve(JSON.stringify(makeSuccessResponse())),
        })
      })

      const parser = new CerebrasParser({ apiKey: () => 'key', maxRetries: 3, retryDelayMs: 0 })
      const result = await parser.parse(validInput)

      expect(callCount).toBe(3)
      expect(result.usedMode).toBe('llm')
    })

    it('throws NetworkError after exhausting retries on 429', async () => {
      global.fetch = mockFetch(429, { error: 'rate limit' })

      const parser = new CerebrasParser({ apiKey: () => 'key', maxRetries: 3, retryDelayMs: 0 })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isNetworkError)
    })
  })

  // ── 5xx Server error ──────────────────────────────────────────────────────

  describe('parse() – 5xx server error', () => {
    it('retries on 500 and eventually succeeds', async () => {
      let callCount = 0
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 2) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'server error' }),
            text: () => Promise.resolve('server error'),
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(makeSuccessResponse()),
          text: () => Promise.resolve(JSON.stringify(makeSuccessResponse())),
        })
      })

      const parser = new CerebrasParser({ apiKey: () => 'key', maxRetries: 3, retryDelayMs: 0 })
      const result = await parser.parse(validInput)

      expect(callCount).toBe(2)
      expect(result.title).toBe('Doctor appointment')
    })

    it('throws NetworkError after exhausting retries on 500', async () => {
      global.fetch = mockFetch(500, { error: 'server error' })

      const parser = new CerebrasParser({ apiKey: () => 'key', maxRetries: 3, retryDelayMs: 0 })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isNetworkError)
    })

    it('throws NetworkError on 503', async () => {
      global.fetch = mockFetch(503, { error: 'service unavailable' })

      const parser = new CerebrasParser({ apiKey: () => 'key', maxRetries: 3, retryDelayMs: 0 })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isNetworkError)
    })
  })

  // ── Invalid JSON ──────────────────────────────────────────────────────────

  describe('parse() – invalid JSON / bad response schema', () => {
    it('throws ParseFailureError when response content is not valid JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: 'not json at all' } }] }),
        text: () => Promise.resolve(''),
      })

      const parser = new CerebrasParser({ apiKey: () => 'key' })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isParseFailureError)
    })

    it('throws ParseFailureError when title is missing', async () => {
      global.fetch = mockFetch(200, makeSuccessResponse({ title: undefined }))

      const parser = new CerebrasParser({ apiKey: () => 'key' })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isParseFailureError)
    })

    it('throws ParseFailureError when scheduledAt is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({ title: 'Meeting' }), // missing scheduledAt
                },
              },
            ],
          }),
        text: () => Promise.resolve(''),
      })

      const parser = new CerebrasParser({ apiKey: () => 'key' })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isParseFailureError)
    })

    it('throws ParseFailureError when choices array is empty', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [] }),
        text: () => Promise.resolve(''),
      })

      const parser = new CerebrasParser({ apiKey: () => 'key' })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isParseFailureError)
    })

    it('throws ParseFailureError when recurrenceRule is not a valid RRULE', async () => {
      global.fetch = mockFetch(200, makeSuccessResponse({ recurrenceRule: 'every monday forever' }))

      const parser = new CerebrasParser({ apiKey: () => 'key' })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isParseFailureError)
    })
  })

  // ── Network failure ───────────────────────────────────────────────────────

  describe('parse() – network failure', () => {
    it('throws NetworkError when fetch itself throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

      const parser = new CerebrasParser({ apiKey: () => 'key', maxRetries: 1, retryDelayMs: 0 })

      await expect(parser.parse(validInput)).rejects.toSatisfy(isNetworkError)
    })
  })
})
