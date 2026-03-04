import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test'
import type { ElectronAPI } from '../src/electron/types'

let electronApp: ElectronApplication
let mainPage: Page

/**
 * Wait for the Electron IPC API to be injected by the preload script.
 */
async function waitForElectronAPI(page: Page) {
  console.log('E2E: Waiting for Electron API...')
  await page.waitForFunction(
    () => {
      const api = (window as Window & { electronAPI: ElectronAPI }).electronAPI
      return api && api.settings && typeof api.settings.getSetting === 'function'
    },
    { timeout: 30000 }
  )
  console.log('E2E: Electron API injected.')
}

test.beforeAll(async () => {
  test.setTimeout(120000)
  // Launch Electron app
  electronApp = await electron.launch({
    args: ['dist-electron/electron/main.js'],
    env: { ...process.env, NODE_ENV: 'production' },
  })

  electronApp.process().stdout?.on('data', (d) => console.log('MAIN OUT:', d.toString()))
  electronApp.process().stderr?.on('data', (d) => console.log('MAIN ERR:', d.toString()))

  console.log('E2E: Launching Electron...')
  console.log('E2E: Waiting for first mainPage...')
  mainPage = await electronApp.firstWindow()
  console.log('E2E: First mainPage obtained.')
  mainPage.on('console', (msg) => console.log('ELECTRON WINDOW:', msg.text()))

  // Set default timeout for all actions
  mainPage.setDefaultTimeout(60000)

  console.log('E2E: Starting beforeAll...')
  await waitForElectronAPI(mainPage)
  console.log('E2E: API ready.')

  // Ensure we start on the Home page
  await expect(mainPage.locator('ion-title').filter({ hasText: /Mai|Май/ })).toBeVisible({
    timeout: 15000,
  })
  console.log('E2E: Home page title verified.')

  // Navigate to Settings via the UI button as requested
  const settingsBtn = mainPage.locator('[data-test="settings-btn"]')
  await expect(settingsBtn).toBeVisible({ timeout: 15000 })
  console.log('E2E: Settings button visible, waiting for stability...')
  await mainPage.waitForTimeout(2000) // Give it a moment to be clickable
  console.log('E2E: Clicking settings button...')
  await settingsBtn.click({ force: true })

  // Wait for Settings page to load
  await expect(mainPage.locator('ion-title').filter({ hasText: /Settings|Настройки/ })).toBeVisible(
    { timeout: 15000 }
  )
  console.log('E2E: Settings page title verified.')

  const languageSelect = mainPage.locator('ion-select')
  await expect(languageSelect).toBeVisible({ timeout: 15000 })
  console.log('E2E: Language select visible.')

  // Check the displayed text to see if it's already English
  const selectedText = await languageSelect.textContent()
  console.log('E2E: Current language text:', selectedText)
  if (selectedText && !selectedText.includes('English')) {
    console.log('E2E: Language is not English, changing...')
    await languageSelect.click()
    const englishOption = mainPage
      .locator('ion-select-option[value="en"], ion-radio[value="en"]')
      .last()
    await englishOption.click()

    // Click OK button in the alert/select modal
    console.log('E2E: Clicking OK button...')
    const okBtn = mainPage
      .locator('button.alert-button:has-text("OK"), button.alert-button:has-text("ОК")')
      .last()
    if (await okBtn.isVisible({ timeout: 5000 })) {
      await okBtn.click()
    }

    // Wait for the select to close and language to apply
    await mainPage.waitForTimeout(1000)
    console.log('E2E: Language change complete.')
  } else {
    console.log('E2E: Language is already English.')
  }

  // Navigate back to home using the back button if possible
  console.log('E2E: Navigating back to Home...')
  const backBtn = mainPage.locator('ion-back-button').first()
  if (await backBtn.isVisible({ timeout: 5000 })) {
    await backBtn.click()
  } else {
    // Fallback if back button is not easily clickable in test
    console.log('E2E: Back button not found/visible, using hash fallback.')
    await mainPage.evaluate(() => {
      location.hash = '/'
    })
  }

  // Ensure we are back on the Home page
  await expect(mainPage.locator('ion-title').filter({ hasText: /Mai|Май/ })).toBeVisible({
    timeout: 15000,
  })
  console.log('E2E: Back on Home page.')
  await waitForElectronAPI(mainPage)
  console.log('E2E: beforeAll hook finished.')
})

