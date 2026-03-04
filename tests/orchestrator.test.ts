import { describe, it, expect, vi } from 'vitest'
import { ParserOrchestrator } from '../src/parser/orchestrator'
import type { ParseInput, ParseResult, Parser, ParseError } from '../src/parser/types'

// ─── Mock factories ───────────────────────────────────────────────────────────

const FUTURE_DATE = new Date('2026-03-01T15:00:00.000Z')

const LLM_RESULT: ParseResult = {
  title: 'LLM result',
  scheduledAt: FUTURE_DATE,
  confidence: 0.9,
  usedMode: 'llm',
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
}

const LOCAL_RESULT: ParseResult = {
  title: 'Local result',
  scheduledAt: FUTURE_DATE,
  confidence: 0.7,
  usedMode: 'local',
}

const NETWORK_ERROR: ParseError = { kind: 'NetworkError', message: 'API unreachable' }
const TIMEOUT_ERROR: ParseError = { kind: 'TimeoutError', message: 'timeout', timeoutMs: 5000 }
const PARSE_FAILURE: ParseError = {
  kind: 'ParseFailureError',
  message: 'no date found',
  reason: 'nothing parseable',
}

function makeParser(result: ParseResult | ParseError): Parser {
  if ('kind' in result) {
    return { parse: vi.fn().mockRejectedValue(result) }
  }
  return { parse: vi.fn().mockResolvedValue(result) }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ParserOrchestrator (E2-04)', () => {
  const input: ParseInput = { text: 'Doctor tomorrow at 3pm', language: 'en' }

  // ── Branch 1: LLM enabled + success ─────────────────────────────────────────

  describe('Branch 1: LLM enabled + success → use LLM result', () => {
    it('returns LLM result when LLM is enabled and succeeds', async () => {
      const llm = makeParser(LLM_RESULT)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => true,
        getApiKey: () => 'test-key',
      })

      const result = await orchestrator.parse(input)

      expect(result.usedMode).toBe('llm')
      expect(result.title).toBe('LLM result')
      expect(result.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO')
      expect(local.parse).not.toHaveBeenCalled()
    })
  })

  // ── Branch 2: LLM disabled in settings ───────────────────────────────────────

  describe('Branch 2: LLM disabled → use local parser', () => {
    it('uses local parser when LLM is disabled', async () => {
      const llm = makeParser(LLM_RESULT)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => false,
        getApiKey: () => 'test-key',
      })

      const result = await orchestrator.parse(input)

      expect(result.usedMode).toBe('local')
      expect(llm.parse).not.toHaveBeenCalled()
    })

    it('checks getLlmEnabled before each parse (can toggle mid-session)', async () => {
      let llmEnabled = true
      const llm = makeParser(LLM_RESULT)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => llmEnabled,
        getApiKey: () => 'test-key',
      })

      // First parse: LLM enabled
      const result1 = await orchestrator.parse(input)
      expect(result1.usedMode).toBe('llm')

      // Toggle to disabled
      llmEnabled = false

      // Second parse: should use local
      const result2 = await orchestrator.parse(input)
      expect(result2.usedMode).toBe('local')
    })

    it('uses local parser when AI is enabled but API key is missing', async () => {
      const llm = makeParser(LLM_RESULT)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => true,
        getApiKey: () => '',
      })

      const result = await orchestrator.parse(input)

      expect(result.usedMode).toBe('local')
      expect(llm.parse).not.toHaveBeenCalled()
    })
  })

  // ── Branch 3: LLM timeout/429/5xx → fallback to local ──────────────────────

  describe('Branch 3: LLM transient failure → fallback to local', () => {
    it('falls back to local on NetworkError', async () => {
      const llm = makeParser(NETWORK_ERROR)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => true,
        getApiKey: () => 'test-key',
      })

      const result = await orchestrator.parse(input)

      expect(result.usedMode).toBe('local')
      expect(local.parse).toHaveBeenCalledOnce()
    })

    it('falls back to local on TimeoutError', async () => {
      const llm = makeParser(TIMEOUT_ERROR)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => true,
        getApiKey: () => 'test-key',
      })

      const result = await orchestrator.parse(input)

      expect(result.usedMode).toBe('local')
    })
  })

  // ── Branch 4: LLM returns invalid/partial parse → fallback to local ─────────

  describe('Branch 4: LLM ParseFailureError → fallback to local', () => {
    it('falls back to local when LLM throws ParseFailureError', async () => {
      const llm = makeParser(PARSE_FAILURE)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => true,
        getApiKey: () => 'test-key',
      })

      const result = await orchestrator.parse(input)

      expect(result.usedMode).toBe('local')
    })
  })

  // ── Branch 5: Both parsers fail ───────────────────────────────────────────────

  describe('Branch 5: Both parsers fail → throw ParseError', () => {
    it('throws when both LLM and local fail', async () => {
      const llm = makeParser(NETWORK_ERROR)
      const local = makeParser(PARSE_FAILURE)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => true,
        getApiKey: () => 'test-key',
      })

      await expect(orchestrator.parse(input)).rejects.toMatchObject({
        kind: expect.stringMatching(/Error/),
      })
    })

    it('throws when LLM disabled and local fails', async () => {
      const llm = makeParser(LLM_RESULT)
      const local = makeParser(PARSE_FAILURE)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => false,
        getApiKey: () => 'test-key',
      })

      await expect(orchestrator.parse(input)).rejects.toMatchObject({
        kind: 'ParseFailureError',
      })
    })
  })

  // ── Preferred mode hint ───────────────────────────────────────────────────────

  describe('preferredMode hint in ParseInput', () => {
    it('uses local parser when preferredMode is "local" even if LLM enabled', async () => {
      const llm = makeParser(LLM_RESULT)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => true,
        getApiKey: () => 'test-key',
      })

      const result = await orchestrator.parse({ ...input, preferredMode: 'local' })

      expect(result.usedMode).toBe('local')
      expect(llm.parse).not.toHaveBeenCalled()
    })
  })

  // ── Fallback logging ──────────────────────────────────────────────────────────

  describe('fallback logging', () => {
    it('records fallback reason when LLM fails and local is used', async () => {
      const llm = makeParser(NETWORK_ERROR)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => true,
        getApiKey: () => 'test-key',
      })

      await orchestrator.parse(input)

      const log = orchestrator.getLastFallbackReason()
      expect(log).toBeTruthy()
      expect(typeof log).toBe('string')
    })

    it('fallback reason is null when no fallback occurred', async () => {
      const llm = makeParser(LLM_RESULT)
      const local = makeParser(LOCAL_RESULT)

      const orchestrator = new ParserOrchestrator({
        llmParser: llm,
        localParser: local,
        getLlmEnabled: () => true,
        getApiKey: () => 'test-key',
      })

      await orchestrator.parse(input)

      expect(orchestrator.getLastFallbackReason()).toBeNull()
    })
  })
})
