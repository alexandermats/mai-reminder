import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
// 1. Only import the TypeScript types here so they get erased during compilation
import type { Model, Recognizer } from 'vosk-koffi'

// 2. Load Koffi FIRST using require() to prevent TypeScript hoisting
const koffi = require('koffi')

// 3. Intercept Koffi's OS-level load command to fix the Windows ASAR bug
const originalKoffiLoad = koffi.load

koffi.load = function (libPath: string) {
  // If the path points inside the ASAR archive, redirect it to the physical unpacked folder
  if (libPath && libPath.includes('app.asar')) {
    libPath = libPath.replace('app.asar', 'app.asar.unpacked')
    // Optional: Keep this log temporarily to verify it's working on Windows
    // console.log('[Koffi Patch] Redirected native library path:', libPath)
  }
  return originalKoffiLoad.apply(this, [libPath])
}

// 4. NOW it is safe to load vosk-koffi
const vosk = require('vosk-koffi')

let modelEn: Model | null = null
let modelRu: Model | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let recognizer: Recognizer<any> | null = null

export function initVosk(modelsPath: string) {
  try {
    vosk.setLogLevel(-1) // Silence logs

    const modelPathEn = path.join(modelsPath, 'vosk-model')
    if (!fs.existsSync(modelPathEn)) {
      console.warn(
        `[Vosk] English Model not found at ${modelPathEn}. English voice recognition will not work.`
      )
    } else {
      modelEn = new vosk.Model(modelPathEn)
      console.log(`[Vosk] English Model loaded successfully from ${modelPathEn}`)
    }

    const modelPathRu = path.join(modelsPath, 'vosk-model-ru')
    if (!fs.existsSync(modelPathRu)) {
      console.warn(
        `[Vosk] Russian Model not found at ${modelPathRu}. Russian voice recognition will not work.`
      )
    } else {
      modelRu = new vosk.Model(modelPathRu)
      console.log(`[Vosk] Russian Model loaded successfully from ${modelPathRu}`)
    }
  } catch (err) {
    console.error('[Vosk] Failed to initialize model:', err)
  }
}

export function registerVoiceHandlers() {
  ipcMain.on('voice-start', (_event, lang?: string) => {
    const selectedModel = lang === 'ru' ? modelRu : modelEn
    if (!selectedModel) {
      console.error(`[Vosk] Cannot start, model for language ${lang || 'en'} not loaded`)
      return
    }
    if (recognizer) {
      try {
        recognizer.free()
      } catch {
        /* ignore */
      }
    }
    recognizer = new vosk.Recognizer({ model: selectedModel, sampleRate: 16000 })
  })

  ipcMain.on('voice-audio-chunk', (event, arrayBuffer) => {
    if (!recognizer) return

    try {
      const buffer = Buffer.from(arrayBuffer)

      const isSilence = recognizer.acceptWaveform(buffer)

      if (isSilence) {
        const resStr = recognizer.resultString()
        if (resStr) {
          const res = JSON.parse(resStr)
          if (res.text) event.sender.send('voice-final', res.text)
        }
      } else {
        const partial = recognizer.partialResult()
        if (partial && partial.partial) {
          event.sender.send('voice-partial', partial.partial)
        }
      }
    } catch (err) {
      console.error('[Vosk] Error processing chunk:', err)
    }
  })

  ipcMain.on('voice-stop', (event) => {
    if (!recognizer) return

    try {
      const resStr = recognizer.resultString() // final bits
      let finalText = ''
      if (resStr) {
        const res = JSON.parse(resStr)
        finalText = res.text || ''
      }
      if (!finalText) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const finalRes = recognizer.finalResult() as any
        if (finalRes && finalRes.text) finalText = finalRes.text
        else if (finalRes && finalRes.alternatives && finalRes.alternatives[0]) {
          finalText = finalRes.alternatives[0].text
        }
      }
      event.sender.send('voice-final', finalText || '')
    } catch (err) {
      console.error('[Vosk] Error getting final result:', err)
      event.sender.send('voice-final', '')
    } finally {
      try {
        recognizer.free()
      } catch {
        /* ignore */
      }
      recognizer = null
    }
  })
}
