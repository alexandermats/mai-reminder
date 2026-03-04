import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ElectronReminderRepository } from '../../src/db/electronReminderRepository'
import type { DatabaseConnection } from '../../src/db/connection'
import { createDatabase, runMigrations } from '../../src/db/connection'
import { ReminderLanguage, ReminderSource, ReminderParserMode } from '../../src/types/reminder'
describe('Database Performance', () => {
  let db: DatabaseConnection
  let repo: ElectronReminderRepository
  beforeEach(() => {
    // using in-memory db for baseline performance benchmark
    db = createDatabase(':memory:')
    runMigrations(db)
    repo = new ElectronReminderRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('lists upcoming reminders in < 50ms with 1000 items', async () => {
    // Seed 1000 items
    const now = new Date()
    for (let i = 0; i < 1000; i++) {
      const scheduledAt = new Date(now.getTime() + (i + 1) * 60000) // All in the future
      await repo.create({
        title: `Perf reminder ${i} `,
        originalText: 'Test phrase',
        language: ReminderLanguage.EN,
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LOCAL,
        scheduledAt: scheduledAt,
      })
    }

    const start = performance.now()
    const upcoming = await repo.listUpcoming(now)
    const end = performance.now()

    const duration = end - start

    expect(upcoming.length).toBe(1000)
    // We assert it takes less than 50ms.
    // Console log the duration for visibility
    console.log(`[Perf] DB listUpcoming with 1000 items took: ${duration.toFixed(2)} ms`)
    expect(duration).toBeLessThan(50)
  })
})
