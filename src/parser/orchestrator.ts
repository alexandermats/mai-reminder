/**
 * Parser orchestrator (E2-04)
 * Routes parse requests to LLM or local parser based on:
 *  - User settings (getLlmEnabled)
 *  - Input preferredMode hint
 *  - LLM failure → automatic local fallback
 */

import type { ParseInput, ParseResult, Parser } from './types'
import { isParseError } from './types'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  llmParser: Parser
  localParser: Parser
  /**
   * Called before each parse to check current user preference.
   * Using a getter (not a static value) lets the user toggle mid-session.
   */
  getLlmEnabled: () => boolean
  getApiKey: () => string
}

// ─── ParserOrchestrator ───────────────────────────────────────────────────────

/**
 * Central coordinator that implements the decision table from the ticket spec.
 *
 * Branch 1: LLM enabled + success               → LLM result
 * Branch 2: LLM disabled in settings            → local parser
 * Branch 3: LLM timeout / network / rate-limit  → local fallback
 * Branch 4: LLM ParseFailure                    → local fallback
 * Branch 5: Both parsers fail                   → throw ParseError with details
 */
export class ParserOrchestrator implements Parser {
  private readonly llmParser: Parser
  private readonly localParser: Parser
  private readonly getLlmEnabled: () => boolean
  private readonly getApiKey: () => string

  /** Reason logged when the last parse fell back from LLM to local. Null if no fallback occurred. */
  private lastFallbackReason: string | null = null

  constructor(config: OrchestratorConfig) {
    this.llmParser = config.llmParser
    this.localParser = config.localParser
    this.getLlmEnabled = config.getLlmEnabled
    this.getApiKey = config.getApiKey
  }

  async parse(input: ParseInput): Promise<ParseResult> {
    this.lastFallbackReason = null

    const useLlm = this.getLlmEnabled() && !!this.getApiKey() && input.preferredMode !== 'local'

    if (!useLlm) {
      // Branch 2 or preferredMode='local': skip LLM entirely
      return this.parseWithLocal(input)
    }

    // Branch 1: try LLM first
    try {
      const result = await this.llmParser.parse(input)
      return {
        ...result,
        originalText: input.text,
        language: input.language,
      }
    } catch (llmErr) {
      // Branches 3 & 4: any LLM error → fall back to local
      const reason = isParseError(llmErr)
        ? `LLM ${llmErr.kind}: ${llmErr.message}`
        : `LLM unexpected error: ${String(llmErr)}`

      this.lastFallbackReason = reason
      console.log(`[Orchestrator] Falling back to local parser. Reason: ${reason}`)

      return this.parseWithLocal(input)
    }
  }

  /** Returns the fallback reason from the most recent parse, or null if no fallback occurred. */
  getLastFallbackReason(): string | null {
    return this.lastFallbackReason
  }

  private async parseWithLocal(input: ParseInput): Promise<ParseResult> {
    // Branch 5: local also fails → bubble error to caller
    const result = await this.localParser.parse(input)
    return {
      ...result,
      originalText: input.text,
      language: input.language,
    }
  }
}

import { CerebrasParser } from './llmParser'
import { ChronoLocalParser } from './localParser'

import { useSettingsStore } from '../stores/settings'

export const orchestrator = new ParserOrchestrator({
  llmParser: new CerebrasParser({
    apiKey: () => {
      try {
        const store = useSettingsStore()
        return store.cerebrasApiKey
      } catch {
        return ''
      }
    },
  }),
  localParser: new ChronoLocalParser(),
  getLlmEnabled: () => {
    try {
      const store = useSettingsStore()
      return store.isAIParsingEnabled
    } catch {
      // Pinia might not be initialized in some test contexts
      return false
    }
  },
  getApiKey: () => {
    try {
      const store = useSettingsStore()
      return store.cerebrasApiKey
    } catch {
      return ''
    }
  },
})

export type { ParseResult } from './types'
