import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useNetworkStatus } from '../src/composables/useNetworkStatus'
import * as useNotificationsModule from '../src/composables/useNotifications'

describe('useNetworkStatus', () => {
  let mockShowError: ReturnType<typeof vi.fn>
  let mockShowInfo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockShowError = vi.fn()
    mockShowInfo = vi.fn()

    vi.spyOn(useNotificationsModule, 'useNotifications').mockReturnValue({
      notifications: { value: [] } as unknown as ReturnType<
        typeof useNotificationsModule.useNotifications
      >['notifications'],
      showError: mockShowError,
      showInfo: mockShowInfo,
      dismiss: vi.fn(),
    })
  })

  let cleanupFn: () => void | undefined

  afterEach(() => {
    vi.restoreAllMocks()
    if (cleanupFn) cleanupFn()
  })

  it('shows offline error when offline event fires', () => {
    const result = useNetworkStatus()
    cleanupFn = result.cleanup

    // initially online
    expect(result.isOnline.value).toBe(true)

    // simulate offline
    window.dispatchEvent(new Event('offline'))

    expect(result.isOnline.value).toBe(false)
    expect(mockShowError).toHaveBeenCalledWith({
      kind: 'NetworkError',
      message: 'Device went offline',
    })
  })

  it('shows online info when online event fires after being offline', () => {
    const result = useNetworkStatus()
    cleanupFn = result.cleanup

    // simulate offline then online
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))

    expect(result.isOnline.value).toBe(true)
    expect(mockShowInfo).toHaveBeenCalledWith('errors.online')
  })
})
