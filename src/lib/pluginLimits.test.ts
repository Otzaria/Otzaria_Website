import { describe, it, expect } from 'vitest'
import {
  MAX_PLUGIN_BYTES,
  MAX_IMAGE_BYTES,
  MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOTS,
  ALLOWED_IMAGE_MIMES
} from './pluginLimits'

// אלה הערכים היחידים שהלקוח (דף העלאת תוסף) והשרת (pluginStorage.js,
// upload/route.js) משתמשים בהם לצורך אכיפת/הצגת מגבלות — בדיקה שהם לא
// ישתנו בטעות בלי שים לב (למשל סדר גודל שגוי).
describe('pluginLimits', () => {
  it('caps plugin files at 50MB and images at 5MB', () => {
    expect(MAX_PLUGIN_BYTES).toBe(50 * 1024 * 1024)
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024)
    expect(MAX_SCREENSHOT_BYTES).toBe(5 * 1024 * 1024)
  })

  it('allows at most 10 screenshots', () => {
    expect(MAX_SCREENSHOTS).toBe(10)
  })

  it('only allows the 4 known raster image mime types', () => {
    expect(ALLOWED_IMAGE_MIMES).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  })
})
