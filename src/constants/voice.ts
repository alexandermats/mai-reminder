/**
 * Shared voice recognition constants.
 *
 * These values are used by both the Electron and Capacitor voice recorders
 * so that the same defaults are applied on all platforms.
 */

/**
 * Default number of milliseconds of silence after the last detected speech
 * before the recognizer considers the utterance complete.
 *
 * Raised from the old hard-coded 1 600 ms to 2 000 ms to give users more
 * time for natural mid-sentence pauses.
 */
export const DEFAULT_SILENCE_TIMEOUT_MS = 2000
