#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const buildGradlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capacitor-community',
  'sqlite',
  'android',
  'build.gradle'
)

if (!fs.existsSync(buildGradlePath)) {
  console.warn('capacitor-community/sqlite android build.gradle not found at', buildGradlePath)
  process.exit(0)
}

const desiredLine =
  "proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'"
const fileContent = fs.readFileSync(buildGradlePath, 'utf8')

if (fileContent.includes(desiredLine)) {
  process.exit(0)
}

const updated = fileContent.replace(
  /(\s*)proguardFiles.*'proguard-rules\.pro'/,
  (_, indent) => `${indent}${desiredLine}`
)

if (updated === fileContent) {
  console.warn('Unable to replace proguard line in', buildGradlePath)
  process.exit(0)
}

fs.writeFileSync(buildGradlePath, updated)
console.log('Patched capacitor-community/sqlite to use proguard-android-optimize.txt')
