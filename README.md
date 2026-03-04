# mai-reminder

A privacy-first, local‑first, multilingual reminder app MVP featuring natural language parsing.

## 🚀 Features

- **Natural Language Input:** Create reminders by typing naturally using everyday language.
- **AI-Powered Parsing:** Uses Cerebras LLM to parse your text (if enabled), with a graceful fallback to a local timezone-aware parser (`chrono-node`) when offline or rate-limited.
- **Multilingual Support:** English (`en`) and Russian (`ru`) natively supported via `vue-i18n`.
- **Local-First:** All reminder data is stored locally in a file-based SQLite database. No cloud sync.
- **Offline Capable:** Full core functionality remains available when offline.
- **Cross-Platform:** Desktop-first via Electron, with an architecture designed for future mobile support via Capacitor. Built with Ionic Framework + Vue 3.

## 🛠 Tech Stack

- **Frontend:** Ionic Framework + Vue 3 (Composition API), Vite, Pinia, Vue Router
- **Desktop:** Electron, electron-builder, IPC via `contextBridge`
- **Mobile:** Capacitor
- **Database:** SQLite (Node.js) via `better-sqlite3`
- **Automated Testing:** Vitest (Unit/Component) + Playwright (E2E)

## 📦 Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation

1. Clone the repository and navigate into the project directory
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables (optional, for LLM parsing):
   Create a `.env` file referencing `.env.example` and add your Cerebras API key.
4. Run the development server (browser preview):
   ```bash
   npm run dev
   ```
5. Or, run the Electron desktop application:
   ```bash
   npm start
   ```

### 📦 Building from Command Line

#### macOS (Desktop)

To build and package the Electron application for macOS:

```bash
npm run dist
```

The packaged application (e.g., `.dmg`) will be available in the `release/` directory.

#### Android (Mobile)

To build the Android application without opening Android Studio:

1. **Prepare and sync assets:**
   ```bash
   npm run build:mobile
   ```
2. **Build the APK (Debug):**

   ```bash
   cd android && ./gradlew assembleDebug
   ```

   The generated APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`.

3. **Install on device (via ADB):**
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

### 📱 Rebuild and Run in Android Studio

1. **Prepare the build:**
   Compile the web assets and synchronize them with the Android project:
   ```bash
   npm run build:mobile
   ```
2. **Open in Android Studio:**
   Launch Android Studio with the Android project pre-loaded:
   ```bash
   npx cap open android
   ```
3. **Run the application:**
   - Wait for Android Studio to finish the Gradle sync.
   - Select your emulator or a connected physical device from the target selector.
   - Click the **Run** button (green play icon) or press `Control + R`.

> [!NOTE]
> If you make changes to the Vue components or business logic, you must run `npm run build:mobile` again to see those changes in the Android app.

### Running Native Tests in Android Studio

1. **Open the project in Android Studio** (see above).
2. **Locate the tests:**
   - In the **Project** tool window, change the view to **Android**.
   - Navigate to `app` > `java` > `com.alexandermats.mai_reminder (androidTest)`.
3. **Run tests:**
   - Right-click on a test class (e.g., `MainActivityTest`) or the entire folder.
   - Select **Run 'Tests in ...'**.
   - Monitor the results in the **Run** and **Logcat** tabs at the bottom.

> [!TIP]
> You can also run all Android instrumentation tests from the command line using `npm run test:android:e2e`.

## ✅ Code Quality & Testing

This project enforces strict quality gates on every commit:

- **Linting:** `npm run lint` (ESLint + Prettier)
- **Type Checking:** `npm run typecheck` (TypeScript)
- **Unit & Component Testing:** `npm run test` (Vitest + Vue Test Utils)
- **Performance Testing:** `npm run test:perf` (Vitest benchmarks)
- **End-to-End Testing (Electron):** `npm run test:e2e:electron` (Native Electron Playwright)
- **End-to-End Testing (Android):** `npm run test:android:e2e` (Espresso/UIAutomator, includes voice reliability checks)

### Android E2E Prerequisites

- Android SDK with `adb`, `emulator`, and API 36 system image installed
- Running emulator/device with microphone support (recommended: `Medium_Phone_API_36.1`)
- `RECORD_AUDIO` permission dialogs enabled (do not pre-disable permission prompts globally)
- Stable runtime for voice tests:
  - Disable host audio muting for emulator
  - Wait for full boot completion before running `npm run test:android:e2e`

## ❓ Troubleshooting

### SQLite Version Mismatch

If you see errors related to `better-sqlite3` or SQLite versions, run:

```bash
npm run rebuild
```

### Clear local DB

Bundled app:
rm -rf "$HOME/Library/Application Support/Mai Reminder"

Dev:
rm -rf "$HOME/Library/Application Support/Electron"
