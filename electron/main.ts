import type {
  BrowserWindow as BrowserWindowType,
  WebContents,
  Event as ElectronEvent,
} from 'electron'

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  systemPreferences,
  session,
} = require('electron')
const path = require('node:path')
const { existsSync } = require('node:fs')

// Lazy-require DB layer (Node-only, unavailable in renderer)
// Using require() here because electron/main.ts runs as CommonJS (see tsconfig.electron.json)
// eslint-disable-next-line @typescript-eslint/no-require-imports
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  initializeDatabase,
  closeDatabase,
}: Record<string, unknown> = require('../src/db/connection.js')

const { initVosk, registerVoiceHandlers }: Record<string, unknown> = require('./voice.js')
const {
  registerGlobalShortcuts,
  unregisterGlobalShortcuts,
}: {
  registerGlobalShortcuts: (shortcut: string, onTrigger?: () => void) => void
  unregisterGlobalShortcuts: () => void
} = require('./shortcuts.js')
const { setAutoStart }: { setAutoStart: (b: boolean) => void } = require('./autostart.js')

// Lazy require scheduler and adapter
const { ReminderScheduler }: Record<string, unknown> = require('../src/electron/scheduler.js')
const {
  ElectronNotificationAdapter,
}: Record<string, unknown> = require('../src/electron/notificationAdapter.js')
const {
  applyTriggeredReminderTransition,
}: Record<string, unknown> = require('../src/services/reminderOccurrenceService.js')
const {
  calcSnoozedAt,
  SNOOZE_ACTION_TO_MS,
}: {
  calcSnoozedAt: (base: Date, durationMs: number) => Date
  SNOOZE_ACTION_TO_MS: Record<string, number>
} = require('../src/services/snoozeService.js')
const {
  MissedReminderBadgeService,
}: {
  MissedReminderBadgeService: new (
    setBadgeCount: (n: number) => void,
    setTrayBadge?: (n: number) => void
  ) => {
    refresh(
      repo: {
        listMissed(before?: Date, since?: Date, timeoutSeconds?: number): Promise<unknown[]>
      },
      since?: Date,
      timeoutSeconds?: number
    ): Promise<void>
    clear(): void
    getMissedCount(): number
    getMissedIds(): string[]
  }
} = require('../src/electron/missedReminderBadgeService.js')
const {
  buildTrayBadgeSvg,
  resolveTrayIconSizePx,
}: {
  buildTrayBadgeSvg: (baseIconDataUrl: string, size: number, count: number) => string
  resolveTrayIconSizePx: (platform: NodeJS.Platform) => number
} = require('../src/electron/trayBadgeIcon.js')

// Keep a global reference of the window object to prevent garbage collection
let mainWindow: BrowserWindowType | null = null
let overlayWindow: BrowserWindowType | null = null
let snoozeOverlayWindow: BrowserWindowType | null = null
let tray: import('electron').Tray | null = null

// Global database connection — opened once on startup, closed on quit
let db: unknown = null

interface CoreReminder {
  id: string
  title: string
  scheduledAt?: Date | string
  nextScheduledAt?: Date | string
  completedAt?: Date | string
  [key: string]: unknown
}

interface PersistedReminder extends CoreReminder {
  originalText: string
  language: string
  source: string
  parserMode: string
  status: string
  recurrenceRule?: string
  parseConfidence?: number
}

interface TriggerTransitionRepository {
  update(id: string, changes: Record<string, unknown>): Promise<CoreReminder>
  create(input: Record<string, unknown>): Promise<CoreReminder>
}

interface IReminderScheduler {
  schedule(reminder: CoreReminder): void
  cancel(id: string): void
  listScheduled(): CoreReminder[]
  start(): void
  stop(): void
  onReminderDue(cb: (reminder: CoreReminder) => void): void
}

interface INotificationAdapter {
  showNotification(reminder: CoreReminder, displayTimeSeconds?: number): void
}

/** Payload stored per pending snooze overlay (Windows/Linux cross-platform snooze) */
let pendingSnoozeReminder: CoreReminder | null = null

/** Timeout ID for auto-hiding the snooze overlay */
let snoozeOverlayTimeoutId: NodeJS.Timeout | null = null

/** Set lazily inside app.whenReady() so registerIpcHandlers can call it via closure */
let handleSnoozeActionGlobal: ((reminderId: string, action: string) => Promise<void>) | null = null

// Global scheduler and adapter references
let scheduler: IReminderScheduler | null = null
let notificationAdapter: INotificationAdapter | null = null
let badgeService: {
  refresh(
    repo: { listMissed(before?: Date, since?: Date, timeoutSeconds?: number): Promise<unknown[]> },
    since?: Date,
    timeoutSeconds?: number
  ): Promise<void>
  clear(): void
  getMissedCount(): number
  getMissedIds(): string[]
} | null = null

// Track if app is actually quitting (to allow window close during quit)
let isQuitting = false

/**
 * Create the main application window.
 *
 * Configures a BrowserWindow with:
 * - Secure preload script via contextBridge
 * - Context isolation enabled (security best practice)
 * - Node integration disabled (security best practice)
 */
