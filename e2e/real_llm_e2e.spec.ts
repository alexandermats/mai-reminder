import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test'
import 'dotenv/config'
import type { ElectronAPI } from '../src/electron/types'

let electronApp: ElectronApplication
let window: Page

/**
 * Wait for the Electron IPC API to be injected by the preload script.
 */
async function waitForElectronAPI(page: Page) {
  await page.waitForFunction(
    () => {
      const api = (window as Window & { electronAPI: ElectronAPI }).electronAPI
      return api && api.settings && typeof api.settings.getSetting === 'function'
    },
    { timeout: 30000 }
  )
}

test.beforeAll(async () => {
  const apiKey = process.env.CEREBRAS_API_KEY
  if (!apiKey) {
    throw new Error('CEREBRAS_API_KEY not found in environment. Please check your .env file.')
  }

  electronApp = await electron.launch({
    args: ['dist-electron/electron/main.js'],
    env: { ...process.env, NODE_ENV: 'production' },
  })
  window = await electronApp.firstWindow()

  window.on('console', (msg) => console.log(`WINDOW LOG: ${msg.text()}`))

  // Wait for the app to be ready
  await expect(window.locator('.custom-input input')).toBeVisible({ timeout: 15000 })
  await waitForElectronAPI(window)

  // 1. Setup Settings via UI
  console.log('Navigating to Settings...')
  await window.locator('[data-test="settings-btn"]').click()
  await expect(window.locator('ion-title').filter({ hasText: 'Settings' }).first()).toBeVisible()

  console.log('Ensuring AI Parsing is ON...')
  const aiToggle = window.locator('[data-test="ai-toggle"]')
  await expect(aiToggle).toBeVisible()
  if ((await aiToggle.getAttribute('aria-checked')) === 'false') {
    await aiToggle.click()
  }

  console.log('Ensuring Fast Save is OFF for verification...')
  const fastSaveToggle = window.locator('[data-test="fast-save-toggle"]')
  await expect(fastSaveToggle).toBeVisible()
  if ((await fastSaveToggle.getAttribute('aria-checked')) === 'true') {
    await fastSaveToggle.click()
  }

  console.log('Waiting for API Key input field...')
  const apiKeyInputContainer = window.locator('[data-test="api-key-input"]')
  await expect(apiKeyInputContainer).toBeVisible({ timeout: 5000 })

  console.log('Entering API Key...')
  const apiKeyInnerInput = apiKeyInputContainer.locator('input')
  await apiKeyInnerInput.fill(apiKey)

  // Take a screenshot to verify final state
  await window.screenshot({ path: 'test-results/settings-state-fixed.png' })
  console.log('Screenshot saved to test-results/settings-state-fixed.png')

  await window.waitForTimeout(500)

  console.log('Returning to Home...')
  await window.locator('ion-back-button').click()
  await expect(window.locator('.custom-input input')).toBeVisible({ timeout: 10000 })
})

test.afterAll(async () => {
  if (electronApp) {
    await window.waitForTimeout(1000)
    await electronApp.close()
  }
})

test('Real LLM Parsing E2E Final Verification', async () => {
  test.setTimeout(90000)
  console.log('Starting Real LLM E2E test...')

  // Check that we are back home
  await expect(window.locator('.custom-input input')).toBeVisible({ timeout: 15000 })

  const testTitle = `AI Verify ${Math.random().toString(36).substring(7)}`
  const nlpText = `${testTitle} tomorrow at 11pm`

  console.log(`Creating AI reminder: ${nlpText}`)
  const input = window.locator('.custom-input input')
  await input.fill(nlpText)
  await input.press('Enter')

  console.log('Waiting for LLM response (modal)...')
  const modal = window.locator('ion-modal').last()

  // This is where it was hanging: because Fast Save was ON, this modal never appeared.
  // Now that we've explicitly disabled it in beforeAll, it MUST appear.
  await expect(modal).toBeVisible({ timeout: 60000 })

  console.log('Modal appeared, verifying parsed data')
  const modalInput = modal.locator('ion-input input').first()
  await expect(modalInput).toHaveValue(testTitle)

  // Save it
  console.log('Saving reminder...')
  const saveBtn = modal.locator('[data-test="save-reminder-btn"]').first()
  await saveBtn.click()
  await expect(modal).not.toBeVisible({ timeout: 10000 })

  // Verify it's in the list
  console.log('Verifying reminder in list...')
  await expect(window.locator('ion-item', { hasText: testTitle }).first()).toBeVisible()
  console.log('SUCCESS: AI Reminder verified E2E with confirmed settings!')
})
