import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test'
import type { ElectronAPI } from '../src/electron/types'

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: ['dist-electron/electron/main.js'],
    env: { ...process.env, NODE_ENV: 'production' },
  })

  window = await electronApp.firstWindow()
  window.setDefaultTimeout(30000)

  await window.evaluate(() => {
    localStorage.setItem('app-language', 'en')
  })
  await window.evaluate(() => {
    location.hash = '/'
    location.reload()
  })
  await window.waitForLoadState('load')
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close()
  }
})

test('Redesign Reminder List displays 4 columns correctly (E13-01)', async () => {
  const unique = Math.random().toString(36).slice(2, 8)
  const title = `E13-01 multi-column test ${unique}`

  // Ensure the list is populated
  await window.evaluate(async (testTitle) => {
    const api = (window as Window & { electronAPI: ElectronAPI }).electronAPI
    await api.reminders.create({
      title: testTitle,
      originalText: testTitle,
      language: 'en',
      scheduledAt: new Date(Date.now() + 15 * 60_000), // 15m from now
      source: 'text',
      parserMode: 'local',
      recurrenceRule: 'FREQ=DAILY',
    })
  }, title)

  const item = window.locator('[data-test="reminder-item"]', { hasText: title }).first()
  await expect(item).toBeVisible()

  // Column 1: Time and Date
  const colTime = item.locator('[data-test="reminder-time-col"]')
  await expect(colTime).toBeVisible()

  // Column 2: Recurrence
  const colRecurrence = item.locator('[data-test="reminder-recurrence-col"]')
  await expect(colRecurrence).toBeVisible()
  await expect(colRecurrence.locator('.recurring-indicator')).toBeVisible()

  // Column 3: Title
  const colTitle = item.locator('[data-test="reminder-title-col"]')
  await expect(colTitle).toBeVisible()
  await expect(colTitle).toContainText(title)

  // Column 4: Actions & Countdown
  const colActions = item.locator('[data-test="reminder-actions-col"]')
  await expect(colActions).toBeVisible()
  // It should be 15m or 14m depending on exact evaluation time
  await expect(colActions).toContainText(/in 1[45]m/)
})
