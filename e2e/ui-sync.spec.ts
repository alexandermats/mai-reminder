import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test'

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  test.setTimeout(120000) // Increase total test timeout
  electronApp = await electron.launch({
    args: ['dist-electron/electron/main.js'],
    env: { ...process.env, NODE_ENV: 'production' },
  })
  window = await electronApp.firstWindow()
  window.setDefaultTimeout(60000) // Increase individual action timeout

  // Set language to English for reliable testing
  await window.evaluate(() => {
    localStorage.setItem('app-language', 'en')
  })
  await window.evaluate(() => {
    location.reload()
  })
  await window.waitForLoadState('networkidle')
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close()
  }
})

test('UI synchronization after clearing old reminders', async () => {
  console.log('Starting UI sync test...')

  // 1. Create a reminder
  const input = window.locator('.custom-input input')
  await expect(input).toBeVisible({ timeout: 15000 })
  const title = `Clear Test ${Math.random().toString(36).substring(7)}`
  console.log(`Creating reminder: ${title}`)
  await input.fill(`${title} today at 11pm`)
  await input.press('Enter')

  // Handle both fast-save (no modal) and normal-save (modal)
  const reminderItem = window.locator('ion-item', { hasText: title }).first()
  const modal = window.locator('ion-modal').last()

  try {
    // Wait up to 5s for modal
    await modal.waitFor({ state: 'visible', timeout: 5000 })
    console.log('Modal appeared, clicking save')
    const saveBtn = modal.locator('[data-test="save-reminder-btn"]').first()
    await saveBtn.click()
    await modal.waitFor({ state: 'hidden' })
  } catch {
    console.log('Modal did not appear within 5s, checking for fast-save toast or item')
    // Check for toast as a sign of fast-save
    const toast = window.locator('ion-toast').first()
    try {
      await expect(toast).toBeVisible({ timeout: 5000 })
      console.log('Fast-save toast appeared')
    } catch {
      console.log('No toast appeared either, proceeding to check list')
    }
  }

  console.log('Waiting for reminder item in list...')
  await reminderItem.waitFor({ state: 'visible', timeout: 15000 })
  console.log('Reminder item is visible')

  // 2. Delete it (marks as CANCELLED)
  const deleteBtn = reminderItem.locator('[data-test="static-delete-btn"]')
  await deleteBtn.click()

  console.log('Confirming delete...')
  const confirmDeleteBtn = window.locator('ion-alert button', { hasText: 'Delete' }).first()
  await confirmDeleteBtn.waitFor({ state: 'visible' })
  await confirmDeleteBtn.click()
  await reminderItem.waitFor({ state: 'hidden' })
  console.log('Reminder item is hidden')

  // 3. Verify it's in the CANCELLED tab
  console.log('Switching to cancelled tab...')
  const cancelledSegment = window.locator('[data-test="cancelled-segment"]').first()
  await expect(cancelledSegment).toBeVisible({ timeout: 15000 })
  await cancelledSegment.click()
  console.log('Switched to cancelled tab')
  await expect(window.locator('ion-item', { hasText: title }).first()).toBeVisible()

  // 4. Go to Settings and Clear
  console.log('Navigating to Settings...')
  await window.locator('[data-test="settings-btn"]').click()
  await expect(window.locator('ion-title', { hasText: 'Settings' }).first()).toBeVisible()

  console.log('Clearing old reminders...')
  const clearBtn = window.locator('ion-item', { hasText: 'Clear Old Reminders' }).first()
  await clearBtn.click()

  const confirmClearBtn = window
    .locator('ion-alert button', { hasText: 'Clear Old Reminders' })
    .first()
  await confirmClearBtn.waitFor({ state: 'visible' })
  await confirmClearBtn.click()

  // Wait for toast
  console.log('Waiting for cleared toast...')
  const clearedToast = window
    .locator('ion-toast')
    .filter({ hasText: /Deleted/i })
    .first()
  await expect(clearedToast).toBeVisible({ timeout: 10000 })

  // 5. Go back and verify it's gone from CANCELLED tab without restart
  console.log('Going back home...')
  await window.locator('ion-back-button').click()
  await expect(window.locator('ion-title', { hasText: 'Mai' }).first()).toBeVisible()

  console.log('Checking if reminder is gone from cancelled tab...')
  // We should still be on the CANCELLED tab (or switch back to it)
  await window.locator('[data-test="cancelled-segment"]').click()
  await expect(window.locator('ion-item', { hasText: title }).first()).toBeHidden({
    timeout: 10000,
  })
  console.log('Test passed!')
})
