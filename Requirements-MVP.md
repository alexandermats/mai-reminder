# Reminder App MVP – Requirements

## 1. Scope

MVP for a **privacy-first, local‑first, multilingual reminder app** with:

- Natural‑language reminder creation (text + voice)
- Offline operation
- Single shared codebase
- Desktop-first support via **Electron** (macOS, Windows)
- Mobile support via **Capacitor** in MVP Phase 2
- No backend (except LLM API)

---

## 2. Supported Platforms

| Platform | Runtime           |
| -------- | ----------------- |
| iOS      | Ionic + Capacitor |
| Android  | Ionic + Capacitor |
| macOS    | Electron          |
| Windows  | Electron          |

---

## 3. Tech Stack

### 3.1 App

- Ionic Framework + Vue 3
- TypeScript
- Vite
- Pinia
- Vue Router
- vue‑i18n

### 3.1.1 Date/Time Parsing Library

- `chrono-node` (JavaScript)
- Locales: English and Russian
- Used as local parser when LLM parsing is disabled or unavailable

### 3.2 Desktop

- Electron
- electron‑builder
- IPC via `contextBridge`

### 3.3 Storage

| Platform | Storage            |
| -------- | ------------------ |
| Mobile   | SQLite (Capacitor) |
| Desktop  | SQLite (Node)      |

### 3.4 Notifications

| Platform      | Mechanism                     |
| ------------- | ----------------------------- |
| iOS / Android | Capacitor Local Notifications |
| Electron      | `electron.Notification`       |

---

## 4. Languages

### 4.1 Supported (MVP)

- English (`en`)
- Russian (`ru`)

### 4.2 Localization

- UI text localized via `vue‑i18n`
- Language selection:
  - Device default
  - Manual override

---

## 5. Input

### 5.1 Text Input

- Accept natural language in supported languages

### 5.2 Voice Input

- Vosk (local) for Desktop and Mobile Apps
- Recognition language bound to app language
- Audio not stored or transmitted

### 5.3 MVP UX Direction

- Modern, minimal UI
- Primary view: reminder list with quick-add input, secondary view: calendar
- Reminder create/edit modal with date/time confirmation if parsing is not confident

---

## 6. NLP & Parsing

### 6.1 Local JS Parsing (Primary)

- `chrono-node` used for local date/time parsing
- Triggered when:
  - LLM mode is turned off by user setting
  - LLM backend is unavailable
  - LLM request is rate limited or fails

### 6.2 LLM Parsing (Secondary)

- LLM: GPT‑OSS‑120B (Cerebras)
- Turned off by default
- JSON‑only response
- Expected fields: title + scheduled time, recurrence info

---

## 7. Reminder Engine

### 7.1 Capabilities

- Create / edit / delete reminders
- One-time reminders
- Recurring reminders (daily/weekly/monthly and RRULE)
- Timezone‑aware
- Togglable Calendar view for macro organization
- Fast-save bypass for confident natural language parses
- Lifecycle status tracking (pending, sent, cancelled) and filtering

### 7.2 Scheduling

- Reminders survive app restarts

---

## 8. Offline Behavior

- Full functionality offline except LLM parsing

---

## 9. Security & Privacy

- All reminder data stored locally
- No voice audio persistence
- No user identifiers sent to LLM

---

## 10. Non‑Functional Requirements

- Local parsing latency < 500ms
- LLM parsing < 3s (network dependent)
- Notifications must fire when app UI is closed

---

## 11. Architecture Constraints

- Single shared Vue codebase
- Platform‑specific adapters for:
  - Notifications
  - Storage
  - Background scheduling
- No user accounts in MVP
- No cloud sync in MVP

---

## 12. Acceptance Criteria

- Text reminders in EN/RU
- Voice reminders in EN/RU
- Offline reminders fire reliably
- LLM parsing is configurable by providing API key
- Automatic fallback to local parser on LLM outage/rate limit
- Reminders work with app in tray / background
