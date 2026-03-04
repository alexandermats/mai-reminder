import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useNotifications } from '../src/composables/useNotifications'
import type { NetworkError, TimeoutError, ParseFailureError } from '../src/parser/types'

describe('useNotifications composable (E3-06)', () => {
  let notificationsApi: ReturnType<typeof useNotifications>

  beforeEach(() => {
    vi.useFakeTimers()
    notificationsApi = useNotifications()
    // Clear notifications before each test
    notificationsApi.notifications.value = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds an offline notification for NetworkError', () => {
    const error: NetworkError = { kind: 'NetworkError', message: 'Failed to fetch' }
    notificationsApi.showError(error)

    expect(notificationsApi.notifications.value).toHaveLength(1)
    expect(notificationsApi.notifications.value[0]).toMatchObject({
      type: 'offline',
      messageKey: 'errors.offline',
    })
  })

  it('adds a rate-limit notification for TimeoutError', () => {
    const error: TimeoutError = { kind: 'TimeoutError', message: 'Timeout', timeoutMs: 5000 }
    notificationsApi.showError(error)

    expect(notificationsApi.notifications.value).toHaveLength(1)
    expect(notificationsApi.notifications.value[0]).toMatchObject({
      type: 'rate-limit',
      messageKey: 'errors.rateLimit',
    })
  })

  it('adds a parse-failure notification for ParseFailureError', () => {
    const error: ParseFailureError = {
      kind: 'ParseFailureError',
      message: 'Failed',
      reason: 'Unrecognized',
    }
    notificationsApi.showError(error)

    expect(notificationsApi.notifications.value).toHaveLength(1)
    expect(notificationsApi.notifications.value[0]).toMatchObject({
      type: 'parse-failure',
      messageKey: 'errors.parseFailure',
    })
  })

  it('adds a general notification for standard Error', () => {
    const error = new Error('Something went wrong')
    notificationsApi.showError(error)

    expect(notificationsApi.notifications.value).toHaveLength(1)
    expect(notificationsApi.notifications.value[0]).toMatchObject({
      type: 'general',
      messageKey: 'errors.general',
    })
  })

  it('adds an info notification with showInfo', () => {
    notificationsApi.showInfo('app.customInfo')

    expect(notificationsApi.notifications.value).toHaveLength(1)
    expect(notificationsApi.notifications.value[0]).toMatchObject({
      type: 'info',
      messageKey: 'app.customInfo',
    })
  })

  it('allows manual dismissal', () => {
    notificationsApi.showError(new Error('Test 1'))
    notificationsApi.showError(new Error('Test 2'))
    expect(notificationsApi.notifications.value).toHaveLength(2)

    const firstId = notificationsApi.notifications.value[0].id
    notificationsApi.dismiss(firstId)

    expect(notificationsApi.notifications.value).toHaveLength(1)
    expect(notificationsApi.notifications.value[0].id).not.toBe(firstId)
  })
})
