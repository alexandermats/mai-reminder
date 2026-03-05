/**
 * Build an SVG payload for a tray icon with a count badge in the top-right corner.
 * Kept pure so it can be unit-tested without Electron runtime dependencies.
 */
export function buildTrayBadgeSvg(baseIconDataUrl: string, size: number, count: number): string {
  const displayText = count > 99 ? '99+' : String(count)
  const largeCount = count > 9
  const badgeRadius = count > 99 ? Math.round(size * 0.34) : Math.round(size * 0.28)
  const margin = Math.max(1, Math.round(size * 0.06))
  const centerX = size - badgeRadius - margin
  const centerY = badgeRadius + margin
  const fontSize = largeCount
    ? Math.max(7, Math.round(size * 0.24))
    : Math.max(8, Math.round(size * 0.3))
  const strokeWidth = Math.max(1, Math.round(size * 0.08))

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<image href="${baseIconDataUrl}" xlink:href="${baseIconDataUrl}" width="${size}" height="${size}" x="0" y="0"/>`,
    `<circle cx="${centerX}" cy="${centerY}" r="${badgeRadius}" fill="#d32f2f" stroke="#ffffff" stroke-width="${strokeWidth}"/>`,
    `<text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI,Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${displayText}</text>`,
    '</svg>',
  ].join('')
}

/**
 * Windows tray uses higher effective DPI; render a larger source icon to keep
 * the badge readable before OS scaling.
 */
export function resolveTrayIconSizePx(platform: NodeJS.Platform): number {
  return platform === 'win32' ? 32 : 16
}