function createWindow(): void {
  // Validate preload script exists before creating window
  // Build output structure: dist-electron/ contains main.js and preload.js (siblings)
  const preloadPath = path.join(__dirname, 'preload.js')
  if (!existsSync(preloadPath)) {
    console.error(`Preload script not found at: ${preloadPath}`)
    console.error('Please run: npm run build:electron')
    app.quit()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 400,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Load the app - in development, load from Vite dev server
  // In production, load from built files
  // Note: Production build assumes dist/ is sibling to dist-electron/
  const isDev = process.env.NODE_ENV === 'development'

  if (isDev) {
    mainWindow!.loadURL('http://localhost:3000')
    // Open DevTools in development
    mainWindow!.webContents.openDevTools()
  } else {
    const indexPath = path.join(__dirname, '../../dist/index.html')
    if (!existsSync(indexPath)) {
      console.error(`App files not found at: ${indexPath}`)
      console.error('Please run: npm run build')
      app.quit()
      return
    }
    mainWindow!.loadFile(indexPath)
  }

  // Forward renderer logs to the terminal
  mainWindow!.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[Renderer] ${message}`)
  })

  // Hide window instead of destroying it when user clicks close (all platforms)
  // This allows the app to stay running in the background and restore from tray
  mainWindow!.on('close', (event: ElectronEvent) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow!.hide()
    }
    // When actually quitting (isQuitting=true), allow the window to close normally
  })

  // E15-02: On Windows/Linux, restoring from the taskbar fires 'show' (not app
  // 'activate' which is macOS-only). Navigate to missed reminders if any exist.
  if (process.platform === 'win32' || process.platform === 'linux') {
    // 'show' is fired when restoring from tray or calling .show()
    mainWindow!.on('show', () => {
      if (badgeService && badgeService.getMissedCount() > 0) {
        safeNavigateToSent(badgeService.getMissedIds())
      }
    })
    // 'restore' is fired when un-minimizing from the taskbar
    mainWindow!.on('restore', () => {
      if (badgeService && badgeService.getMissedCount() > 0) {
        safeNavigateToSent(badgeService.getMissedIds())
      }
    })
  }

  mainWindow!.on('closed', () => {
    mainWindow = null
  })
}

/**
 * Create the Quick-Add overlay window.
 */
function createOverlayWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.js')

  overlayWindow = new BrowserWindow({
    width: 600,
    height: 120, // Enough for the input + some margin
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    show: false, // Don't show until shortcut is pressed
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const isDev = process.env.NODE_ENV === 'development'
  const overlayUrl = isDev
    ? 'http://localhost:3000/#/overlay'
    : `file://${path.join(__dirname, '../../dist/index.html')}#/overlay`

  if (isDev) {
    overlayWindow!.loadURL(overlayUrl)
  } else {
    // In production, we use hash routing with loadFile
    overlayWindow!.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: 'overlay' })
  }

  overlayWindow!.on('blur', () => {
    overlayWindow?.hide()
  })

  overlayWindow!.on('closed', () => {
    overlayWindow = null
  })
}

/**
 * Create the Snooze overlay window (shown on Windows/Linux when a reminder fires).
 */
function createSnoozeOverlayWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.js')

  snoozeOverlayWindow = new BrowserWindow({
    width: 540,
    height: 160,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    snoozeOverlayWindow!.loadURL('http://localhost:3000/#/snooze-overlay')
  } else {
    snoozeOverlayWindow!.loadFile(path.join(__dirname, '../../dist/index.html'), {
      hash: 'snooze-overlay',
    })
  }

  snoozeOverlayWindow!.on('blur', () => {
    snoozeOverlayWindow?.hide()
  })

  snoozeOverlayWindow!.on('closed', () => {
    snoozeOverlayWindow = null
  })
}

/**
 * Toggle the visibility of the overlay window.
 */
function toggleOverlay(): void {
  if (!overlayWindow) return

  if (overlayWindow.isVisible()) {
    overlayWindow.hide()
  } else {
    overlayWindow.show()
    overlayWindow.focus()
    // Notify the overlay that it's being shown so it can auto-start voice
    overlayWindow.webContents.send('overlay:shown')
  }
}

/**
 * IPC handlers for renderer-to-main communication.
 *
 * These handlers are registered before window creation to ensure
 * they are ready when the renderer process loads.
 *
 * All handlers include error handling to gracefully serialize errors
 * back to the renderer process.
 */