test.afterAll(async () => {
  test.setTimeout(60000)
  if (electronApp) {
    // Cleanup: Clear all reminders via Settings
    try {
      await mainPage.evaluate(() => {
        location.hash = '/settings'
      })
      const clearBtn = mainPage.locator('[data-test="clear-old-reminders-btn"]')
      await expect(clearBtn).toBeVisible({ timeout: 10000 })
      await clearBtn.click()

      const alertConfirmBtn = mainPage
        .locator('ion-alert button', { hasText: /Clear|Отменить/i })
        .last()
      if (await alertConfirmBtn.isVisible({ timeout: 5000 })) {
        await alertConfirmBtn.click()
        // Wait for confirmation toast to disappear or just a bit of time
        await mainPage.waitForTimeout(2000)
      }
    } catch (e) {
      console.log('Cleanup failed (non-critical):', e)
    }
    await electronApp.close()
  }
})

// Setup trace for every test in case of failure
test.beforeEach(async () => {
  await mainPage.context().tracing.start({ screenshots: true, snapshots: true })
  await mainPage.evaluate(() => {
    location.hash = '/'
  })
  // Ensure we are on the Home page before each test
  await expect(mainPage.locator('ion-title').filter({ hasText: /Mai|Май/ })).toBeVisible({
    timeout: 15000,
  })
})

// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await mainPage
      .context()
      .tracing.stop({ path: `e2e/traces/${testInfo.title.replace(/\s+/g, '_')}-trace.zip` })
  } else {
    await mainPage.context().tracing.stop()
  }
})

