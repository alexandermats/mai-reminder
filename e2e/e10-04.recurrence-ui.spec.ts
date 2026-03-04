import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test'

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: ['dist-electron/electron/main.js'],
    env: { ...process.env, NODE_ENV: 'production' },
  })

  window = await electronApp.firstWindow()
  window.setDefaultTimeout(30000)

  // Start tracing before any tests run
  await window.context().tracing.start({ screenshots: true, snapshots: true, sources: true })

  await window.evaluate(() => {
    localStorage.setItem('app-language', 'en')
    localStorage.setItem('fast-save', 'false')
  })
})

test.afterAll(async () => {
  if (window) {
    await window.context().tracing.stop({ path: 'test-results/trace.zip' })
  }
  if (electronApp) {
    await electronApp.close()
  }
})

test('recurring reminders show indicator and recurrence scope prompts (E10-04)', async () => {
  const unique = Math.random().toString(36).slice(2, 8)
  const title = `E10-04 recurring ${unique}`

  // 1. Open quick add and enter text to bring up the confirmation modal
  const input = window.getByPlaceholder('Remind me to...').first()
  await expect(input).toBeVisible({ timeout: 15000 })
  await input.fill(`${title} every monday`)
  const sendBtn1 = window.locator('ion-button[type="submit"]').first()
  await expect(sendBtn1).toBeVisible()
  await sendBtn1.click({ force: true })

  // 2. Handle Fast Save option On or Off
  const modal = window.locator('ion-modal').last()
  try {
    await modal.waitFor({ state: 'visible', timeout: 3000 })
    await window.waitForTimeout(500)
    await modal.locator('[data-test="save-reminder-btn"]').click({ force: true })
    await modal.waitFor({ state: 'hidden', timeout: 3000 })
  } catch {
    // If fast save is on, the modal won't appear and item is saved directly.
  }

  const item = window.locator('[data-test="reminder-item"]', { hasText: title }).first()
  await expect(item).toBeVisible({ timeout: 15000 })
  await expect(item.locator('[data-test="recurring-indicator"]')).toBeVisible()

  await item.locator('[data-test="static-edit-btn"] ion-icon').click({ force: true })
  const scopeAlert = window.locator('ion-alert')
  await expect(scopeAlert).toBeVisible()
  await expect(scopeAlert).toContainText('Update just this occurrence, or the entire series?')
  await scopeAlert.locator('button', { hasText: 'This occurrence' }).click({ force: true })

  const editModal = window.locator('ion-modal').last()
  await expect(editModal).toBeVisible()
  await expect(editModal.locator('[data-test="recurrence-description"]')).toContainText(
    'Repeats every Monday'
  )
  await editModal.locator('ion-button', { hasText: 'Cancel' }).first().click({ force: true })

  await item.locator('[data-test="static-delete-btn"] ion-icon').click({ force: true })
  await expect(scopeAlert).toBeVisible()
  await expect(scopeAlert).toContainText('Update just this occurrence, or the entire series?')
  await scopeAlert.locator('button', { hasText: 'This occurrence' }).click({ force: true })

  const deleteAlert = window.locator('ion-alert').last()
  await expect(deleteAlert).toContainText('Delete this reminder?')

  // --- E13-03 Part ---
  const unique2 = Math.random().toString(36).slice(2, 8)
  const title2 = `E13-03 Create recurring ${unique2}`

  // 1. Open quick add and enter text to bring up the confirmation modal
  const input2 = window.getByPlaceholder('Remind me to...').first()
  await expect(input2).toBeVisible({ timeout: 15000 })
  await input2.fill(`${title2} next year`)
  const sendBtn2 = window.locator('ion-button[type="submit"]').first()
  await expect(sendBtn2).toBeVisible()
  await sendBtn2.click({ force: true })

  // 2. Handle Fast Save option On or Off for UI Picker
  const modal2 = window.locator('ion-modal').last()
  try {
    await modal2.waitFor({ state: 'visible', timeout: 3000 })
  } catch {
    // Fast Save is ON. The item was created. We need to open it via edit.
    const itemToEdit = window.locator('[data-test="reminder-item"]', { hasText: title2 }).first()
    await expect(itemToEdit).toBeVisible({ timeout: 15000 })
    await itemToEdit.locator('[data-test="static-edit-btn"] ion-icon').click({ force: true })
    await modal2.waitFor({ state: 'visible', timeout: 5000 })
  }
  await window.waitForTimeout(500) // allow ionic modal animation to finish

  // 3. Change recurrence to Every N weeks via UI
  const typeSelect = modal2.locator('ion-select[data-test="recurrence-type-select"]')
  await expect(typeSelect).toBeVisible()
  await typeSelect.evaluate((node: HTMLSelectElement) => {
    node.value = 'weeks'
    node.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'weeks' } }))
  })

  // Set interval to 2
  const intervalInput = modal2
    .locator('ion-input[data-test="recurrence-interval-input"]')
    .locator('input')
    .first()
  await expect(intervalInput).toBeVisible()
  await intervalInput.fill('2')

  // 4. Save
  await modal2.locator('[data-test="save-reminder-btn"]').click({ force: true })
  await expect(modal2).toBeHidden()

  // 5. Verify list shows recurrence indicator
  const updatedItem = window.locator('[data-test="reminder-item"]', { hasText: title2 }).first()
  await expect(updatedItem).toBeVisible({ timeout: 15000 })
  await expect(updatedItem.locator('[data-test="recurring-indicator"]')).toBeVisible()
})