function registerIpcHandlers(repo: Record<string, (...args: unknown[]) => unknown>): void {
  // Ping handler for testing IPC connectivity
  // Errors are automatically serialized by Electron's IPC layer
  ipcMain.handle('ping', async () => 'pong')

  if (db) {
    ipcMain.handle('reminders:list', async (_: unknown, options: unknown) => {
      try {
        return await repo.list(options)
      } catch (error) {
        console.error('[IPC] reminders:list failed:', error)
        throw error
      }
    })
    ipcMain.handle('reminders:create', async (_: unknown, input: unknown) => {
      console.log('[IPC] reminders:create called with:', JSON.stringify(input))
      try {
        const createFn = repo.create as (input: unknown) => Promise<CoreReminder>
        const reminder = await createFn.call(repo, input)
        console.log('[IPC] reminders:create success:', reminder.id)
        if (scheduler && reminder.scheduledAt) {
          scheduler.schedule(reminder)
        }
        // Broadcast to all windows that a reminder was created
        if (mainWindow) {
          mainWindow.webContents.send('reminder:created', reminder)
        }
        return reminder
      } catch (error) {
        console.error('[IPC] reminders:create failed:', error)
        throw error
      }
    })
    ipcMain.handle('reminders:update', async (_: unknown, id: unknown, changes: unknown) => {
      console.log('[IPC] reminders:update called with id:', id, 'changes:', JSON.stringify(changes))
      try {
        const updateFn = repo.update as (id: string, changes: unknown) => Promise<CoreReminder>
        const reminder = await updateFn.call(repo, id as string, changes)
        if (scheduler && reminder.scheduledAt && reminder.status === 'pending') {
          scheduler.schedule(reminder)
        } else if (
          scheduler &&
          (reminder.completedAt || reminder.status === 'sent' || reminder.status === 'cancelled')
        ) {
          // If it got completed, sent, or cancelled, just cancel it to be safe
          scheduler.cancel(id as string)
        }
        return reminder
      } catch (error) {
        console.error('[IPC] reminders:update failed:', error)
        throw error
      }
    })
    ipcMain.handle('reminders:delete', async (_: unknown, id: unknown, isSync?: unknown) => {
      try {
        const deleteFn = repo.delete as (id: string, isSync?: boolean) => Promise<boolean>
        const success = await deleteFn.call(repo, id as string, isSync as boolean)
        if (success && scheduler) {
          scheduler.cancel(id as string)
        }
        return success
      } catch (error) {
        console.error('[IPC] reminders:delete failed:', error)
        throw error
      }
    })
    ipcMain.handle('reminders:clear-old', async (_: unknown, includeSent: unknown) => {
      try {
        const clearFn = repo.clearOldReminders as (includeSent: boolean) => Promise<number>
        return await clearFn.call(repo, includeSent as boolean)
      } catch (error) {
        console.error('[IPC] reminders:clear-old failed:', error)
        throw error
      }
    })
    ipcMain.handle('reminders:get-by-id', async (_: unknown, id: unknown) => {
      try {
        const getFn = repo.getById as (id: string) => Promise<CoreReminder | null>
        return await getFn.call(repo, id as string)
      } catch (error) {
        console.error('[IPC] reminders:get-by-id failed:', error)
        throw error
      }
    })
    ipcMain.handle('reminders:list-upcoming', async (_: unknown, fromDate?: Date | string) => {
      try {
        const listFn = repo.listUpcoming as (fromDate?: Date | string) => Promise<CoreReminder[]>
        return await listFn.call(repo, fromDate)
      } catch (error) {
        console.error('[IPC] reminders:list-upcoming failed:', error)
        throw error
      }
    })
    ipcMain.handle('reminders:cleanup-past-pending', async (_: unknown, now?: Date | string) => {
      try {
        const cleanupFn = repo.cleanupPastPendingReminders as (
          now?: Date | string
        ) => Promise<number>
        return await cleanupFn.call(repo, now)
      } catch (error) {
        console.error('[IPC] reminders:cleanup-past-pending failed:', error)
        throw error
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      SettingsRepository,
    }: Record<string, unknown> = require('../src/db/settingsRepository.js')
    const SettingsRepoClass = SettingsRepository as new (db: unknown) => {
      getSetting: (key: string) => Promise<unknown>
      setSetting: (key: string, value: unknown) => Promise<void>
      clearAllSettings: () => Promise<void>
    }
    const settingsRepo = new SettingsRepoClass(db)

    const VALID_SETTING_KEYS = [
      'parserMode',
      'fastSave',
      'quickAddHotkey',
      'hourlyReminderStartTime',
      'hourlyReminderEndTime',
      'silenceTimeoutMs',
      'openAtLogin',
      'notificationDisplayTimeSeconds',
      'lastBadgeClearTime',
      'cloudSyncEnabled',
      'cloudSyncUserId',
      'cloudSyncEncryptionKeyBase64',
    ] as const

    const VALID_PARSER_MODES = ['llm', 'local'] as const
    const VALID_FAST_SAVE_VALUES = ['true', 'false'] as const
    const VALID_OPEN_AT_LOGIN_VALUES = ['true', 'false'] as const
    const VALID_CLOUD_SYNC_ENABLED_VALUES = ['true', 'false'] as const

    ipcMain.handle('settings:get', async (_: unknown, key: unknown) => {
      if (
        typeof key !== 'string' ||
        !VALID_SETTING_KEYS.includes(key as (typeof VALID_SETTING_KEYS)[number])
      ) {
        throw new Error(`Invalid settings key: ${String(key)}`)
      }
      return settingsRepo.getSetting(key as string)
    })
    ipcMain.handle('settings:set', async (_: unknown, key: unknown, value: unknown) => {
      if (
        typeof key !== 'string' ||
        !VALID_SETTING_KEYS.includes(key as (typeof VALID_SETTING_KEYS)[number])
      ) {
        throw new Error(`Invalid settings key: ${String(key)}`)
      }
      if (
        key === 'parserMode' &&
        !VALID_PARSER_MODES.includes(value as (typeof VALID_PARSER_MODES)[number])
      ) {
        throw new Error(`Invalid parserMode value: ${String(value)}`)
      }
      if (
        key === 'fastSave' &&
        !VALID_FAST_SAVE_VALUES.includes(value as (typeof VALID_FAST_SAVE_VALUES)[number])
      ) {
        throw new Error(`Invalid fastSave value: ${String(value)}`)
      }
      if (
        key === 'openAtLogin' &&
        !VALID_OPEN_AT_LOGIN_VALUES.includes(value as (typeof VALID_OPEN_AT_LOGIN_VALUES)[number])
      ) {
        throw new Error(`Invalid openAtLogin value: ${String(value)}`)
      }
      if (
        key === 'cloudSyncEnabled' &&
        !VALID_CLOUD_SYNC_ENABLED_VALUES.includes(
          value as (typeof VALID_CLOUD_SYNC_ENABLED_VALUES)[number]
        )
      ) {
        throw new Error(`Invalid cloudSyncEnabled value: ${String(value)}`)
      }
      if (
        (key === 'hourlyReminderStartTime' || key === 'hourlyReminderEndTime') &&
        (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value))
      ) {
        throw new Error(`Invalid ${key} value: ${String(value)}`)
      }
      if (key === 'silenceTimeoutMs') {
        const numVal = typeof value === 'string' ? parseInt(value, 10) : Number(value)
        if (isNaN(numVal) || numVal < 500 || numVal > 10000) {
          throw new Error(`Invalid silenceTimeoutMs value: ${String(value)} (must be 500-10000)`)
        }
      }

      const result = await settingsRepo.setSetting(key as string, value)

      if (key === 'quickAddHotkey') {
        console.log(`[Shortcut] Hotkey changed to ${String(value)}, re-registering...`)
        try {
          ;(unregisterGlobalShortcuts as () => void)()
          ;(registerGlobalShortcuts as (s: string, cb: () => void) => void)(
            value as string,
            toggleOverlay
          )
        } catch (err) {
          console.error('[Shortcut] Failed to update global shortcut:', err)
        }
      }

      if (key === 'openAtLogin') {
        const isEnabled = value === 'true'
        setAutoStart(isEnabled)
      }

      return result
    })

    ipcMain.handle('settings:clearAll', async () => {
      await settingsRepo.clearAllSettings()
    })
  }

  // Register Voice handlers
  ;(registerVoiceHandlers as () => void)()

  // Overlay IPC handlers
  ipcMain.on('overlay:hide', () => {
    overlayWindow?.hide()
  })

  // E15-02: Badge cleared — renderer tells main the user visited the sent tab
  ipcMain.on('badge:cleared', async () => {
    badgeService?.clear()
    if (!db) return
    const now = new Date().toISOString()
    try {
      const {
        SettingsRepository,
      }: Record<string, unknown> = require('../src/db/settingsRepository.js')
      const sRepo = new (SettingsRepository as new (db: unknown) => unknown)(db) as {
        setSetting(key: string, value: unknown): Promise<void>
      }
      await sRepo.setSetting('lastBadgeClearTime', now)
      console.log(`[Badge] lastBadgeClearTime updated to ${now}`)
    } catch (err) {
      console.error('[Badge] Failed to update lastBadgeClearTime:', err)
    }
  })

  // Snooze overlay IPC handlers (Windows/Linux cross-platform snooze)
  ipcMain.on('snooze:action', (_: unknown, payload: { reminderId: string; action: string }) => {
    const { reminderId, action } = payload
    // Close the overlay immediately
    snoozeOverlayWindow?.hide()
    pendingSnoozeReminder = null
    // Delegate to the shared handler (defined in app.whenReady scope)
    void handleSnoozeActionGlobal?.(reminderId, action)
  })

  ipcMain.on('snooze:request-data', () => {
    if (pendingSnoozeReminder && snoozeOverlayWindow) {
      snoozeOverlayWindow.webContents.send('snooze:reminder-data', {
        id: pendingSnoozeReminder.id,
        title: pendingSnoozeReminder.title,
      })
    }
  })
}

// App lifecycle: ready
app.whenReady().then(async () => {
  // Set App User Model ID for Windows notifications
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mai-reminder.app')
  }

  // Force macOS to ask the user for microphone permission
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')

    if (micStatus === 'not-determined') {
      const success = await systemPreferences.askForMediaAccess('microphone')
      console.log('Microphone access granted:', success)
    } else {
      console.log('Microphone access status:', micStatus)
    }
  }

  // 2. Force Windows/Linux internal Chromium permission approval
  session.defaultSession.setPermissionRequestHandler(
    (_webContents: WebContents, permission: string, callback: (allowed: boolean) => void) => {
      // 'media' covers both microphone and camera requests
      if (permission === 'media') {
        console.log('Chromium media permission auto-granted.')
        callback(true) // This acts as clicking "Allow" silently
      } else {
        callback(false) // Deny anything else for security
      }
    }
  )

  // Make the userData path available to the DB connection layer
  process.env.ELECTRON_USER_DATA_PATH = app.getPath('userData')

  // Initialize database — logs path and runs integrity check
  try {
    db = (initializeDatabase as () => unknown)()
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'DatabaseIntegrityError') {
      dialog.showErrorBox(
        'Database Error',
        `The reminder database is corrupted and cannot be opened.\n\n${(err as Error).message}\n\nThe application will now quit.`
      )
    } else {
      dialog.showErrorBox(
        'Startup Error',
        `Failed to initialize the database.\n\n${err instanceof Error ? err.message : String(err)}\n\nThe application will now quit.`
      )
    }
    app.quit()
    return
  }

  // Initialize background services
  const SchedulerConstructor = ReminderScheduler as new () => IReminderScheduler
  const AdapterConstructorWithAction = ElectronNotificationAdapter as new (
    onAction?: (reminderId: string, action: string) => void
  ) => INotificationAdapter

  scheduler = new SchedulerConstructor()

  /**
   * Handles snooze/dismiss actions from notification buttons (macOS) or the
   * snooze overlay window (Windows / Linux).
   */
  async function handleSnoozeAction(reminderId: string, action: string): Promise<void> {
    // Instantiate a full-featured repo once for this action call
    const dbRepo = new (ElectronReminderRepository as new (db: unknown) => unknown)(db) as {
      getById(id: string): Promise<PersistedReminder | null>
      update(id: string, changes: Record<string, unknown>): Promise<CoreReminder>
    }

    if (action === 'show-app') {
      showMainWindow()
      return
    }

    if (action === 'show-overlay') {
      // Windows/Linux: show the snooze overlay BrowserWindow
      if (!snoozeOverlayWindow) return
      const current = await dbRepo.getById(reminderId)
      if (!current) return
      pendingSnoozeReminder = current
      snoozeOverlayWindow.webContents.send('snooze:reminder-data', {
        id: current.id,
        title: current.title,
      })
      snoozeOverlayWindow.show()
      snoozeOverlayWindow.focus()

      // Auto-hide the snooze overlay after the configured display time
      try {
        const {
          SettingsRepository,
        }: Record<string, unknown> = require('../src/db/settingsRepository.js')
        const settingsRepo = new (SettingsRepository as new (db: unknown) => unknown)(db) as {
          getSetting(key: string): Promise<string | null>
        }
        const timeStr = await settingsRepo.getSetting('notificationDisplayTimeSeconds')
        const displayTimeSeconds = parseInt(timeStr || '60', 10)

        // Clear any old timeout
        if (snoozeOverlayTimeoutId) {
          clearTimeout(snoozeOverlayTimeoutId)
        }
        snoozeOverlayTimeoutId = setTimeout(() => {
          snoozeOverlayWindow?.hide()
        }, displayTimeSeconds * 1000)
      } catch (err) {
        console.error('[Snooze] Failed to set auto-hide timeout for snooze overlay', err)
      }

      return
    }

    if (action === 'dismiss') {
      try {
        await dbRepo.update(reminderId, { status: 'dismissed' })
        scheduler?.cancel(reminderId)
        if (mainWindow) mainWindow.webContents.send('reminder:triggered', { id: reminderId })
        console.log(`[Snooze] Dismissed reminder ${reminderId}`)
      } catch (err) {
        console.error(`[Snooze] Failed to dismiss reminder ${reminderId}:`, err)
      }
      return
    }

    const durationMs = SNOOZE_ACTION_TO_MS[action]
    if (typeof durationMs !== 'number') {
      console.warn(`[Snooze] Unknown action: ${action}`)
      return
    }

    try {
      const current = await dbRepo.getById(reminderId)
      if (!current) {
        console.warn(`[Snooze] Reminder ${reminderId} not found for snoozing`)
        return
      }
      const snoozedAt = calcSnoozedAt(new Date(), durationMs)

      if (current.recurrenceRule) {
        // Recurring reminder: the series already continues because applyTriggeredReminderTransition
        // already created the next occurrence when this instance fired. Reset this occurrence
        // back to pending at the snoozed time and clear its recurrenceRule so it fires exactly
        // once — this way it never appears as "sent" in the history.
        const updated = await dbRepo.update(reminderId, {
          scheduledAt: snoozedAt,
          status: 'pending',
          recurrenceRule: undefined, // key present → repo sets column to NULL
        })
        scheduler?.schedule(updated)
        if (mainWindow) mainWindow.webContents.send('reminder:created', updated)
        console.log(
          `[Snooze] Snoozed recurring instance ${reminderId} until ${snoozedAt.toISOString()} (series continues via next occurrence)`
        )
      } else {
        // Non-recurring: reset the existing reminder's scheduledAt back to pending
        const updated = await dbRepo.update(reminderId, {
          scheduledAt: snoozedAt,
          status: 'pending',
        })
        scheduler?.schedule(updated)
        if (mainWindow) mainWindow.webContents.send('reminder:created', updated)
        console.log(
          `[Snooze] Snoozed reminder ${reminderId} by ${action} until ${snoozedAt.toISOString()}`
        )
      }
    } catch (err) {
      console.error(`[Snooze] Failed to snooze reminder ${reminderId}:`, err)
    }
  }

  notificationAdapter = new AdapterConstructorWithAction(handleSnoozeAction)

  // Expose handleSnoozeAction so IPC handlers in registerIpcHandlers can reach it
  handleSnoozeActionGlobal = handleSnoozeAction

  // E15-02: Initialize badge service — updates OS dock badge with missed reminder count
  // On Windows, also update the tray icon with a badge overlay showing the missed count.

  /**
   * Creates a 16×16 tray icon NativeImage with a red badge circle showing `count`.
   * Uses inline SVG rendered via nativeImage.createFromDataURL.
   * When count is 0, returns the plain base icon.
   */
  function createTrayIconWithBadge(
    baseIcon: import('electron').NativeImage,
    count: number
  ): import('electron').NativeImage {
    if (count <= 0) return baseIcon

    const size = resolveTrayIconSizePx(process.platform)
    const basePng = baseIcon.resize({ width: size, height: size }).toDataURL()
    const svg = buildTrayBadgeSvg(basePng, size, count)
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
    const badgedIcon = nativeImage
      .createFromDataURL(dataUrl)
      .resize({ width: size, height: size, quality: 'best' })

    if (badgedIcon.isEmpty()) {
      console.error('[Tray] Badged icon is empty! Falling back to base icon.')
      return baseIcon
    }

    return badgedIcon
  }

  // Wire scheduler to notifications and IPC
  scheduler.onReminderDue(async (reminder: CoreReminder) => {
    let displayTimeSeconds = 60
    let shouldShowNotification = true
    try {
      const {
        SettingsRepository,
      }: Record<string, unknown> = require('../src/db/settingsRepository.js')
      const settingsRepo = new (SettingsRepository as new (db: unknown) => unknown)(db) as {
        getSetting(key: string): Promise<string | null>
      }
      const timeStr = await settingsRepo.getSetting('notificationDisplayTimeSeconds')
      if (timeStr) displayTimeSeconds = parseInt(timeStr, 10)

      // For hourly recurring reminders, check if the current time is within
      // the configured hourly window. If outside, suppress the notification
      // but still process the DB transition (create next occurrence).
      const { isHourlyRule, isWithinHourlyWindow } = require('../src/utils/hourlyRecurrence.js')
      if (isHourlyRule(reminder.recurrenceRule)) {
        const windowStart = (await settingsRepo.getSetting('hourlyReminderStartTime')) || '09:00'
        const windowEnd = (await settingsRepo.getSetting('hourlyReminderEndTime')) || '22:00'
        if (!isWithinHourlyWindow(new Date(), windowStart, windowEnd)) {
          shouldShowNotification = false
          console.log(
            `[Scheduler] Hourly reminder ${reminder.id} is outside window ${windowStart}-${windowEnd}; suppressing notification`
          )
        }
      }
    } catch (err) {
      console.error('[Scheduler] Failed to load settings:', err)
    }

    if (shouldShowNotification) {
      notificationAdapter?.showNotification(reminder, displayTimeSeconds)
    }

    const nextScheduledAt =
      reminder.nextScheduledAt instanceof Date
        ? reminder.nextScheduledAt
        : typeof reminder.nextScheduledAt === 'string'
          ? new Date(reminder.nextScheduledAt)
          : undefined

    // E15-Fix: Cancel the active trigger *before* processing it.
    // If the database transition fails (e.g. unique constraint sync collision),
    // we do not want the scheduler to infinitely retry and hang the UI every 1000ms.
    scheduler?.cancel(reminder.id)

    try {
      const dbRepo = new (ElectronReminderRepository as new (db: unknown) => unknown)(db) as {
        getById(id: string): Promise<PersistedReminder | null>
        update(id: string, changes: Record<string, unknown>): Promise<CoreReminder>
        create(input: Record<string, unknown>): Promise<CoreReminder>
      }

      const current = await dbRepo.getById(reminder.id)
      if (!current) {
        console.warn(`[Scheduler] Reminder ${reminder.id} not found in DB`)
        return
      }

      const transitionFn = applyTriggeredReminderTransition as (
        reminder: PersistedReminder,
        repository: TriggerTransitionRepository,
        nextScheduledAt?: Date
      ) => Promise<{ nextReminder?: CoreReminder }>

      const validNextScheduledAt =
        nextScheduledAt && !Number.isNaN(nextScheduledAt.getTime()) ? nextScheduledAt : undefined

      const { nextReminder } = await transitionFn(
        current,
        dbRepo as TriggerTransitionRepository,
        validNextScheduledAt
      )

      if (nextReminder) {
        scheduler?.schedule(nextReminder)
        if (mainWindow) {
          mainWindow.webContents.send('reminder:created', nextReminder)
        }
        console.log(
          `[Scheduler] Sent recurring reminder ${reminder.id} and created next occurrence ${nextReminder.id} at ${nextReminder.scheduledAt}`
        )
      } else {
        console.log(`[Scheduler] Marked reminder ${reminder.id} as sent`)
      }

      // E15-02: Refresh badge after state transition
      if (badgeService) {
        let sinceDate: Date | undefined
        try {
          const {
            SettingsRepository,
          }: Record<string, unknown> = require('../src/db/settingsRepository.js')
          const sRepo = new (SettingsRepository as new (db: unknown) => unknown)(db) as {
            getSetting(key: string): Promise<string | null>
          }
          const lastClearTime = await sRepo.getSetting('lastBadgeClearTime')
          if (lastClearTime && lastClearTime !== '0') {
            sinceDate = new Date(lastClearTime)
            if (isNaN(sinceDate.getTime())) {
              sinceDate = undefined
            }
          }
        } catch (err) {
          console.error('[Badge] Failed to fetch lastBadgeClearTime on scheduler tick:', err)
        }

        await badgeService.refresh(
          dbRepo as unknown as {
            listMissed(
              before?: Date,
              since?: Date,
              timeoutSeconds?: number
            ): Promise<{ id: string; scheduledAt: Date; status: string }[]>
          },
          sinceDate,
          displayTimeSeconds
        )

        // Schedule another check after the display time elapses so the ignored notification
        // updates the badge
        setTimeout(
          () => {
            badgeService?.refresh(
              dbRepo as unknown as {
                listMissed(
                  before?: Date,
                  since?: Date,
                  timeoutSeconds?: number
                ): Promise<{ id: string; scheduledAt: Date; status: string }[]>
              },
              sinceDate,
              displayTimeSeconds
            )
          },
          displayTimeSeconds * 1000 + 500
        )
      }
    } catch (err) {
      console.error(`[Scheduler] Failed to update reminder state for ${reminder.id}:`, err)
    }

    if (mainWindow) {
      mainWindow.webContents.send('reminder:triggered', reminder)
    }
  })

  // Hydrate pending reminders on startup
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    ElectronReminderRepository,
  }: Record<string, unknown> = require('../src/db/electronReminderRepository.js')
  const repo = new (ElectronReminderRepository as new (db: unknown) => unknown)(db) as Record<
    string,
    (...args: unknown[]) => unknown
  > & {
    listUpcoming: () => Promise<unknown>
    cleanupPastPendingReminders: () => Promise<number>
  }

  // Cleanup past pending reminders on startup
  repo
    .cleanupPastPendingReminders()
    .then((count: number) => {
      if (count > 0) {
        console.log(`[Scheduler] Cleaned up ${count} past pending reminders.`)
      }
    })
    .catch((err: unknown) => {
      console.error('[Scheduler] Failed to cleanup past pending reminders:', err)
    })

  repo
    .listUpcoming()
    .then((upcoming: unknown) => {
      const reminders = upcoming as CoreReminder[]
      console.log(`[Scheduler] Hydrating ${reminders.length} pending reminders...`)
      reminders.forEach((r: CoreReminder) => scheduler!.schedule(r))
    })
    .catch((err: unknown) => {
      console.error('[Scheduler] Failed to hydrate pending reminders:', err)
    })

  scheduler.start()

  registerIpcHandlers(repo)

  // Resolve Vosk models path
  const modelsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(process.cwd(), 'models')
  ;(initVosk as (p: string) => void)(modelsPath)

  createWindow()
  createOverlayWindow()
  createSnoozeOverlayWindow()

  // Register global shortcuts
  if (typeof registerGlobalShortcuts === 'function') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {
        SettingsRepository,
      }: Record<string, unknown> = require('../src/db/settingsRepository.js')
      const SettingsRepoClass = SettingsRepository as new (db: unknown) => {
        getSetting: (key: string) => Promise<unknown>
      }
      const settingsRepo = new SettingsRepoClass(db)

      const hotkey = (await settingsRepo.getSetting('quickAddHotkey')) as string
      console.log(`[Shortcut] Registering global shortcut: ${hotkey}`)
      ;(registerGlobalShortcuts as (s: string, cb: () => void) => void)(hotkey, toggleOverlay)
    } catch (err) {
      console.error('[Shortcut] Failed to register global shortcut on startup:', err)
      // Fallback to default if everything fails
      ;(registerGlobalShortcuts as (s: string, cb: () => void) => void)(
        'CommandOrControl+Shift+Space',
        toggleOverlay
      )
    }
  }

  // Set Open at Login based on saved preference
  try {
    const {
      SettingsRepository,
    }: Record<string, unknown> = require('../src/db/settingsRepository.js')
    const SettingsRepoClass = SettingsRepository as new (db: unknown) => {
      getSetting: (key: string) => Promise<unknown>
    }
    const settingsRepo = new SettingsRepoClass(db)

    const openAtLoginSetting = (await settingsRepo.getSetting('openAtLogin')) as string
    const shouldOpenAtLogin = openAtLoginSetting === 'true'
    setAutoStart(shouldOpenAtLogin)
  } catch (err) {
    console.error('[AutoStart] Failed to set login item settings on startup:', err)
  }

  // Load tray icon from filesystem
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray-icon.png')
    : path.join(process.cwd(), 'build', 'icon.png')

  console.log(`[Tray] Loading icon from: ${iconPath}`)

  const trayIconSizePx = resolveTrayIconSizePx(process.platform)
  let trayIcon: import('electron').NativeImage
  if (existsSync(iconPath)) {
    trayIcon = nativeImage
      .createFromPath(iconPath)
      .resize({ width: trayIconSizePx, height: trayIconSizePx, quality: 'best' })
  } else {
    console.warn(`[Tray] Icon not found at ${iconPath}, falling back to buffer`)
    // Fallback to the same buffer if file is missing (though it shouldn't be with the build changes)
    const iconBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABDSURBVDhPY3hIQP8fxPj4+DAyAAgwMjIwMTExAAX+oxsA04DPwB+YQeQah24ATAMIAwxGAwQYGA0QYGA0QICB0QDBAEXoJ82qS6U/AAAAAElFTkSuQmCC',
      'base64'
    )
    trayIcon = nativeImage
      .createFromBuffer(iconBuffer)
      .resize({ width: trayIconSizePx, height: trayIconSizePx, quality: 'best' })
  }

  tray = new Tray(trayIcon)

  // E15-02: Initialize badge service — updates OS dock badge with missed reminder count
  // On Windows/Linux, also update the tray icon with a badge overlay.
  const baseTrayIcon = trayIcon

  const setTrayBadgeCallback =
    process.platform === 'win32' || process.platform === 'linux'
      ? (count: number) => {
          if (!tray) return
          tray.setImage(createTrayIconWithBadge(baseTrayIcon, count))
          tray.setToolTip(count > 0 ? `MAI Reminder (${count} missed)` : 'MAI Reminder')
        }
      : undefined

  badgeService = new MissedReminderBadgeService((count: number) => {
    // app.setBadgeCount is macOS / some Linux only; safe to call everywhere
    app.setBadgeCount(count)
  }, setTrayBadgeCallback)

  /** Helper: show (or re-create) main window and bring it to focus. */
  function showMainWindow(): void {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      // On Windows, a brief setAlwaysOnTop trick reliably brings the window
      // to the foreground when the app is in the background.
      if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true)
        mainWindow.focus()
        mainWindow.setAlwaysOnTop(false)
      } else {
        mainWindow.focus()
      }
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open MAI Reminder',
      click: () => showMainWindow(),
    },
    {
      // E15-02: Navigate directly to missed reminders (sent tab)
      label: 'View Missed Reminders',
      click: () => {
        showMainWindow()
        safeNavigateToSent(badgeService?.getMissedIds() || [])
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])
  tray?.setToolTip('MAI Reminder')
  tray?.setContextMenu(contextMenu)

  // E15-02: On tray left-click, navigate to the sent/missed tab *if* there are missed reminders
  tray?.on('click', () => {
    showMainWindow()
    const count = badgeService ? badgeService.getMissedCount() : 0
    console.log(`[Tray] click. badge count=${count}`)
    if (badgeService && count > 0) {
      const ids = badgeService.getMissedIds()
      console.log(`[Tray] navigating to sent with missedIds:`, ids)
      safeNavigateToSent(ids)
    }
  })
})