test.describe.serial('Electron E2E Regression Suite', () => {
  test('Core Boot & Smoke Test', async () => {
    // Verify initial UI loads successfully
    await expect(mainPage.locator('ion-title').filter({ hasText: /Mai|Май/ })).toBeVisible({
      timeout: 15000,
    })
  })

  test('Reminder Lifecycle: Create, Edit, Cancel (E7-01)', async () => {
    const uniqueId = Math.random().toString(36).substring(7)
    const initialTitle = `E2E Lifecycle Meeting ${uniqueId}`
    const updatedTitleText = `Updated Lifecycle Meeting ${uniqueId}`

    // Wait for the UI input to load
    const input = mainPage.locator('.custom-input input').first()
    await expect(input).toBeVisible({ timeout: 15000 })

    // Check if Fast Save is enabled
    await waitForElectronAPI(mainPage)
    const fastSave = await mainPage.evaluate(() =>
      (window as Window & { electronAPI: ElectronAPI }).electronAPI.settings.getSetting('fastSave')
    )
    const isFastSave = fastSave === 'true'

    // 1. Create
    await input.fill(`${initialTitle} at 5pm`)
    await input.press('Enter')

    const modal = mainPage.locator('ion-modal').last()
    if (!isFastSave) {
      // Modal should appear
      const saveBtn = modal.locator('#save-reminder-btn')
      await expect(saveBtn).toBeVisible({ timeout: 10000 })
      await saveBtn.dispatchEvent('click')
    }
    await mainPage.waitForTimeout(1000)

    const listItem = mainPage
      .locator('[data-test="reminder-item"]', { hasText: initialTitle })
      .first()
    await expect(listItem).toBeVisible()

    // 2. Edit using static button
    const editBtn = listItem.locator('[data-test="static-edit-btn"]')
    await editBtn.click()

    await expect(modal).toBeVisible()
    const editInput = modal.locator('ion-input input')
    await editInput.clear()
    await editInput.fill(updatedTitleText)
    const editSaveBtn = modal.locator('#save-reminder-btn')
    await editSaveBtn.dispatchEvent('click')
    await mainPage.waitForTimeout(1000)

    // Verify updated title
    const updatedItem = mainPage
      .locator('[data-test="reminder-item"]', { hasText: updatedTitleText })
      .first()
    await expect(updatedItem).toBeVisible()

    // 3. Cancel using static button
    const cancelBtn = updatedItem.locator('[data-test="static-delete-btn"]')
    await cancelBtn.click()

    const alertConfirmBtn = mainPage.locator('ion-alert button', { hasText: /Yes|Да/i }).last()
    await expect(alertConfirmBtn).toBeVisible()
    await alertConfirmBtn.click()

    await expect(updatedItem).not.toBeVisible({ timeout: 5000 })
  })
  test('Offline / Local Fallback', async () => {
    const uniqueId = Math.random().toString(36).substring(7)
    const offlineTitle = `Offline Grocery Run ${uniqueId}`

    // Simulate offline mode
    await mainPage.context().setOffline(true)

    // Wait for offline toast to appear
    const toast = mainPage.locator('ion-toast').filter({ hasText: /offline|local parser/i })
    await expect(toast).toBeVisible({ timeout: 10000 })

    // Create a reminder via text input in offline mode
    const input = mainPage.locator('.custom-input input').first()
    await expect(input).toBeVisible()
    await input.fill(`${offlineTitle} today`)
    await input.press('Enter')

    // Local parser should process it and open modal
    const modal = mainPage.locator('ion-modal').last()
    await expect(modal).toBeVisible()
    await expect(modal.locator('ion-input input')).toHaveValue(offlineTitle)

    // Close modal to cleanup
    await modal.locator('ion-button', { hasText: 'Cancel' }).first().click()
    await expect(modal).not.toBeVisible()

    // Reconnect network
    await mainPage.context().setOffline(false)
  })

  test('Settings & Theme Initialization', async () => {
    await mainPage.evaluate(() => {
      location.hash = '/settings'
    })
    await expect(mainPage.locator('ion-title', { hasText: 'Settings' }).first()).toBeVisible()
    const parserToggle = mainPage.locator('[data-test="ai-toggle"]').first()
    await expect(parserToggle).toBeVisible()
    await mainPage.evaluate(() => {
      location.hash = '/'
    })
  })

  test('Calendar Filtering (E7-02)', async () => {
    const uniqueId = Math.random().toString(36).substring(7)
    const titleBase = `test calendar filter reminder ${uniqueId}`

    await mainPage.evaluate(() => {
      location.hash = '/'
    })

    const toggle = mainPage.locator('[data-test="view-mode-toggle"]')
    await expect(toggle).toBeVisible({ timeout: 15000 })

    await waitForElectronAPI(mainPage)
    const fastSaveAfter = await mainPage.evaluate(() =>
      (window as Window & { electronAPI: ElectronAPI }).electronAPI.settings.getSetting('fastSave')
    )
    const isFastSave = fastSaveAfter === 'true'

    // Create a reminder for today
    const input = mainPage.locator('.custom-input input').first()
    const reminderText = `${titleBase} today at 11pm`
    await input.fill(reminderText)
    await input.press('Enter')

    if (!isFastSave) {
      const saveBtn = mainPage
        .locator('[data-test="save-reminder-btn"]')
        .filter({ visible: true })
        .first()
      await expect(saveBtn).toBeVisible({ timeout: 15000 })
      await saveBtn.click()
    }

    // Switch to calendar view
    await mainPage.locator('[data-test="calendar-view-btn"]').dispatchEvent('click')
    const calendar = mainPage.locator('.vc-container')
    await expect(calendar).toBeVisible({ timeout: 15000 })

    // Find today's date and click it
    const todayCell = calendar.locator('.vc-day.is-today').first()
    await expect(todayCell.locator('.vc-dot').first()).toBeVisible()
    await todayCell.click({ force: true })

    // Verify reminder is visible
    const reminderItem = mainPage
      .locator('[data-test="reminder-item"]', { hasText: titleBase })
      .first()
    await expect(reminderItem).toBeVisible({ timeout: 10000 })

    // Click another day to filter out
    const nonTodayCell = calendar.locator('.vc-day.in-month:not(.is-today) .vc-day-content').first()
    await expect(nonTodayCell).toBeVisible()
    await nonTodayCell.dispatchEvent('click')

    // Verify hidden
    await expect
      .poll(
        async () => {
          return await reminderItem.isVisible()
        },
        { timeout: 10000 }
      )
      .toBe(false)

    // Toggle back to list mode
    await mainPage.locator('[data-test="list-view-btn"]').dispatchEvent('click')
    await expect(reminderItem).toBeVisible()

    // Cleanup using static delete
    const deleteBtn = reminderItem.locator('[data-test="static-delete-btn"]')
    await deleteBtn.click()
    const confirmBtn = mainPage.locator('ion-alert button', { hasText: 'Yes' }).first()
    await confirmBtn.waitFor({ state: 'visible' })
    await confirmBtn.click()
  })
})
