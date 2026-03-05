const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['010', '010', '111', '010', '010'],
}

function setPixel(
  bitmap: Buffer,
  size: number,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number]
): void {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const idx = (y * size + x) * 4
  // Electron bitmap format is BGRA.
  bitmap[idx] = rgba[2]
  bitmap[idx + 1] = rgba[1]
  bitmap[idx + 2] = rgba[0]
  bitmap[idx + 3] = rgba[3]
}

function drawFilledCircle(
  bitmap: Buffer,
  size: number,
  cx: number,
  cy: number,
  radius: number,
  rgba: readonly [number, number, number, number]
): void {
  const r2 = radius * radius
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) {
        setPixel(bitmap, size, x, y, rgba)
      }
    }
  }
}

function drawGlyph(
  bitmap: Buffer,
  size: number,
  glyph: readonly string[],
  x: number,
  y: number,
  scale: number,
  rgba: readonly [number, number, number, number]
): void {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let col = 0; col < glyph[row].length; col += 1) {
      if (glyph[row][col] !== '1') continue
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          setPixel(bitmap, size, x + col * scale + dx, y + row * scale + dy, rgba)
        }
      }
    }
  }
}

export function resolveBadgeText(count: number, size: number): string {
  if (count <= 99) return String(count)
  return size <= 16 ? '99' : '99+'
}

function resolveTextScale(size: number, length: number): number {
  if (size >= 32) {
    if (length === 1) return 3
    if (length === 2) return 2
    return 1
  }
  if (length === 1) return 2
  return 1
}

function resolveBadgeRadius(size: number, length: number): number {
  if (length === 1) return Math.max(4, Math.round(size * 0.28))
  if (length === 2) return Math.max(5, Math.round(size * 0.34))
  return Math.max(6, Math.round(size * 0.4))
}

/**
 * Draw a red count badge directly on a raw BGRA bitmap.
 * This avoids SVG rasterization differences in Windows tray rendering.
 */
export function overlayCountBadgeOnBitmap(
  sourceBitmap: Buffer,
  size: number,
  count: number
): Buffer {
  const expectedLength = size * size * 4
  const bitmap = Buffer.from(sourceBitmap.subarray(0, expectedLength))

  if (bitmap.length < expectedLength || count <= 0) {
    return bitmap
  }

  const text = resolveBadgeText(count, size)
  const textScale = resolveTextScale(size, text.length)
  const radius = resolveBadgeRadius(size, text.length)
  const margin = size >= 32 ? 2 : 1
  const cx = size - radius - margin
  const cy = radius + margin
  const strokeWidth = size >= 32 ? 2 : 1

  drawFilledCircle(bitmap, size, cx, cy, radius, [255, 255, 255, 255])
  drawFilledCircle(bitmap, size, cx, cy, Math.max(1, radius - strokeWidth), [211, 47, 47, 255])

  const charW = 3 * textScale
  const charH = 5 * textScale
  const gap = Math.max(1, textScale)
  const textWidth = text.length * charW + (text.length - 1) * gap
  const startX = Math.round(cx - textWidth / 2)
  const startY = Math.round(cy - charH / 2)

  for (let i = 0; i < text.length; i += 1) {
    const glyph = GLYPHS[text[i]]
    if (!glyph) continue
    drawGlyph(
      bitmap,
      size,
      glyph,
      startX + i * (charW + gap),
      startY,
      textScale,
      [255, 255, 255, 255]
    )
  }

  return bitmap
}

/**
 * Windows tray uses higher effective DPI; render a larger source icon to keep
 * the badge readable before OS scaling.
 */
export function resolveTrayIconSizePx(platform: NodeJS.Platform): number {
  return platform === 'win32' ? 32 : 16
}
