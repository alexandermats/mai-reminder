import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test'

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  test.setTimeout(180000)
  electronApp = await electron.launch({
    args: ['dist-electron/electron/main.js'],
    env: { ...process.env, NODE_ENV: 'production' },
  })
  window = await electronApp.firstWindow()
  window.setDefaultTimeout(60000)

  // Set English language
  await window.evaluate(() => {
    localStorage.setItem('app-language', 'en')
    localStorage.setItem('fast-save', 'false')
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

test('Reminder moves to Sent tab automatically when triggered', async () => {
  test.setTimeout(180000)
  console.log('Starting Sent sync test...')

  // 2. Create a reminder for 1 minute from now
  const input = window.locator('.custom-input input')
  await expect(input).toBeVisible({ timeout: 15000 })

  const title = `SentSync_${Math.random().toString(36).substring(7)}`
  console.log(`Creating reminder: ${title}`)

  // Type a message that the parser will understand as "in 1 min"
  await input.fill(`${title} in 1 min`)
  await input.press('Enter')
  await window.waitForTimeout(2000)

  try {
    const modal = window.locator('ion-modal').last()
    if (await modal.isVisible()) {
      console.log('Modal visible, saving...')
      const saveBtn = modal.locator('[data-test="save-reminder-btn"]').first()
      await saveBtn.click()
      await modal.waitFor({ state: 'hidden' })
    }
  } catch {
    console.log('No modal, probably fast-saved')
  }

  const reminderItem = window.locator('ion-item', { hasText: title }).first()
  await expect(reminderItem).toBeVisible({ timeout: 15000 })
  console.log('Reminder visible in Active tab')

  // 3. Wait for it to trigger and move
  console.log('Waiting for reminder to move to Sent tab (up to 95s)...')
  await expect(reminderItem).toBeHidden({ timeout: 95000 })
  console.log('Reminder moved (hidden from Active)')

  // 4. Verify in Sent tab
  const sentSegment = window.locator('[data-test="sent-segment"]').first()
  await sentSegment.click()
  await window.waitForTimeout(2000)

  const sentItem = window.locator('ion-item', { hasText: title }).first()
  await expect(sentItem).toBeVisible({ timeout: 15000 })
  console.log('Test passed!')
})
