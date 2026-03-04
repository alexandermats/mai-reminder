import { describe, it, expect, vi } from 'vitest'
import type {
  ParseInput,
  ParseResult,
  ParseError,
  Parser,
  NetworkError,
  TimeoutError,
  ParseFailureError,
} from '../src/parser/types'
import {
  isNetworkError,
  isTimeoutError,
  isParseFailureError,
  isParseError,
} from '../src/parser/types'

describe('Parser Contract (E2-01)', () => {
  describe('ParseInput interface', () => {
    it('accepts minimal valid input with text and language', () => {
      const input: ParseInput = {
        text: 'Remind me tomorrow at 3pm',
        language: 'en',
      }

      expect(input.text).toBe('Remind me tomorrow at 3pm')
      expect(input.language).toBe('en')
      expect(input.preferredMode).toBeUndefined()
    })

    it('accepts input with optional preferredMode', () => {
      const input: ParseInput = {
        text: 'Remind me tomorrow at 3pm',
        language: 'en',
        preferredMode: 'llm',
      }

      expect(input.preferredMode).toBe('llm')
    })

    it('accepts Russian language input', () => {
      const input: ParseInput = {
        text: 'Напомни мне завтра в 15:00',
        language: 'ru',
      }

      expect(input.language).toBe('ru')
    })

    it('accepts local as preferredMode', () => {
      const input: ParseInput = {
        text: 'In 2 hours',
        language: 'en',
        preferredMode: 'local',
      }

      expect(input.preferredMode).toBe('local')
    })
  })

  describe('ParseResult interface', () => {
    it('contains all required fields', () => {
      const result: ParseResult = {
        title: 'Doctor appointment',
        scheduledAt: new Date('2026-02-23T15:00:00Z'),
        confidence: 0.92,
        usedMode: 'llm',
      }

      expect(result.title).toBe('Doctor appointment')
      expect(result.scheduledAt).toBeInstanceOf(Date)
      expect(result.confidence).toBe(0.92)
      expect(result.usedMode).toBe('llm')
    })

    it('confidence ranges from 0.0 to 1.0', () => {
      const lowConf: ParseResult = {
        title: 'Meeting',
        scheduledAt: new Date(),
        confidence: 0.0,
        usedMode: 'local',
      }

      const highConf: ParseResult = {
        title: 'Dinner',
        scheduledAt: new Date(),
        confidence: 1.0,
        usedMode: 'llm',
      }

      expect(lowConf.confidence).toBe(0.0)
      expect(highConf.confidence).toBe(1.0)
    })

    it('usedMode is either "llm" or "local"', () => {
      const llmResult: ParseResult = {
        title: 'Test',
        scheduledAt: new Date(),
        confidence: 0.8,
        usedMode: 'llm',
      }

      const localResult: ParseResult = {
        title: 'Test',
        scheduledAt: new Date(),
        confidence: 0.7,
        usedMode: 'local',
      }

      expect(llmResult.usedMode).toBe('llm')
      expect(localResult.usedMode).toBe('local')
    })

    it('accepts optional recurrenceRule', () => {
      const recurringResult: ParseResult = {
        title: 'Stand up',
        scheduledAt: new Date(),
        confidence: 0.9,
        usedMode: 'llm',
        recurrenceRule: 'FREQ=HOURLY;INTERVAL=1',
      }

      expect(recurringResult.recurrenceRule).toBe('FREQ=HOURLY;INTERVAL=1')
    })
  })

  describe('ParseError discriminated union', () => {
    describe('NetworkError', () => {
      it('has kind "NetworkError" and message', () => {
        const error: NetworkError = {
          kind: 'NetworkError',
          message: 'Failed to connect to Cerebras API',
        }

        expect(error.kind).toBe('NetworkError')
        expect(error.message).toBe('Failed to connect to Cerebras API')
      })

      it('isNetworkError returns true for NetworkError', () => {
        const error: ParseError = {
          kind: 'NetworkError',
          message: 'Connection refused',
        }

        expect(isNetworkError(error)).toBe(true)
      })

      it('isNetworkError returns false for TimeoutError', () => {
        const error: ParseError = {
          kind: 'TimeoutError',
          message: 'Request timed out',
          timeoutMs: 5000,
        }

        expect(isNetworkError(error)).toBe(false)
      })
    })

    describe('TimeoutError', () => {
      it('has kind "TimeoutError", message, and timeoutMs', () => {
        const error: TimeoutError = {
          kind: 'TimeoutError',
          message: 'Request timed out after 5000ms',
          timeoutMs: 5000,
        }

        expect(error.kind).toBe('TimeoutError')
        expect(error.message).toBe('Request timed out after 5000ms')
        expect(error.timeoutMs).toBe(5000)
      })

      it('isTimeoutError returns true for TimeoutError', () => {
        const error: ParseError = {
          kind: 'TimeoutError',
          message: 'Timed out',
          timeoutMs: 3000,
        }

        expect(isTimeoutError(error)).toBe(true)
      })

      it('isTimeoutError returns false for ParseFailureError', () => {
        const error: ParseError = {
          kind: 'ParseFailureError',
          message: 'Could not parse date',
          reason: 'No date found in text',
        }

        expect(isTimeoutError(error)).toBe(false)
      })
    })

    describe('ParseFailureError', () => {
      it('has kind "ParseFailureError", message, and reason', () => {
        const error: ParseFailureError = {
          kind: 'ParseFailureError',
          message: 'Unable to extract reminder details',
          reason: 'No recognizable date/time pattern found',
        }

        expect(error.kind).toBe('ParseFailureError')
        expect(error.message).toBe('Unable to extract reminder details')
        expect(error.reason).toBe('No recognizable date/time pattern found')
      })

      it('isParseFailureError returns true for ParseFailureError', () => {
        const error: ParseError = {
          kind: 'ParseFailureError',
          message: 'Parse failed',
          reason: 'Invalid input',
        }

        expect(isParseFailureError(error)).toBe(true)
      })

      it('isParseFailureError returns false for NetworkError', () => {
        const error: ParseError = {
          kind: 'NetworkError',
          message: 'Network down',
        }

        expect(isParseFailureError(error)).toBe(false)
      })
    })

    describe('isParseError (generic guard)', () => {
      it('returns true for any ParseError variant', () => {
        const networkErr: ParseError = { kind: 'NetworkError', message: 'fail' }
        const timeoutErr: ParseError = { kind: 'TimeoutError', message: 'timeout', timeoutMs: 1000 }
        const parseErr: ParseError = {
          kind: 'ParseFailureError',
          message: 'fail',
          reason: 'no date',
        }

        expect(isParseError(networkErr)).toBe(true)
        expect(isParseError(timeoutErr)).toBe(true)
        expect(isParseError(parseErr)).toBe(true)
      })

      it('returns false for non-error objects', () => {
        expect(isParseError(null)).toBe(false)
        expect(isParseError(undefined)).toBe(false)
        expect(isParseError('string')).toBe(false)
        expect(isParseError({})).toBe(false)
        expect(isParseError({ kind: 'Unknown' })).toBe(false)
      })
    })
  })

  describe('Parser interface (contract tests)', () => {
    it('mock LLM parser conforms to Parser interface', async () => {
      const mockLlmParser: Parser = {
        parse: vi.fn().mockResolvedValue({
          title: 'Doctor appointment',
          scheduledAt: new Date('2026-02-23T15:00:00Z'),
          confidence: 0.95,
          usedMode: 'llm',
        } satisfies ParseResult),
      }

      const input: ParseInput = { text: 'Doctor tomorrow at 3pm', language: 'en' }
      const result = await mockLlmParser.parse(input)

      expect(result).toHaveProperty('title')
      expect(result).toHaveProperty('scheduledAt')
      expect(result).toHaveProperty('confidence')
      expect(result).toHaveProperty('usedMode')
    })

    it('mock local parser conforms to Parser interface', async () => {
      const mockLocalParser: Parser = {
        parse: vi.fn().mockResolvedValue({
          title: 'Meeting',
          scheduledAt: new Date('2026-02-23T14:00:00Z'),
          confidence: 0.75,
          usedMode: 'local',
        } satisfies ParseResult),
      }

      const input: ParseInput = { text: 'Meeting at 2pm tomorrow', language: 'en' }
      const result = await mockLocalParser.parse(input)

      expect(result.usedMode).toBe('local')
    })

    it('parser returns a Promise', () => {
      const mockParser: Parser = {
        parse: vi.fn().mockResolvedValue({
          title: 'Test',
          scheduledAt: new Date(),
          confidence: 0.5,
          usedMode: 'llm',
        } satisfies ParseResult),
      }

      const input: ParseInput = { text: 'Test', language: 'en' }
      const resultPromise = mockParser.parse(input)

      expect(resultPromise).toBeInstanceOf(Promise)
    })

    it('parser can reject with a ParseError', async () => {
      const mockFailingParser: Parser = {
        parse: vi.fn().mockRejectedValue({
          kind: 'NetworkError',
          message: 'API unreachable',
        } satisfies NetworkError),
      }

      const input: ParseInput = { text: 'Test', language: 'en' }

      await expect(mockFailingParser.parse(input)).rejects.toMatchObject({
        kind: 'NetworkError',
        message: 'API unreachable',
      })
    })
  })
})
