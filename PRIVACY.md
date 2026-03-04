# Voice Input Privacy Policy

At **MAI Reminder**, user privacy and data minimization are foundational principles.

This document outlines the privacy guardrails established for the Voice Input feature to ensure your audio data remains secure and under your control.

## 1. Local Processing Only

The application relies exclusively on local Vosk model for desktop, and on device speech recognition for mobile.

- **No Remote Audio Transmission**: Audio is processed directly by your operating system. Mai Reminder never streams audio buffers to our servers or third-party APIs.
- Only the final **text transcription** is securely transmitted to the LLM (if AI parsing is enabled) solely for the purpose of extracting the reminder's title and scheduled time.

## 2. No Audio Persistence

We enforce strict limitations on how voice input is handled during the transcription lifecycle:

- **No Disk Writes**: Audio data (`Blob`, `ArrayBuffer`) is never cached or written to local disk or the SQLite database.
- **No LocalStorage**: Audio segments are not stored in `localStorage` or `sessionStorage`.

Your voice is yours. We only care about ensuring you never forget your next reminder.

## 3. Anonymous users in cloud database

When cloud sync is enabled, users are not required to provide any personal information. The application generates a unique identifier for each user, which is used to store and retrieve reminders from the cloud database. This identifier is not linked to any personal information and cannot be used to identify the user.

## 4. End to end encryption

Reminders are encrypted with a randomly generated key that is stored in the user's device. Reminder data in the cloud is encrypted with the user's device key. This means that even if the cloud database is compromised, the user's data will remain secure.
