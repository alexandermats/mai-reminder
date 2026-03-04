import { describe, it, expect } from 'vitest'
import { ChronoLocalParser } from '../../src/parser/localParser'

describe('Parser Performance', () => {
  const parser = new ChronoLocalParser()

  it('parses typical phrases locally in < 500ms', async () => {
    const phrases = [
      'Meeting tomorrow at 3pm',
      'Doctor appointment on Friday 10:00',
      'Call John next Monday morning',
      'Pay bills on the 15th of next month at noon',
      'Buy groceries tonight at 7 PM',
    ]

    const latencies: number[] = []

    for (const phrase of phrases) {
      const start = performance.now()
      await parser.parse({ text: phrase, language: 'en' })
      const end = performance.now()
      latencies.push(end - start)
    }

    const maxLatency = Math.max(...latencies)
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length

    console.log(
      `[Perf] Local Parser - Max Latency: ${maxLatency.toFixed(2)}ms, Avg Latency: ${avgLatency.toFixed(2)}ms`
    )

    expect(maxLatency).toBeLessThan(500)
    expect(avgLatency).toBeLessThan(500)
  })
})
