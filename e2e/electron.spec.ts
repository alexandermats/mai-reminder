import { _electron as electron, test, expect } from '@playwright/test'

test('Electron reminder creation flow', async () => {
  // Launch Electron app
  // Launch Electron app using the built folder directly
  const electronApp = await electron.launch({
    args: ['dist-electron/electron/main.js'],
    env: { ...process.env, NODE_ENV: 'production' },
  })

  electronApp.process().stdout?.on('data', (d) => console.log('MAIN OUT:', d.toString()))
  electronApp.process().stderr?.on('data', (d) => console.log('MAIN ERR:', d.toString()))

  // Capture trace to see what the window is actually loading
  const context = electronApp.context()
  await context.tracing.start({ screenshots: true, snapshots: true })

  // Get the first window that the app creates
  const window = await electronApp.firstWindow()

  // Optional: print console logs from the Electron window
  window.on('console', (msg) => console.log('ELECTRON WINDOW:', msg.text()))

  // Wait for the UI components to load
  await expect(window.locator('.custom-input input')).toBeVisible({ timeout: 15000 })

  // Find input and type
  const input = window.locator('.custom-input input')
  await input.fill('Desktop Meeting at 5pm')
  await input.press('Enter')

  // Modal should appear
  await expect(window.locator('ion-modal')).toBeVisible()
  // Wait for modal input to populate
  await expect(window.locator('ion-modal ion-input input')).toHaveValue('Desktop Meeting')
  await window.waitForTimeout(1000)

  // Save
  await window.locator('#save-reminder-btn').click()

  // Modal should close and item should be in list
  await expect(window.locator('ion-modal')).not.toBeVisible()
  await expect(window.locator('ion-list h2', { hasText: 'Desktop Meeting' }).first()).toBeVisible()

  // Cleanup
  await context.tracing.stop({ path: 'e2e/trace.zip' })
  await electronApp.close()
})
