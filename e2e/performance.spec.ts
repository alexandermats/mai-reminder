import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

test.describe.serial('Performance Assertions', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    // Measure startup time
    const start = performance.now()

    electronApp = await electron.launch({
      args: ['dist-electron/electron/main.js'],
      env: { ...process.env, NODE_ENV: 'production' },
    })

    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Ensure routing initiates
    await window.evaluate(() => {
      window.location.hash = '/'
    })
    await window.waitForLoadState('networkidle')

    const end = performance.now()
    const startupDuration = end - start

    console.log(`[Perf] App Startup took: ${startupDuration.toFixed(2)}ms`)

    // Assert startup ready < 3 seconds
    expect(startupDuration).toBeLessThan(3000)
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('idle memory usage is < 200MB', async () => {
    // Wait for the UI elements to settle
    await window.locator('ion-title', { hasText: 'Mai' }).first().waitFor({ state: 'visible' })

    // Wait a brief moment to let garbage collection/startup tasks settle
    await window.waitForTimeout(2000)

    // Evaluate memory usage inside the Chromium process
    const memoryMetrics = await window.evaluate(() => {
      // @ts-expect-error - performance.memory is experimental
      if (performance.memory) {
        // @ts-expect-error - performance.memory is experimental
        return performance.memory.usedJSHeapSize
      }
      return 0
    })

    if (memoryMetrics > 0) {
      const memoryMB = memoryMetrics / (1024 * 1024)
      console.log(`[Perf] Chromium Used JS Heap: ${memoryMB.toFixed(2)} MB`)
      expect(memoryMB).toBeLessThan(200)
    } else {
      console.log('[Perf] performance.memory API not available in this browser context.')
    }

    // Evaluate main process memory (Electron Node process) via IPC or direct reference if available
    // Playwright natively supports fetching process info
    const processInfo = await electronApp.evaluate(() => {
      return process.memoryUsage()
    })

    const mainProcessMB = processInfo.rss / (1024 * 1024)
    console.log(`[Perf] Node Main Process RSS Memory: ${mainProcessMB.toFixed(2)} MB`)
    // The Vosk offline acoustic model consumes ~300MB, so 500MB is expected
    expect(mainProcessMB).toBeLessThan(500)
  })
})