/** Helper: sending navigation event safely even if window is newly created / loading */
function safeNavigateToSent(missedIds?: string[]): void {
  console.log('[safeNavigateToSent] called with missedIds:', missedIds)
  if (!mainWindow) return
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('[safeNavigateToSent] send badge:navigate-sent (after load)')
      mainWindow?.webContents.send('badge:navigate-sent', missedIds)
    })
  } else {
    console.log('[safeNavigateToSent] send badge:navigate-sent (ready)')
    mainWindow.webContents.send('badge:navigate-sent', missedIds)
  }
}

// App lifecycle: activate — re-create window on macOS dock click
app.on('activate', () => {
  // On macOS, re-create or show window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else if (mainWindow) {
    // Show and focus the existing window
    mainWindow.show()
    mainWindow.focus()
  }

  // E15-02: If restored from dock and there are missed reminders, switch to Sent tab
  if (badgeService && badgeService.getMissedCount() > 0) {
    safeNavigateToSent(badgeService.getMissedIds())
  }
})

// App lifecycle: window-all-closed
app.on('window-all-closed', () => {
  // We keep the app running in the background (tray) on all platforms.
  // Do not call app.quit() here.
})

// App lifecycle: before-quit — close DB connection gracefully
app.on('before-quit', () => {
  isQuitting = true
  if (scheduler) {
    scheduler.stop()
  }
  if (db) {
    ;(closeDatabase as (db: unknown) => void)(db)
    db = null
  }
  // Unregister shortcuts on quit
  if (typeof unregisterGlobalShortcuts === 'function') {
    ;(unregisterGlobalShortcuts as () => void)()
  }
})
