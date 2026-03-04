import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test'
import type { ElectronAPI } from '../src/electron/types'

let electronApp: ElectronApplication
let window: Page

async function ensureRendererReady(page: Page) {
  await page.waitForFunction(
    () => {
      const api = (window as Window & { electronAPI?: ElectronAPI }).electronAPI
      return !!api && !!api.reminders && !!api.settings
    },
    { timeout: 30000 }
  )
}

async function ensureLocalModeAndNoFastSave(page: Page) {
  await page.evaluate(async () => {
    const api = (window as Window & { electronAPI: ElectronAPI }).electronAPI
    await api.settings.setSetting('parserMode', 'local')
    await api.settings.setSetting('fastSave', 'false')
    location.hash = '/'
  })
}

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: ['dist-electron/electron/main.js'],
    env: { ...process.env, NODE_ENV: 'production' },
  })

  window = await electronApp.firstWindow()
  window.setDefaultTimeout(45000)

  await window.evaluate(() => {
    localStorage.setItem('app-language', 'en')
  })
  await window.evaluate(() => {
    location.hash = '/'
    location.reload()
  })

  await window.waitForLoadState('load')
  await ensureRendererReady(window)
  await ensureLocalModeAndNoFastSave(window)
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close()
  }
})

test('recurring reminder lifecycle via Electron API', async () => {
  const unique = Math.random().toString(36).slice(2, 8)
  const seriesTitle = `Recurring Series ${unique}`

  const lifecycle = await window.evaluate(async (title) => {
    const api = (window as Window & { electronAPI: ElectronAPI }).electronAPI
    const created = await api.reminders.create({
      title,
      originalText: `${title} every monday`,
      language: 'en',
      scheduledAt: new Date(Date.now() + 3600_000),
      source: 'text',
      parserMode: 'local',
    })
    await api.reminders.update(created.id, {
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
    })

    const afterRecurring = await api.reminders.getById(created.id)
    const next = new Date(afterRecurring!.scheduledAt)
    next.setUTCDate(next.getUTCDate() + 7)

    // "Single occurrence" behavior equivalent: advance series date, keep series active.
    await api.reminders.update(created.id, {
      scheduledAt: next,
      status: 'pending',
    })
    const afterSingleOccurrenceSkip = await api.reminders.getById(created.id)

    // "Entire series" behavior equivalent: cancel series.
    await api.reminders.update(created.id, { status: 'cancelled' })
    const afterSeriesCancel = await api.reminders.getById(created.id)

    return {
      id: created.id,
      recurrenceRule: afterRecurring?.recurrenceRule,
      skippedScheduledAt: afterSingleOccurrenceSkip?.scheduledAt,
      finalStatus: afterSeriesCancel?.status,
    }
  }, seriesTitle)

  expect(lifecycle.id).toBeTruthy()
  expect(lifecycle.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO')
  expect(lifecycle.skippedScheduledAt).toBeTruthy()
  expect(lifecycle.finalStatus).toBe('cancelled')
})

// eslint-disable-next-line no-empty-pattern
test('local parser recurrence assessment matrix', async ({}, testInfo) => {
  const phrases = [
    'Pay rent every month at 9am',
    'Workout every Monday at 7am',
    'Take vitamins every day at 8am',
    'Stand up every 2 hours',
    'Read book every weekday at 6pm',
  ]

  const rows: Array<{
    phrase: string
    modalOpened: boolean
    recurrenceDetected: boolean
    parsedTitle: string | null
    error?: string
  }> = []

  for (const phrase of phrases) {
    try {
      const input = window.locator('.custom-input input').first()
      await expect(input).toBeVisible()
      await input.fill(phrase)
      await input.press('Enter')

      const modal = window.locator('ion-modal').last()
      await expect(modal).toBeVisible({ timeout: 10000 })

      const title = await modal.locator('ion-input input').inputValue()
      const recurrenceDetected = await modal
        .locator('[data-test="recurrence-description"]')
        .isVisible()

      rows.push({
        phrase,
        modalOpened: true,
        recurrenceDetected,
        parsedTitle: title,
      })

      await modal.locator('ion-button', { hasText: 'Cancel' }).first().click()
      await expect(modal).not.toBeVisible()
    } catch (error) {
      rows.push({
        phrase,
        modalOpened: false,
        recurrenceDetected: false,
        parsedTitle: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const openedCount = rows.filter((r) => r.modalOpened).length
  const recurrenceDetectedCount = rows.filter((r) => r.recurrenceDetected).length
  const summary = {
    totalPhrases: rows.length,
    modalOpenRate: openedCount / rows.length,
    recurrenceDetectionRate: recurrenceDetectedCount / rows.length,
    rows,
  }

  await testInfo.attach('local-recurrence-assessment.json', {
    body: Buffer.from(JSON.stringify(summary, null, 2), 'utf-8'),
    contentType: 'application/json',
  })

  // Assessment gate: local parser should at least parse datetime from most phrases without crashing.
  expect(openedCount).toBeGreaterThanOrEqual(Math.ceil(rows.length * 0.8))
})
