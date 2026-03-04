import { test, expect } from '@playwright/test'

test('App shows proactive offline alert when network disconnects', async ({ page, context }) => {
  // Go to the app homepage
  await page.goto('/')

  // Ensure app loads completely
  await expect(page.locator('ion-title')).toContainText('Mai')

  // Simulate network disconnection
  await context.setOffline(true)

  // Expect offline toast to appear (our offline message is 'Device went offline')
  const toast = page.locator('ion-toast')
  await expect(toast).toBeVisible()
  await expect(toast).toContainText("You're offline. Using local parser.") // Translation for errors.offline

  // Reconnect network
  await context.setOffline(false)

  // Wait for the new info toast to appear
  const onlineToast = page.locator('ion-toast').filter({ hasText: 'Connection restored' })
  await expect(onlineToast).toBeVisible()
})
